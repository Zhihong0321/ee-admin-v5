"use server";

/**
 * ============================================================================
 * LINK RESTORATION OPERATIONS
 * ============================================================================
 *
 * Post-sync link restoration operations to fix missing or broken references
 * between invoices, SEDA registrations, and customers.
 *
 * Functions:
 * - restoreInvoiceSedaLinks: Fix invoice.linked_seda_registration from SEDA.linked_invoice
 * - patchSedaCustomerLinks: Fix seda.linked_customer from invoice.linked_customer
 * - syncInvoiceItemLinks: Sync invoice items from Bubble
 *
 * File: src/app/sync/actions/link-restoration.ts
 */

import { db } from "@/lib/db";
import { invoices, sedaRegistration } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { eq, sql, and, isNotNull, isNull } from "drizzle-orm";

/**
 * ============================================================================
 * FUNCTION: restoreInvoiceSedaLinks
 * ============================================================================
 *
 * INTENT (What & Why):
 * Restore missing invoice.linked_seda_registration fields by reading from
 * SEDA.linked_invoice array. Previous sync operations populated SEDA's
 * linked_invoice array but didn't backfill the invoice reference.
 *
 * PROBLEM:
 * - SEDA has linked_invoice array: ["inv1", "inv2", "inv3"]
 * - Invoice.linked_seda_registration is NULL (missing back-reference)
 * - Need to restore the link from SEDA → Invoice
 *
 * INPUTS:
 * None (operates on all SEDA registrations with linked_invoice array)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   linked: number,
 *   skipped: number,
 *   notFound: number,
 *   total: number,
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Fetch all SEDA registrations with non-empty linked_invoice array
 * 2. For each SEDA:
 *    a. For each invoice ID in linked_invoice array:
 *       i. Fetch invoice by bubble_id
 *       ii. If invoice not found → Log error, continue
 *       iii. If invoice already linked to different SEDA → Log warning, continue
 *       iv. If invoice already linked to this SEDA → Skip
 *       v. Update invoice.linked_seda_registration = SEDA bubble_id
 * 3. Return statistics
 *
 * LINK RESTORATION LOGIC:
 * - One-to-many: One invoice → One SEDA
 * - SEDA.linked_invoice is array (can link multiple invoices)
 * - Invoice.linked_seda_registration is scalar (single SEDA reference)
 * - Direction: SEDA → Invoice (read from SEDA, write to Invoice)
 *
 * EDGE CASES:
 * - Invoice already linked to different SEDA → Skips (preserves existing link)
 * - Invoice not found → Logs error, continues (orphaned SEDA reference)
 * - SEDA has empty linked_invoice array → Skipped
 *
 * SIDE EFFECTS:
 * - Updates invoice.linked_seda_registration for all matched invoices
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: db.query.sedaRegistration, db.query.invoices, db.update(invoices)
 * - Used by: All sync operations (auto-patch after sync)
 */
export async function restoreInvoiceSedaLinks() {
  logSyncActivity(`Starting 'Restore Invoice-SEDA Links' job...`, 'INFO');

  try {
    // Get all SEDA registrations with linked_invoice array
    const sedaRegistrations = await db.select({
      seda_bubble_id: sedaRegistration.bubble_id,
      linked_invoices: sedaRegistration.linked_invoice,
    })
    .from(sedaRegistration)
    .where(
      and(
        isNotNull(sedaRegistration.linked_invoice),
        sql`array_length(${sedaRegistration.linked_invoice}, 1) > 0`
      )
    );

    logSyncActivity(`Found ${sedaRegistrations.length} SEDA registrations with linked invoices`, 'INFO');

    let linkedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

    for (const seda of sedaRegistrations) {
      if (!seda.linked_invoices || seda.linked_invoices.length === 0) {
        skippedCount++;
        continue;
      }

      // Process each invoice in the linked_invoice array
      for (const invoiceBubbleId of seda.linked_invoices) {
        try {
          // Find the invoice
          const invoice = await db.query.invoices.findFirst({
            where: eq(invoices.bubble_id, invoiceBubbleId as string),
          });

          if (!invoice) {
            logSyncActivity(`SEDA ${seda.seda_bubble_id}: Invoice ${invoiceBubbleId} not found`, 'ERROR');
            notFoundCount++;
            continue;
          }

          // Skip if already linked
          if (invoice.linked_seda_registration) {
            if (invoice.linked_seda_registration !== seda.seda_bubble_id) {
              logSyncActivity(`Invoice ${invoiceBubbleId}: Already linked to different SEDA (${invoice.linked_seda_registration}), skipping`, 'ERROR');
            } else {
              skippedCount++;
            }
            continue;
          }

          // Update the invoice with SEDA link
          await db.update(invoices)
            .set({ linked_seda_registration: seda.seda_bubble_id, updated_at: new Date() })
            .where(eq(invoices.id, invoice.id));

          linkedCount++;
          logSyncActivity(`Invoice ${invoiceBubbleId}: Linked to SEDA ${seda.seda_bubble_id}`, 'INFO');

        } catch (error) {
          logSyncActivity(`Error linking invoice ${invoiceBubbleId}: ${String(error)}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Invoice-SEDA link restoration complete: ${linkedCount} linked, ${skippedCount} skipped, ${notFoundCount} not found`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      linked: linkedCount,
      skipped: skippedCount,
      notFound: notFoundCount,
      total: sedaRegistrations.length,
      message: `Successfully linked ${linkedCount} invoices to their SEDA registrations.\n
      • Linked: ${linkedCount}
      • Skipped: ${skippedCount}
      • Not Found: ${notFoundCount}`
    };
  } catch (error) {
    logSyncActivity(`Restore SEDA Links CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: patchSedaCustomerLinks
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fix SEDA registrations with missing linked_customer by looking at their
 * linked invoice's customer. Invoice has linked_customer field that should
 * be copied to SEDA.linked_customer.
 *
 * PROBLEM:
 * - Invoice.linked_customer = "cust123"
 * - SEDA.linked_customer = NULL (missing)
 * - SEDA is linked to invoice via invoice.linked_seda_registration
 * - Need to copy customer from invoice to SEDA
 *
 * INPUTS:
 * None (operates on all SEDA registrations with missing linked_customer)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   patched: number,
 *   errors: number,
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Find SEDAs with missing linked_customer that have linked invoices
 * 2. For each SEDA:
 *    a. Fetch linked invoice (via invoice.linked_seda_registration)
 *    b. Extract invoice.linked_customer
 *    c. Update SEDA.linked_customer = invoice.linked_customer
 * 3. Return statistics
 *
 * PATCH STRATEGY:
 * - Query: SEDA JOIN Invoice ON invoice.linked_seda_registration = SEDA.bubble_id
 * - Filter: SEDA.linked_customer IS NULL AND invoice.linked_customer IS NOT NULL
 * - Update: SET SEDA.linked_customer = invoice.linked_customer
 *
 * EDGE CASES:
 * - No SEDAs need patching → Returns patched: 0
 * - Invoice has no customer → SEDA not patched (no customer to copy)
 * - Multiple SEDAs linked to same invoice → Each SEDA gets same customer
 *
 * SIDE EFFECTS:
 * - Updates seda.linked_customer for all matched SEDAs
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: db.query.sedaRegistration, db.query.invoices, db.update(sedaRegistration)
 * - Used by: All sync operations (auto-patch after sync)
 */
export async function patchSedaCustomerLinks() {
  logSyncActivity(`Starting 'Patch SEDA Customer Links' job...`, 'INFO');

  try {
    // Find SEDAs with missing linked_customer that have linked invoices
    const sedasNeedingPatch = await db
      .select({
        seda_bubble_id: sedaRegistration.bubble_id,
        seda_id: sedaRegistration.id,
      })
      .from(sedaRegistration)
      .innerJoin(invoices, eq(invoices.linked_seda_registration, sedaRegistration.bubble_id))
      .where(
        and(
          sql`${sedaRegistration.linked_customer} IS NULL OR ${sedaRegistration.linked_customer} = ''`,
          isNotNull(invoices.linked_customer)
        )
      );

    if (sedasNeedingPatch.length === 0) {
      logSyncActivity(`No SEDA registrations need customer link patching`, 'INFO');
      return { success: true, patched: 0, message: "No SEDA registrations need patching" };
    }

    logSyncActivity(`Found ${sedasNeedingPatch.length} SEDA registrations needing customer link`, 'INFO');

    let patchedCount = 0;
    const errors: string[] = [];

    // Update each SEDA with customer from its linked invoice
    for (const seda of sedasNeedingPatch) {
      try {
        // Get the customer from the linked invoice
        const invoiceWithCustomer = await db
          .select({
            linked_customer: invoices.linked_customer,
          })
          .from(invoices)
          .where(eq(invoices.linked_seda_registration, seda.seda_bubble_id!))
          .limit(1);

        if (invoiceWithCustomer.length > 0 && invoiceWithCustomer[0].linked_customer) {
          // Update the SEDA with the customer link
          await db
            .update(sedaRegistration)
            .set({ linked_customer: invoiceWithCustomer[0].linked_customer })
            .where(eq(sedaRegistration.id, seda.seda_id));

          patchedCount++;
          logSyncActivity(`Patched SEDA ${seda.seda_bubble_id} -> Customer ${invoiceWithCustomer[0].linked_customer}`, 'INFO');
        }
      } catch (err) {
        const errorMsg = `SEDA ${seda.seda_bubble_id}: ${err}`;
        errors.push(errorMsg);
        logSyncActivity(`Error patching SEDA: ${errorMsg}`, 'ERROR');
      }
    }

    logSyncActivity(`SEDA Customer Link Patch Complete: ${patchedCount} patched, ${errors.length} errors`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/seda");

    return {
      success: true,
      patched: patchedCount,
      errors: errors.length,
      message: `Patched ${patchedCount} SEDA registrations with customer links${errors.length > 0 ? `, ${errors.length} errors` : ''}`
    };
  } catch (error) {
    logSyncActivity(`Patch SEDA Customer Links CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: syncInvoiceItemLinks
 * ============================================================================
 *
 * INTENT (What & Why):
 * Dedicated sync for invoice items (line items) from Bubble to PostgreSQL.
 * This is a separate operation because invoice items have complex sync logic
 * and may need to be synced independently of full invoice sync.
 *
 * INPUTS:
 * @param dateFrom - ISO date string (optional): Start date filter for invoice created_date
 * @param dateTo - ISO date string (optional): End date filter
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   results: { updatedCount: number, totalItems: number, avgItemsPerInvoice: number, duration: number },
 *   error?: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Call internal API endpoint /api/sync/invoice-items
 * 2. API fetches invoice items from Bubble
 * 3. API updates invoice items in PostgreSQL
 * 4. Return sync statistics
 *
 * SYNC STRATEGY:
 * - Fetches invoice items from Bubble API
 * - Updates invoice items array in invoices table
 * - Filters by invoice created_date if dateFrom provided
 * - Calculates statistics (total items, avg items per invoice, duration)
 *
 * EDGE CASES:
 * - No invoices in date range → Returns updatedCount: 0
 * - API call fails → Returns success: false with error
 * - Date filter applies to invoice.created_date, not item timestamps
 *
 * SIDE EFFECTS:
 * - Updates invoice.items array for matched invoices
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: /api/sync/invoice-items internal API endpoint
 * - Used by: src/app/sync/page.tsx (Dedicated Invoice Item Sync button)
 */
export async function syncInvoiceItemLinks(dateFrom?: string, dateTo?: string) {
  logSyncActivity(`Starting DEDICATED Invoice Item Link Sync...`, 'INFO');
  if (dateFrom) {
    logSyncActivity(`Filter: invoices created ${dateFrom} to ${dateTo || 'present'}`, 'INFO');
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sync/invoice-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom, dateTo })
    });

    const result = await response.json();

    if (result.success) {
      logSyncActivity(`✓ Invoice Item Link Sync SUCCESS: ${result.results.updatedCount} invoices updated, ${result.results.totalItems} total items`, 'INFO');
      logSyncActivity(`Avg items per invoice: ${result.results.avgItemsPerInvoice}, Duration: ${result.results.duration}s`, 'INFO');
    } else {
      logSyncActivity(`✗ Invoice Item Link Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return result;
  } catch (error) {
    logSyncActivity(`Invoice Item Link Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
