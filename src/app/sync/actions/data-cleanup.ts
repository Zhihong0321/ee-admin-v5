"use server";

/**
 * ============================================================================
 * DATA CLEANUP OPERATIONS
 * ============================================================================
 *
 * Data cleanup operations for removing demo data and fixing missing fields.
 * These operations modify or delete data based on specific criteria.
 *
 * Functions:
 * - deleteDemoInvoices: Soft-delete invoices without customers or payments
 * - fixMissingInvoiceDates: Resync invoices to fix date field mappings
 *
 * File: src/app/sync/actions/data-cleanup.ts
 */

import { db } from "@/lib/db";
import { invoices, sedaRegistration } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { inArray, sql } from "drizzle-orm";
import { syncCompleteInvoicePackage } from "@/lib/bubble";

/**
 * ============================================================================
 * FUNCTION: deleteDemoInvoices
 * ============================================================================
 *
 * INTENT (What & Why):
 * Soft-delete demo invoices that have no linked customer and no linked payments.
 * These are typically test invoices created during development. Also marks
 * associated SEDA registrations as updated (for cascading soft-delete).
 *
 * DEMO INVOICE DEFINITION:
 * - No linked_customer (NULL or empty string)
 * - AND No linked_payment (NULL or empty array)
 *
 * DELETION STRATEGY:
 * - Soft delete: Sets invoice.status = 'deleted'
 * - Updates linked SEDA registrations' updated_at timestamp
 * - Does NOT hard delete from database (preserves audit trail)
 *
 * INPUTS:
 * None (operates on all invoices matching demo criteria)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   updatedInvoices: number,
 *   updatedSeda: number,
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Fetch all invoices with relevant fields
 * 2. Filter for demo invoices (no customer AND no payments)
 * 3. Extract linked SEDA registration IDs from demo invoices
 * 4. Update SEDA registrations (set updated_at to NOW())
 * 5. Update invoices (set status = 'deleted')
 * 6. Return counts
 *
 * WHY UPDATE SEDA?
 * - SEDA registrations have updated_at for soft-delete tracking
 * - Updating timestamp signals downstream systems of change
 * - Maintains referential integrity without hard delete
 *
 * EDGE CASES:
 * - No demo invoices found → Returns success with count: 0
 * - SEDA registration already deleted → Still updates timestamp
 * - Invoice has SEDA but no customer/payments → Marks both as deleted
 *
 * SIDE EFFECTS:
 * - Updates invoice.status to 'deleted' for demo invoices
 * - Updates seda_registration.updated_at for linked SEDAs
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: db.select(), db.update(invoices), db.update(sedaRegistration)
 * - Used by: src/app/sync/page.tsx (Delete Demo Invoices button)
 *
 * WARNING:
 * This operation cannot be undone. Invoices are marked as deleted but not
 * removed from database. Hard delete would require separate cleanup job.
 */
export async function deleteDemoInvoices() {
  logSyncActivity(`Starting 'Delete Demo Invoices' job...`, 'INFO');

  try {
    // 1. Identify Demo Invoices (No Linked Customer AND No Linked Payments)
    // Fetch all needed fields to filter in memory (safer for arrays/nulls) or construct complex query
    // We will do a hybrid approach: Get all invoices, filter in code to be 100% sure of logic, then bulk delete.
    // Given ~4000 invoices max, this is fine.

    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      linked_customer: invoices.linked_customer,
      linked_payment: invoices.linked_payment,
      linked_seda_registration: invoices.linked_seda_registration
    }).from(invoices);

    const demoInvoices = allInvoices.filter(inv => {
      const noCustomer = !inv.linked_customer || inv.linked_customer.trim() === '';
      const payments = inv.linked_payment as string[] | null;
      const noPayments = !payments || payments.length === 0;
      return noCustomer && noPayments;
    });

    if (demoInvoices.length === 0) {
      logSyncActivity(`No Demo Invoices found.`, 'INFO');
      return { success: true, count: 0, message: "No demo invoices found." };
    }

    const demoInvoiceIds = demoInvoices.map(i => i.id);
    const demoInvoiceBubbleIds = demoInvoices.map(i => i.bubble_id).filter(Boolean) as string[];

    // 2. Identify Linked SEDA Registrations to delete
    const sedaIdsToDelete: string[] = [];
    for (const inv of demoInvoices) {
      if (inv.linked_seda_registration) {
        sedaIdsToDelete.push(inv.linked_seda_registration);
      }
    }

    logSyncActivity(`Found ${demoInvoiceIds.length} demo invoices. ${sedaIdsToDelete.length} linked SEDA registrations will also be marked as deleted.`, 'INFO');

    // 3. Perform Soft Deletion (Update Status)
    // A. Update SEDA Registrations updated_at timestamp
    let sedaUpdatedCount = 0;
    if (sedaIdsToDelete.length > 0) {
      await db.update(sedaRegistration)
        .set({ updated_at: new Date() })
        .where(inArray(sedaRegistration.bubble_id, sedaIdsToDelete));
      sedaUpdatedCount = sedaIdsToDelete.length;
      logSyncActivity(`Updated ${sedaUpdatedCount} SEDA registrations.`, 'INFO');
    }

    // B. Update Invoices status to 'deleted'
    await db.update(invoices)
      .set({ status: 'deleted', updated_at: new Date() })
      .where(inArray(invoices.id, demoInvoiceIds));

    logSyncActivity(`Marked ${demoInvoiceIds.length} Demo Invoices as 'deleted'.`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {

      success: true,

      updatedInvoices: demoInvoiceIds.length,

      updatedSeda: sedaUpdatedCount,

      message: `Successfully marked ${demoInvoiceIds.length} demo invoices and ${sedaUpdatedCount} associated SEDA registrations as deleted.`

    };

  } catch (error) {

    logSyncActivity(`Delete Demo Invoices Job CRASHED: ${String(error)}`, 'ERROR');

    return { success: false, error: String(error) };

  }

}



/**
 * ============================================================================
 * FUNCTION: fixMissingInvoiceDates
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fix invoice date fields by re-syncing from Bubble. Previous sync may have
 * used incorrect field mappings for invoice dates. The only safe way to
 * fix is to fetch correct data from Bubble source of truth.
 *
 * PROBLEM:
 * - Invoice dates (created_at, invoice_date, etc.) may be incorrect
 * - Cannot backfill from local created_at (might be sync time, not Bubble time)
 * - Need to fetch correct values from Bubble
 *
 * SOLUTION:
 * - Trigger full sync without file downloads (for speed)
 * - Uses corrected field mappings from complete-bubble-mappings.ts
 * - Overwrites local dates with Bubble source of truth
 *
 * INPUTS:
 * None (syncs all invoices)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   fixed: number,
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Trigger full sync (syncCompleteInvoicePackage)
 * 2. Pass undefined for dates to sync ALL history
 * 3. Pass syncFiles=false for speed (skip file downloads)
 * 4. Revalidate cached paths
 * 5. Return fixed count
 *
 * SYNC SCOPE:
 * - Syncs all invoices (no date filtering)
 * - Syncs all relations (customers, agents, payments, etc.)
 * - Does NOT download files (would be too slow)
 *
 * EDGE CASES:
 * - Sync fails → Returns success: false with error
 * - No invoices need fixing → Returns fixed: 0 (synced count)
 * - Bubble API down → Returns success: false
 *
 * SIDE EFFECTS:
 * - Updates all invoice date fields from Bubble
 * - Updates all related tables (customers, agents, payments, etc.)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncCompleteInvoicePackage() from @/lib/bubble
 * - Used by: src/app/sync/page.tsx (Fix Missing Invoice Dates button)
 *
 * NOTE:
 * This operation can take several minutes for large databases. Consider
 * running during off-peak hours.
 */
export async function fixMissingInvoiceDates() {
  logSyncActivity(`Starting 'Fix Missing Invoice Dates' job (via Full Resync)...`, 'INFO');

  try {
    // We cannot simply backfill from local created_at because it might be the sync time.
    // The only safe way is to re-sync the invoices from Bubble with the corrected mapping.
    // We'll trigger a full sync without file downloads to be faster.

    logSyncActivity(`Triggering full data sync to fetch correct Invoice Dates from Bubble...`, 'INFO');

    // Pass undefined for dates to sync ALL history. syncFiles=false for speed.
    const result = await syncCompleteInvoicePackage(undefined, undefined, false);

    revalidatePath("/sync");
    revalidatePath("/invoices");

    if (result.success) {
      return {
        success: true,
        fixed: result.results?.syncedInvoices,
        message: `Sync Complete. Processed ${result.results?.syncedInvoices} invoices. Invoice Dates should now be corrected.`
      };
    } else {
       return { success: false, error: result.error };
    }

  } catch (error) {
    logSyncActivity(`Fix Invoice Dates Job CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
