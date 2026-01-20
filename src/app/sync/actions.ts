"use server";

import { db } from "@/lib/db";
import { invoices, payments, submitted_payments, agents, users, sedaRegistration, invoice_templates, customers } from "@/db/schema";
import { syncCompleteInvoicePackage, syncInvoicePackageWithRelations } from "@/lib/bubble";
import { syncInvoiceWithFullIntegrity, syncBatchInvoicesWithIntegrity } from "@/lib/integrity-sync";
import { revalidatePath } from "next/cache";
import { logSyncActivity, getLatestLogs, clearLogs } from "@/lib/logger";
import { eq, sql, and, or, isNull, isNotNull, inArray } from "drizzle-orm";
import { createProgressSession } from "@/lib/progress-tracker";
import { createSyncProgress } from "@/lib/sync-progress";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export async function runManualSync(dateFrom?: string, dateTo?: string, syncFiles = false, sessionId?: string) {
  logSyncActivity(`Manual Sync Triggered: ${dateFrom || 'All'} to ${dateTo || 'All'}, syncFiles: ${syncFiles}`, 'INFO');

  try {
    const result = await syncCompleteInvoicePackage(dateFrom, dateTo, syncFiles, sessionId);

    if (result.success) {
      logSyncActivity(`Manual Sync SUCCESS: ${result.results?.syncedInvoices} invoices, ${result.results?.syncedCustomers} customers`, 'INFO');

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`Manual Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return result;
  } catch (error) {
    logSyncActivity(`Manual Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

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

    

    export async function patchInvoiceCreators() {
  logSyncActivity(`Starting 'Patch Invoice Creators' job...`, 'INFO');
  
  try {
    // 1. Get stats before we start
    const allNullCreatedBy = await db.select().from(invoices).where(isNull(invoices.created_by));
    const totalNulls = allNullCreatedBy.length;
    
    if (totalNulls === 0) {
      logSyncActivity(`No invoices found with created_by = NULL.`, 'INFO');
      return { success: true, fixed: 0, unfixable: 0, total_nulls: 0, message: "No invoices need patching." };
    }

    logSyncActivity(`Found ${totalNulls} invoices with created_by = NULL. Analyzing...`, 'INFO');

    let fixedCount = 0;
    let unfixableCount = 0; // linked_agent is null
    let agentNoUserCount = 0; // linked_agent exists but no user found

    // 2. Find invoices that CAN be fixed (have linked_agent)
    const fixableInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      linked_agent: invoices.linked_agent,
    })
    .from(invoices)
    .where(and(isNull(invoices.created_by), isNotNull(invoices.linked_agent)));

    // 3. Process fixable invoices
    for (const inv of fixableInvoices) {
      if (!inv.linked_agent) continue;

      // Find the agent
      const agent = await db.query.agents.findFirst({
        where: eq(agents.bubble_id, inv.linked_agent)
      });

      if (agent && agent.bubble_id) {
        // Find the user linked to this agent
        // User table has `linked_agent_profile` which points to agent.bubble_id
        const user = await db.query.users.findFirst({
          where: eq(users.linked_agent_profile, agent.bubble_id)
        });

        if (user && user.bubble_id) {
          // UPDATE the invoice
          await db.update(invoices)
            .set({ created_by: user.bubble_id })
            .where(eq(invoices.id, inv.id));
          
          fixedCount++;
          logSyncActivity(`Fixed Invoice ${inv.bubble_id}: Set created_by = ${user.bubble_id} (Agent: ${agent.name})`, 'INFO');
        } else {
          agentNoUserCount++;
          logSyncActivity(`WARNING: Skipped Invoice ${inv.bubble_id}: Agent ${agent.name} has no linked User account.`, 'ERROR');
        }
      } else {
        // Agent ID exists in invoice but not in Agent table?!
         logSyncActivity(`WARNING: Skipped Invoice ${inv.bubble_id}: Linked Agent ID ${inv.linked_agent} not found in DB.`, 'ERROR');
         agentNoUserCount++;
      }
    }

    // 4. Count truly unfixable (no linked_agent)
    const orphanedInvoices = await db.select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(and(isNull(invoices.created_by), isNull(invoices.linked_agent)));
    
    unfixableCount = Number(orphanedInvoices[0].count);

    logSyncActivity(`Patch Job Complete. Fixed: ${fixedCount}. Unfixable (No Agent): ${unfixableCount}. Agent w/o User: ${agentNoUserCount}.`, 'INFO');
    
    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      fixed: fixedCount,
      unfixable: unfixableCount,
      agent_no_user: agentNoUserCount,
      total_nulls: totalNulls,
      message: `Fixed ${fixedCount} invoices. ${unfixableCount} have no agent. ${agentNoUserCount} have agent but no user.`
    };

  } catch (error) {
    logSyncActivity(`Patch Job CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

export async function runIncrementalSync() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return await runManualSync(yesterday, undefined, true);
}

export async function fetchSyncLogs() {
  return getLatestLogs(100);
}

/**
 * Start a manual sync with progress tracking
 * Returns a sessionId that can be used to track progress via SSE
 */
export async function startManualSyncWithProgress(dateFrom?: string, dateTo?: string, syncFiles = false) {
  const sessionId = randomUUID();
  createProgressSession(sessionId);

  // Run sync in background
  runManualSync(dateFrom, dateTo, syncFiles, sessionId).catch((error) => {
    logSyncActivity(`Background Sync Error: ${String(error)}`, 'ERROR');
  });

  return { success: true, sessionId };
}

export async function updateInvoicePaymentPercentages() {
  logSyncActivity(`Starting update of invoice payment percentages...`, 'INFO');

  try {
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      total_amount: invoices.total_amount,
      linked_payment: invoices.linked_payment,
    })
    .from(invoices)
    .where(sql`${invoices.total_amount} IS NOT NULL AND ${invoices.total_amount} > 0`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const invoice of allInvoices) {
      if (!invoice.linked_payment || invoice.linked_payment.length === 0) {
        skippedCount++;
        continue;
      }

      const totalAmount = parseFloat(invoice.total_amount || '0');
      if (totalAmount <= 0) {
        skippedCount++;
        continue;
      }

      let totalPaid = 0;

      for (const paymentBubbleId of invoice.linked_payment) {
        const payment = await db.query.payments.findFirst({
          where: eq(payments.bubble_id, paymentBubbleId),
        });

        const submittedPayment = await db.query.submitted_payments.findFirst({
          where: eq(submitted_payments.bubble_id, paymentBubbleId),
        });

        if (payment && payment.amount) {
          totalPaid += parseFloat(payment.amount);
        } else if (submittedPayment && submittedPayment.amount) {
          totalPaid += parseFloat(submittedPayment.amount);
        }
      }

      const percentage = (totalPaid / totalAmount) * 100;

      await db.execute(sql`
        UPDATE invoice
        SET percent_of_total_amount = ${percentage}, updated_at = NOW()
        WHERE id = ${invoice.id}
      `);

      updatedCount++;
      logSyncActivity(`Updated invoice ${invoice.bubble_id}: ${percentage.toFixed(2)}% paid (${totalPaid}/${totalAmount})`, 'INFO');
    }

    logSyncActivity(`Payment percentage update complete: ${updatedCount} updated, ${skippedCount} skipped`, 'INFO');

    revalidatePath("/invoices");

    return {
      success: true,
      updated: updatedCount,
      skipped: skippedCount,
      message: `Updated ${updatedCount} invoices, skipped ${skippedCount} invoices without payments.`
    };
  } catch (error) {
    logSyncActivity(`Payment percentage update CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Update Invoice Statuses based on Payment and SEDA status
 *
 * Logic:
 * 1. No payment AND no SEDA form → 'draft'
 * 2. Payment percent < 50% → 'DEPOSIT'
 * 3. SEDA form status = 'APPROVED' → 'SEDA APPROVED'
 * 4. Payment is full (100%) → 'FULLY PAID'
 */
export async function updateInvoiceStatuses() {
  logSyncActivity(`Starting 'Update Invoice Statuses' job...`, 'INFO');

  try {
    // Get all invoices that are not deleted
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      total_amount: invoices.total_amount,
      linked_payment: invoices.linked_payment,
      linked_seda_registration: invoices.linked_seda_registration,
      current_status: invoices.status,
    })
    .from(invoices)
    .where(sql`${invoices.status} != 'deleted'`);

    logSyncActivity(`Processing ${allInvoices.length} invoices...`, 'INFO');

    let updatedCount = 0;
    const statusChanges = {
      draft: 0,
      deposit: 0,
      seda_approved: 0,
      fully_paid: 0,
      other: 0
    };

    for (const invoice of allInvoices) {
      // Calculate total paid
      let totalPaid = 0;
      if (invoice.linked_payment && invoice.linked_payment.length > 0) {
        for (const paymentBubbleId of invoice.linked_payment) {
          const payment = await db.query.payments.findFirst({
            where: eq(payments.bubble_id, paymentBubbleId),
          });

          const submittedPayment = await db.query.submitted_payments.findFirst({
            where: eq(submitted_payments.bubble_id, paymentBubbleId),
          });

          if (payment && payment.amount) {
            totalPaid += parseFloat(payment.amount || '0');
          } else if (submittedPayment && submittedPayment.amount) {
            totalPaid += parseFloat(submittedPayment.amount || '0');
          }
        }
      }

      // Get SEDA registration status
      let sedaStatus = null;
      if (invoice.linked_seda_registration) {
        const seda = await db.query.sedaRegistration.findFirst({
          where: eq(sedaRegistration.bubble_id, invoice.linked_seda_registration),
        });
        sedaStatus = seda?.seda_status;
      }

      // Determine new status based on business logic
      let newStatus = invoice.current_status;
      const totalAmount = parseFloat(invoice.total_amount || '0');
      const paymentPercent = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;

      // Priority 1: SEDA APPROVED (if SEDA is approved)
      if (sedaStatus && (sedaStatus.toUpperCase() === 'APPROVED' || sedaStatus.toUpperCase() === 'Approved')) {
        newStatus = 'SEDA APPROVED';
      }
      // Priority 2: FULLY PAID (100% payment)
      else if (paymentPercent >= 99.9) {
        newStatus = 'FULLY PAID';
      }
      // Priority 3: DEPOSIT (< 50% payment)
      else if (paymentPercent > 0 && paymentPercent < 50) {
        newStatus = 'DEPOSIT';
      }
      // Priority 4: DRAFT (no payment and no SEDA)
      else if (paymentPercent === 0 && !sedaStatus) {
        newStatus = 'draft';
      }

      // Update if status changed
      if (newStatus !== invoice.current_status) {
        await db.update(invoices)
          .set({ status: newStatus, updated_at: new Date() })
          .where(eq(invoices.id, invoice.id));

        updatedCount++;
        logSyncActivity(`Invoice ${invoice.bubble_id}: '${invoice.current_status}' → '${newStatus}' (${paymentPercent.toFixed(1)}% paid, SEDA: ${sedaStatus || 'none'})`, 'INFO');

        // Track counts
        switch (newStatus) {
          case 'draft':
            statusChanges.draft++;
            break;
          case 'DEPOSIT':
            statusChanges.deposit++;
            break;
          case 'SEDA APPROVED':
            statusChanges.seda_approved++;
            break;
          case 'FULLY PAID':
            statusChanges.fully_paid++;
            break;
          default:
            statusChanges.other++;
        }
      }
    }

    logSyncActivity(`Invoice status update complete: ${updatedCount} updated`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      updated: updatedCount,
      processed: allInvoices.length,
      changes: statusChanges,
      message: `Updated ${updatedCount} invoice statuses.\n
      • Draft: ${statusChanges.draft}
      • Deposit: ${statusChanges.deposit}
      • SEDA Approved: ${statusChanges.seda_approved}
      • Fully Paid: ${statusChanges.fully_paid}`
    };
  } catch (error) {
    logSyncActivity(`Invoice Status Update CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Restore Invoice-SEDA Links
 *
 * Scans SEDA registrations for linked_invoice array and updates
 * invoice.linked_seda_registration to restore the missing links.
 *
 * This fixes the issue where sync didn't populate invoice.linked_seda_registration
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
 * Full Invoice Sync with Date Range
 *
 * This is a NEW sync method that:
 * 1. Syncs invoices within a specified date range (from -> to)
 * 2. For each invoice, syncs ALL its relational data (customer, agent, payments, SEDA, items)
 * 3. Does NOT download files (user will handle file migration separately)
 *
 * Key differences from syncCompleteInvoicePackage:
 * - Filters by invoice date range (dateFrom to dateTo)
 * - Directly queries related tables by Bubble ID for each invoice
 * - Ensures all relational data is synced for the filtered invoices
 * - Skips file downloads entirely
 */
export async function runFullInvoiceSync(dateFrom: string, dateTo?: string, sessionId?: string) {
  logSyncActivity(`Full Invoice Sync: ${dateFrom} to ${dateTo || 'current'}`, 'INFO');

  try {
    const result = await syncInvoicePackageWithRelations(dateFrom, dateTo, sessionId);

    if (result.success) {
      logSyncActivity(`Full Invoice Sync SUCCESS: ${result.results?.syncedInvoices} invoices with all relations`, 'INFO');

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`Full Invoice Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return result;
  } catch (error) {
    logSyncActivity(`Full Invoice Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Patch Chinese Filenames
 *
 * Fixes files with non-ASCII characters (like Chinese) in their filenames.
 * Renames files on disk to use URL-encoded filenames and updates database URLs.
 * This ensures files can be accessed reliably regardless of encoding issues.
 */
export async function patchChineseFilenames() {
  logSyncActivity(`Starting 'Patch Chinese Filenames' job...`, 'INFO');

  const STORAGE_ROOT = '/storage';
  const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

  /**
   * Check if a string contains non-ASCII characters
   */
  function hasNonASCII(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 127) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sanitize filename by URL-encoding non-ASCII characters
   */
  function sanitizeFilename(filename: string): string {
    const ext = path.extname(filename).split('?')[0];
    const baseName = path.basename(filename, ext).split('?')[0];

    let sanitizedBaseName = '';
    for (let i = 0; i < baseName.length; i++) {
      const char = baseName[i];
      const code = char.charCodeAt(0);

      // Allow: a-z, A-Z, 0-9, space, hyphen, underscore, dot
      if (
        (code >= 48 && code <= 57) ||  // 0-9
        (code >= 65 && code <= 90) ||  // A-Z
        (code >= 97 && code <= 122) || // a-z
        code === 32 || code === 45 || code === 46 || code === 95  // space, -, ., _
      ) {
        sanitizedBaseName += char;
      } else {
        // URL-encode non-ASCII characters
        sanitizedBaseName += encodeURIComponent(char);
      }
    }

    return sanitizedBaseName + ext;
  }

  /**
   * Extract filename from a file URL
   */
  function getFilenameFromUrl(url: string): string | null {
    if (!url) return null;

    // Remove base URL and /api/files prefix
    let relativePath = url.replace(FILE_BASE_URL, '');
    if (relativePath.startsWith('/api/files/')) {
      relativePath = relativePath.replace('/api/files/', '');
    } else if (relativePath.startsWith('/storage/')) {
      relativePath = relativePath.replace('/storage/', '');
    }

    return path.basename(relativePath);
  }

  try {
    let totalPatched = 0;
    let totalSkipped = 0;

    // ============================================================================
    // Define all file fields across all tables
    // ============================================================================
    const fileFieldsConfig = [
      // SEDA Registration - Multiple file fields
      {
        table: sedaRegistration,
        tableName: 'seda_registration',
        idField: 'id',
        fields: [
          { name: 'customer_signature', type: 'single' },
          { name: 'ic_copy_front', type: 'single' },
          { name: 'ic_copy_back', type: 'single' },
          { name: 'tnb_bill_1', type: 'single' },
          { name: 'tnb_bill_2', type: 'single' },
          { name: 'tnb_bill_3', type: 'single' },
          { name: 'nem_cert', type: 'single' },
          { name: 'mykad_pdf', type: 'single' },
          { name: 'property_ownership_prove', type: 'single' },
          { name: 'roof_images', type: 'array' },
          { name: 'site_images', type: 'array' },
          { name: 'drawing_pdf_system', type: 'array' },
          { name: 'drawing_system_actual', type: 'array' },
          { name: 'drawing_engineering_seda_pdf', type: 'array' },
        ]
      },
      // Users - Profile pictures
      {
        table: users,
        tableName: 'user',
        idField: 'id',
        fields: [{ name: 'profile_picture', type: 'single' }]
      },
      // Payments - Attachments (array)
      {
        table: payments,
        tableName: 'payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Submitted Payments - Attachments (array)
      {
        table: submitted_payments,
        tableName: 'submitted_payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Invoice Templates - Logos
      {
        table: invoice_templates,
        tableName: 'invoice_template',
        idField: 'id',
        fields: [{ name: 'logo_url', type: 'single' }]
      },
    ];

    // ============================================================================
    // Process each table and field
    // ============================================================================
    for (const config of fileFieldsConfig) {
      logSyncActivity(`Scanning ${config.tableName}...`, 'INFO');

      for (const fieldConfig of config.fields) {
        const fieldName = fieldConfig.name;
        const fieldType = fieldConfig.type;

        try {
          if (fieldType === 'array') {
            // Array field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            for (const record of records) {
              if (Array.isArray(record.urls)) {
                const newUrls: string[] = [];
                let hasChanges = false;

                for (const url of record.urls) {
                  const filename = getFilenameFromUrl(url);

                  if (!filename || !hasNonASCII(filename)) {
                    newUrls.push(url);
                    totalSkipped++;
                    continue;
                  }

                  logSyncActivity(`Found non-ASCII filename: ${filename}`, 'INFO');

                  // Get the full file path
                  let relativePath = url.replace(FILE_BASE_URL, '');
                  if (relativePath.startsWith('/api/files/')) {
                    relativePath = relativePath.replace('/api/files/', '');
                  } else if (relativePath.startsWith('/storage/')) {
                    relativePath = relativePath.replace('/storage/', '');
                  }

                  const oldPath = path.join(STORAGE_ROOT, relativePath);
                  const dir = path.dirname(oldPath);

                  // Generate new sanitized filename
                  const sanitizedFilename = sanitizeFilename(filename);
                  const newPath = path.join(dir, sanitizedFilename);

                  // Rename file on disk if it exists
                  if (fs.existsSync(oldPath)) {
                    try {
                      fs.renameSync(oldPath, newPath);
                      logSyncActivity(`✓ Renamed: ${filename} → ${sanitizedFilename}`, 'INFO');
                    } catch (err: any) {
                      logSyncActivity(`✗ Failed to rename: ${(err as Error).message}`, 'ERROR');
                      newUrls.push(url);
                      continue;
                    }
                  } else {
                    logSyncActivity(`⚠ File not found on disk: ${oldPath}`, 'INFO');
                  }

                  // Generate new URL
                  const newRelativePath = relativePath.replace(filename, sanitizedFilename);
                  const newUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;
                  newUrls.push(newUrl);
                  hasChanges = true;
                  totalPatched++;
                }

                // Update database if changes were made
                if (hasChanges) {
                  await db
                    .update(config.table)
                    .set({ [fieldName]: newUrls })
                    .where(eq((config.table as any)[config.idField], record.id));

                  logSyncActivity(`✓ Updated database record ${record.id}`, 'INFO');
                }
              }
            }
          } else {
            // Single field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                url: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            for (const record of records) {
              const url = record.url as string;
              const filename = getFilenameFromUrl(url);

              if (!filename || !hasNonASCII(filename)) {
                totalSkipped++;
                continue;
              }

              logSyncActivity(`Found non-ASCII filename: ${filename}`, 'INFO');

              // Get the full file path
              let relativePath = url.replace(FILE_BASE_URL, '');
              if (relativePath.startsWith('/api/files/')) {
                relativePath = relativePath.replace('/api/files/', '');
              } else if (relativePath.startsWith('/storage/')) {
                relativePath = relativePath.replace('/storage/', '');
              }

              const oldPath = path.join(STORAGE_ROOT, relativePath);
              const dir = path.dirname(oldPath);

              // Generate new sanitized filename
              const sanitizedFilename = sanitizeFilename(filename);
              const newPath = path.join(dir, sanitizedFilename);

              // Rename file on disk if it exists
              if (fs.existsSync(oldPath)) {
                try {
                  fs.renameSync(oldPath, newPath);
                  logSyncActivity(`✓ Renamed: ${filename} → ${sanitizedFilename}`, 'INFO');
                } catch (err: any) {
                  logSyncActivity(`✗ Failed to rename: ${(err as Error).message}`, 'ERROR');
                  continue;
                }
              } else {
                logSyncActivity(`⚠ File not found on disk: ${oldPath}`, 'INFO');
              }

              // Generate new URL
              const newRelativePath = relativePath.replace(filename, sanitizedFilename);
              const newUrl = `${FILE_BASE_URL}/api/files/${newRelativePath}`;

              // Update database
              await db
                .update(config.table)
                .set({ [fieldName]: newUrl })
                .where(eq((config.table as any)[config.idField], record.id));

              logSyncActivity(`✓ Updated database record ${record.id}`, 'INFO');
              totalPatched++;
            }
          }
        } catch (error) {
          logSyncActivity(`Error patching ${config.tableName}.${fieldName}: ${String(error)}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Chinese filename patching complete: ${totalPatched} patched, ${totalSkipped} skipped`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return {
      success: true,
      totalPatched,
      totalSkipped,
      message: `Successfully patched ${totalPatched} file(s) with Chinese characters.\nSkipped ${totalSkipped} file(s).`
    };

  } catch (error) {
    logSyncActivity(`Patch Chinese Filenames CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Patch File URLs to Absolute URLs
 *
 * Converts all relative /storage/ URLs to absolute https://admin.atap.solar/api/files/ URLs
 * Also converts old incorrect URLs to the correct format
 * This fixes the issue where other apps on different subdomains cannot access files
 */
export async function patchFileUrlsToAbsolute() {
  logSyncActivity(`Starting 'Patch File URLs to Absolute' job...`, 'INFO');

  const BASE_URL = 'https://admin.atap.solar';

  try {
    let totalUpdated = 0;
    const updates: string[] = [];

    // ============================================================================
    // Define all file fields across all tables
    // Note: We need to specify which fields are arrays vs single
    // ============================================================================
    const fileFieldsConfig = [
      // SEDA Registration - Multiple file fields
      {
        table: sedaRegistration,
        tableName: 'seda_registration',
        idField: 'id',
        fields: [
          { name: 'customer_signature', type: 'single' },
          { name: 'ic_copy_front', type: 'single' },
          { name: 'ic_copy_back', type: 'single' },
          { name: 'tnb_bill_1', type: 'single' },
          { name: 'tnb_bill_2', type: 'single' },
          { name: 'tnb_bill_3', type: 'single' },
          { name: 'nem_cert', type: 'single' },
          { name: 'mykad_pdf', type: 'single' },
          { name: 'property_ownership_prove', type: 'single' },
          { name: 'roof_images', type: 'array' },
          { name: 'site_images', type: 'array' },
          { name: 'drawing_pdf_system', type: 'array' },
          { name: 'drawing_system_actual', type: 'array' },
          { name: 'drawing_engineering_seda_pdf', type: 'array' },
        ]
      },
      // Users - Profile pictures
      {
        table: users,
        tableName: 'user',
        idField: 'id',
        fields: [{ name: 'profile_picture', type: 'single' }]
      },
      // Payments - Attachments (array)
      {
        table: payments,
        tableName: 'payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Submitted Payments - Attachments (array)
      {
        table: submitted_payments,
        tableName: 'submitted_payment',
        idField: 'id',
        fields: [{ name: 'attachment', type: 'array' }]
      },
      // Invoice Templates - Logos
      {
        table: invoice_templates,
        tableName: 'invoice_template',
        idField: 'id',
        fields: [{ name: 'logo_url', type: 'single' }]
      },
    ];

    // ============================================================================
    // Process each table and field
    // ============================================================================
    for (const config of fileFieldsConfig) {
      logSyncActivity(`Scanning ${config.tableName}...`, 'INFO');

      for (const fieldConfig of config.fields) {
        const fieldName = fieldConfig.name;
        const fieldType = fieldConfig.type;

        try {
          if (fieldType === 'array') {
            // Array field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                urls: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            let fieldUpdatedCount = 0;

            for (const record of records) {
              if (Array.isArray(record.urls)) {
                const updatedUrls = record.urls.map((url: string) => {
                  // If URL contains /storage/, extract path after /storage/ and rebuild full URL
                  if (url && url.includes('/storage/')) {
                    // Extract the path after /storage/ (e.g., "seda/ic_copies/file.jpg")
                    const storagePath = url.split('/storage/').pop() || '';
                    if (storagePath) {
                      return `${BASE_URL}/api/files/${storagePath}`;
                    }
                  }
                  return url;
                });

                // Check if any URL changed
                const hasChanges = updatedUrls.some((newUrl, idx) => newUrl !== record.urls[idx]);

                if (hasChanges) {
                  await db
                    .update(config.table)
                    .set({ [fieldName]: updatedUrls })
                    .where(eq((config.table as any)[config.idField], record.id));
                  totalUpdated++;
                  fieldUpdatedCount++;
                }
              }
            }

            if (fieldUpdatedCount > 0) {
              updates.push(`${config.tableName}.${fieldName}: ${fieldUpdatedCount} records`);
              logSyncActivity(`Updated ${fieldUpdatedCount} records in ${config.tableName}.${fieldName}`, 'INFO');
            }
          } else {
            // Single field - process in memory
            const records = await db
              .select({
                id: (config.table as any)[config.idField],
                url: (config.table as any)[fieldName]
              })
              .from(config.table)
              .where(isNotNull((config.table as any)[fieldName]));

            let fieldUpdatedCount = 0;

            for (const record of records) {
              const url = record.url as string | null;

              // If URL contains /storage/, extract path after /storage/ and rebuild full URL
              if (url && url.includes('/storage/')) {
                // Extract the path after /storage/ (e.g., "seda/ic_copies/file.jpg")
                const storagePath = url.split('/storage/').pop() || '';
                if (storagePath) {
                  const newUrl = `${BASE_URL}/api/files/${storagePath}`;

                  await db
                    .update(config.table)
                    .set({ [fieldName]: newUrl })
                    .where(eq((config.table as any)[config.idField], record.id));

                  totalUpdated++;
                  fieldUpdatedCount++;
                }
              }
            }

            if (fieldUpdatedCount > 0) {
              updates.push(`${config.tableName}.${fieldName}: ${fieldUpdatedCount} records`);
              logSyncActivity(`Updated ${fieldUpdatedCount} records in ${config.tableName}.${fieldName}`, 'INFO');
            }
          }
        } catch (error) {
          logSyncActivity(`Error patching ${config.tableName}.${fieldName}: ${String(error)}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Patch complete: ${totalUpdated} URL(s) updated`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return {
      success: true,
      totalUpdated,
      updates,
      message: `Successfully patched ${totalUpdated} file URL(s) to absolute URLs.\n\nUpdated:\n${updates.join('\n')}`
    };

  } catch (error) {
    logSyncActivity(`Patch File URLs CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Clear Sync Logs
 *
 * Deletes the sync.log file to clear all logs
 */
export async function clearSyncLogs() {
  logSyncActivity('Clearing logs...', 'INFO');

  try {
    const result = clearLogs();

    if (result.success) {
      return { success: true, message: result.message };
    } else {
      return { success: false, error: result.message };
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * SEDA Registration-Only Sync
 *
 * Syncs SEDA registrations within a date range.
 * Overwrites local data if Bubble is newer.
 */
export async function runSedaOnlySync(dateFrom: string, dateTo?: string) {
  logSyncActivity(`SEDA-Only Sync Triggered: ${dateFrom} to ${dateTo || 'All'}`, 'INFO');

  try {
    const { syncSedaRegistrations } = await import('@/lib/bubble');
    const result = await syncSedaRegistrations(dateFrom, dateTo);

    if (result.success) {
      logSyncActivity(`SEDA-Only Sync SUCCESS: ${result.results?.syncedSedas} synced, ${result.results?.skippedSedas} skipped`, 'INFO');

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`SEDA-Only Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/seda");

    return result;
  } catch (error) {
    logSyncActivity(`SEDA-Only Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Fast ID-List Sync (Optimized with CSV)
 *
 * Syncs specific Invoice and SEDA IDs from CSV with modified dates.
 * Checks local data first - only fetches from Bubble if newer.
 * Ultra-fast alternative to date range sync.
 *
 * CSV Format:
 * type,id,modified_date
 * invoice,1647839483923x8394832,2026-01-19T10:30:00Z
 * seda,1647839483926x8394835,2026-01-19T09:15:00Z
 */
export async function runIdListSync(csvData: string) {
  logSyncActivity(`Optimized Fast ID-List Sync Triggered`, 'INFO');

  try {
    const { syncByIdList } = await import('@/lib/bubble');
    const result = await syncByIdList(csvData);

    if (result.success) {
      logSyncActivity(`Optimized Fast ID-List Sync SUCCESS!`, 'INFO');

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`Optimized Fast ID-List Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/seda");
    revalidatePath("/invoices");

    return result;
  } catch (error) {
    logSyncActivity(`Optimized Fast ID-List Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Patch SEDA Customer Links
 *
 * Fixes SEDA registrations with missing linked_customer by looking at
 * their linked invoice's customer.
 *
 * This is called automatically after every sync to ensure data integrity.
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

/**
 * INTEGRITY SYNC: Single Invoice with All Dependencies
 *
 * This is the NEW integrity-first sync function that:
 * 1. Uses complete field mappings (zero data loss)
 * 2. Respects dependency order (syncs relations first)
 * 3. Implements MERGE logic (preserves local-only fields)
 * 4. Tracks progress and errors in detail
 * 5. Returns comprehensive statistics
 *
 * Use this for:
 * - Syncing critical invoices that must be 100% accurate
 * - Testing sync functionality
 * - Fixing broken invoice data
 *
 * @param invoiceBubbleId - The Bubble ID of the invoice to sync
 * @param options.force - Skip timestamp check and force sync (default: false)
 */
export async function runIntegritySync(invoiceBubbleId: string, options?: { force?: boolean }) {
  logSyncActivity(`Integrity Sync triggered for invoice ${invoiceBubbleId}`, 'INFO');

  try {
    const result = await syncInvoiceWithFullIntegrity(invoiceBubbleId, {
      force: options?.force || false,
      onProgress: (step, message) => {
        logSyncActivity(`[${step}] ${message}`, 'INFO');
      }
    });

    if (result.success) {
      logSyncActivity(`✅ Integrity Sync SUCCESS!`, 'INFO');
      logSyncActivity(`Stats: Agent=${result.stats.agent}, Customer=${result.stats.customer}, User=${result.stats.user}, Payments=${result.stats.payments}, Submitted_Payments=${result.stats.submitted_payments}, Items=${result.stats.invoice_items}, SEDA=${result.stats.seda}, Invoice=${result.stats.invoice}`, 'INFO');

      if (result.errors.length > 0) {
        logSyncActivity(`⚠️  ${result.errors.length} error(s) occurred:`, 'ERROR');
        result.errors.forEach((err, idx) => {
          logSyncActivity(`  ${idx + 1}. ${err}`, 'ERROR');
        });
      }

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`❌ Integrity Sync FAILED`, 'ERROR');
      result.errors.forEach((err, idx) => {
        logSyncActivity(`  ${idx + 1}. ${err}`, 'ERROR');
      });
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");
    revalidatePath("/seda");

    return result;
  } catch (error) {
    logSyncActivity(`Integrity Sync CRASHED: ${String(error)}`, 'ERROR');
    return {
      success: false,
      invoiceId: invoiceBubbleId,
      steps: [],
      errors: [String(error)],
      stats: {
        agent: 0,
        customer: 0,
        user: 0,
        payments: 0,
        submitted_payments: 0,
        invoice_items: 0,
        seda: 0,
        invoice: 0
      }
    };
  }
}

/**
 * INTEGRITY SYNC: Batch Invoice Sync with Date Range
 *
 * Syncs multiple invoices using the integrity-first approach.
 * This is the recommended method for bulk syncs.
 *
 * @param dateFrom - Start date (ISO string)
 * @param dateTo - Optional end date (ISO string)
 * @returns result with syncSessionId for progress tracking
 */
export async function runIntegrityBatchSync(dateFrom: string, dateTo?: string) {
  logSyncActivity(`Integrity Batch Sync: ${dateFrom} to ${dateTo || 'present'}`, 'INFO');

  // Create sync progress session
  const syncSessionId = await createSyncProgress({
    date_from: dateFrom,
    date_to: dateTo,
  });
  logSyncActivity(`Created sync progress session: ${syncSessionId}`, 'INFO');

  try {
    const result = await syncBatchInvoicesWithIntegrity(dateFrom, dateTo, {
      syncSessionId, // Pass to sync for DB progress tracking
      onProgress: (current, total, message) => {
        logSyncActivity(`[${current}/${total}] ${message}`, 'INFO');
      }
    });

    if (result.success) {
      logSyncActivity(`✅ Batch Sync SUCCESS!`, 'INFO');
      logSyncActivity(`Total: ${result.results.total}, Synced: ${result.results.synced}, Skipped: ${result.results.skipped}, Failed: ${result.results.failed}`, 'INFO');

      if (result.results.errors.length > 0) {
        logSyncActivity(`⚠️  ${result.results.errors.length} error(s) occurred:`, 'ERROR');
        result.results.errors.slice(0, 10).forEach((err) => {
          logSyncActivity(`  • ${err}`, 'ERROR');
        });
        if (result.results.errors.length > 10) {
          logSyncActivity(`  ... and ${result.results.errors.length - 10} more errors`, 'ERROR');
        }
      }

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`❌ Batch Sync FAILED: ${result.results.errors.join(', ')}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    // Return result with syncSessionId
    return {
      ...result,
      syncSessionId,
    };
  } catch (error) {
    logSyncActivity(`Integrity Batch Sync CRASHED: ${String(error)}`, 'ERROR');
    return {
      success: false,
      results: {
        total: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        errors: [String(error)]
      },
      syncSessionId,
    };
  }
}

