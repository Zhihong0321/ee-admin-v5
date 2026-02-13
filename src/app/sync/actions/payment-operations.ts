"use server";

/**
 * ============================================================================
 * PAYMENT RESET & CROSS-CHECKED SYNC OPERATIONS
 * ============================================================================
 *
 * Functions for resetting payment table and syncing payments from Bubble with
 * cross-checking against invoices.
 *
 * Functions:
 * - resetPaymentTable: Delete all payment files and truncate table
 * - savePaymentSyncList: Save list of payment IDs to sync
 * - loadPaymentSyncList: Load payment IDs from storage
 * - syncPaymentsFromBubble: Sync specific payment IDs from Bubble
 * - linkPaymentsToInvoices: Cross-check and link payments to invoices
 * - recalculateInvoicePaymentStatus: Recalculate % and paid status
 * - getProblemSyncList: Get list of problematic syncs
 *
 * File: src/app/sync/actions/payment-operations.ts
 */

import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { db } from "@/lib/db";
import { payments, invoices } from "@/db/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import fs from "fs";
import path from "path";

const STORAGE_ROOT = '/storage';
const PAYMENT_SYNC_LIST_PATH = path.join(STORAGE_ROOT, 'payment-sync-list.txt');
const PAYMENT_SYNCED_LIST_PATH = path.join(STORAGE_ROOT, 'payment-synced-list.txt');
const PAYMENT_ORPHAN_LIST_JSON_PATH = path.join(STORAGE_ROOT, 'payment-problem-sync-list.json');

// Bubble API Configuration
const BUBBLE_API_KEY = process.env.BUBBLE_API_KEY || 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

const headers = {
  'Authorization': `Bearer ${BUBBLE_API_KEY}`,
  'Content-Type': 'application/json'
};

// ============================================================================
// Problem Sync List Types
// ============================================================================

export interface ProblemSync {
  paymentBubbleId: string;
  linkedInvoiceBubbleId?: string;
  issueType: 'missing_invoice' | 'bubble_not_found' | 'sync_failed';
  timestamp: string;
  errorMessage?: string;
  paymentAmount?: string;
  paymentDate?: string;
}

/**
 * Fetch a single payment from Bubble API by ID
 */
async function fetchBubblePayment(paymentId: string): Promise<any> {
  const response = await fetch(`${BUBBLE_BASE_URL}/payment/${paymentId}`, { headers });

  if (!response.ok) {
    throw new Error(`Bubble API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Save problem sync list to JSON file
 */
function saveProblemSyncList(problems: ProblemSync[]) {
  try {
    fs.writeFileSync(PAYMENT_ORPHAN_LIST_JSON_PATH, JSON.stringify(problems, null, 2));
    logSyncActivity(`Saved ${problems.length} problem syncs to ${PAYMENT_ORPHAN_LIST_JSON_PATH}`, 'INFO');
  } catch (error) {
    logSyncActivity(`Failed to save problem sync list: ${String(error)}`, 'ERROR');
  }
}

/**
 * Load problem sync list from JSON file
 */
function loadProblemSyncList(): ProblemSync[] {
  try {
    if (fs.existsSync(PAYMENT_ORPHAN_LIST_JSON_PATH)) {
      const content = fs.readFileSync(PAYMENT_ORPHAN_LIST_JSON_PATH, 'utf-8');
      return JSON.parse(content);
    }
    return [];
  } catch (error) {
    logSyncActivity(`Failed to load problem sync list: ${String(error)}`, 'ERROR');
    return [];
  }
}

/**
 * ============================================================================
 * FUNCTION: resetPaymentTable
 * ============================================================================
 *
 * INTENT (What & Why):
 * Delete all payment attachment files from storage and truncate the payment table.
 * Use this to completely reset payment data before a fresh sync from Bubble.
 *
 * INPUTS:
 * @param confirmDelete - boolean (required): Must be true to execute deletion
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   filesDeleted: number,
 *   paymentsDeleted: number,
 *   errors: string[],
 *   message: string
 * }
 */

export async function resetPaymentTable(confirmDelete: boolean = false) {
  logSyncActivity(`Payment Reset triggered...`, 'INFO');

  if (!confirmDelete) {
    logSyncActivity(`Payment Reset ABORTED: confirmDelete is false`, 'WARN');
    return {
      success: false,
      error: "Payment reset aborted. Set confirmDelete=true to proceed."
    };
  }

  try {
    let filesDeleted = 0;
    const errors: string[] = [];

    // Step 1: Collect all file URLs from payment.attachment
    logSyncActivity(`Collecting payment attachment URLs...`, 'INFO');

    const allPayments = await db.select({
      attachment: payments.attachment
    }).from(payments);

    const filesToDelete: string[] = [];

    for (const payment of allPayments) {
      if (Array.isArray(payment.attachment)) {
        for (const url of payment.attachment) {
          if (url) {
            filesToDelete.push(url);
          }
        }
      }
    }

    logSyncActivity(`Found ${filesToDelete.length} files to delete`, 'INFO');

    // Step 2: Delete files from storage
    const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

    for (const url of filesToDelete) {
      try {
        // Convert URL to file system path
        let relativePath = url.replace(FILE_BASE_URL, '');
        if (relativePath.startsWith('/api/files/')) {
          relativePath = relativePath.replace('/api/files/', '');
        } else if (relativePath.startsWith('/storage/')) {
          relativePath = relativePath.replace('/storage/', '');
        }

        const filePath = path.join(STORAGE_ROOT, relativePath);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          filesDeleted++;
          logSyncActivity(`Deleted: ${relativePath}`, 'INFO');
        } else {
          logSyncActivity(`File not found: ${relativePath}`, 'WARN');
        }
      } catch (err: any) {
        const errorMsg = `Failed to delete ${url}: ${(err as Error).message}`;
        errors.push(errorMsg);
        logSyncActivity(errorMsg, 'ERROR');
      }
    }

    // Step 3: Truncate payment table
    logSyncActivity(`Truncating payment table...`, 'INFO');

    const result = await db.execute(sql`DELETE FROM payment`);
    const paymentsDeleted = result.rowCount || 0;

    logSyncActivity(`Deleted ${paymentsDeleted} payment records`, 'INFO');

    // Step 4: Clear payment ID lists from storage
    if (fs.existsSync(PAYMENT_SYNC_LIST_PATH)) {
      fs.unlinkSync(PAYMENT_SYNC_LIST_PATH);
      logSyncActivity(`Cleared payment-sync-list.txt`, 'INFO');
    }
    if (fs.existsSync(PAYMENT_SYNCED_LIST_PATH)) {
      fs.unlinkSync(PAYMENT_SYNCED_LIST_PATH);
      logSyncActivity(`Cleared payment-synced-list.txt`, 'INFO');
    }
    if (fs.existsSync(PAYMENT_ORPHAN_LIST_JSON_PATH)) {
      fs.unlinkSync(PAYMENT_ORPHAN_LIST_JSON_PATH);
      logSyncActivity(`Cleared payment-problem-sync-list.json`, 'INFO');
    }

    logSyncActivity(`✅ Payment Reset COMPLETE: ${filesDeleted} files, ${paymentsDeleted} payments`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/sync/problem-syncs");

    return {
      success: true,
      filesDeleted,
      paymentsDeleted,
      errors,
      message: `Payment reset complete. Deleted ${filesDeleted} files and ${paymentsDeleted} payment records.`
    };

  } catch (error) {
    logSyncActivity(`Payment Reset CRASHED: ${String(error)}`, 'ERROR');
    return {
      success: false,
      filesDeleted: 0,
      paymentsDeleted: 0,
      errors: [String(error)],
      error: String(error)
    };
  }
}

/**
 * ============================================================================
 * FUNCTION: savePaymentSyncList
 * ============================================================================
 *
 * INTENT (What & Why):
 * Save a comma-separated list of Bubble payment IDs to persistent storage.
 * This list will be used by the sync function to know which payments to sync.
 *
 * INPUTS:
 * @param paymentIds - string: Comma-separated Bubble payment IDs
 *
 * OUTPUTS:
 * @returns { success: boolean, message: string, count: number }
 */
export async function savePaymentSyncList(paymentIds: string) {
  try {
    // Parse and validate IDs
    const ids = paymentIds.split(',').map(id => id.trim()).filter(id => id.length > 0);

    if (ids.length === 0) {
      return { success: false, error: "No valid payment IDs provided" };
    }

    // Save to file
    fs.writeFileSync(PAYMENT_SYNC_LIST_PATH, ids.join('\n'));

    logSyncActivity(`Saved ${ids.length} payment IDs to ${PAYMENT_SYNC_LIST_PATH}`, 'INFO');

    return {
      success: true,
      message: `Saved ${ids.length} payment IDs to sync list.`,
      count: ids.length
    };
  } catch (error) {
    logSyncActivity(`Failed to save payment sync list: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: loadPaymentSyncList
 * ============================================================================
 *
 * INTENT (What & Why):
 * Load the list of Bubble payment IDs from persistent storage.
 */
export async function loadPaymentSyncList(): Promise<string[]> {
  try {
    if (!fs.existsSync(PAYMENT_SYNC_LIST_PATH)) {
      return [];
    }

    const content = fs.readFileSync(PAYMENT_SYNC_LIST_PATH, 'utf-8');
    return content.split('\n').map(id => id.trim()).filter(id => id.length > 0);
  } catch (error) {
    logSyncActivity(`Failed to load payment sync list: ${String(error)}`, 'ERROR');
    return [];
  }
}

/**
 * ============================================================================
 * FUNCTION: syncPaymentsFromBubble
 * ============================================================================
 *
 * INTENT (What & Why):
 * Sync specific payment IDs from Bubble to PostgreSQL.
 * Only syncs the IDs listed in the payment-sync-list.txt file.
 *
 * INPUTS:
 * None (reads from payment-sync-list.txt)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   syncedCount: number,
 *   errors: string[],
 *   message: string
 * }
 */

export async function syncPaymentsFromBubble() {
  logSyncActivity(`Starting Payment Sync from Bubble...`, 'INFO');

  try {
    // Step 1: Load payment IDs to sync
    const paymentIds = await loadPaymentSyncList();

    if (paymentIds.length === 0) {
      logSyncActivity(`No payment IDs to sync. List is empty.`, 'WARN');
      return {
        success: false,
        error: "No payment IDs in sync list. Add IDs using savePaymentSyncList()."
      };
    }

    logSyncActivity(`Found ${paymentIds.length} payment IDs to sync`, 'INFO');

    let syncedCount = 0;
    const errors: string[] = [];
    const problemSyncs: ProblemSync[] = [];
    const existingProblems = loadProblemSyncList();

    // Step 2: Fetch each payment from Bubble
    for (const paymentId of paymentIds) {
      try {
        logSyncActivity(`Fetching payment ${paymentId} from Bubble...`, 'INFO');

        // Fetch from Bubble API
        const bubblePayment = await fetchBubblePayment(paymentId);

        // Map Bubble fields to PostgreSQL
        const mappedPayment = {
          bubble_id: bubblePayment._id,
          amount: bubblePayment.Amount?.toString() || null,
          payment_date: bubblePayment["Payment Date"] ? new Date(bubblePayment["Payment Date"]) : null,
          payment_method: bubblePayment["Payment Method"] || null,
          payment_method_v2: bubblePayment["Payment Method V2"] || null,
          remark: bubblePayment.Remark || null,
          linked_agent: bubblePayment["Linked Agent"] || null,
          linked_customer: bubblePayment["Linked Customer"] || null,
          linked_invoice: bubblePayment["Linked Invoice"] || null,
          created_by: bubblePayment["Created By"] || null,
          created_date: bubblePayment["Created Date"] ? new Date(bubblePayment["Created Date"]) : null,
          modified_date: new Date(bubblePayment["Modified Date"]),
          attachment: bubblePayment.attachment || null,
          verified_by: bubblePayment["Verified By"] || null,
          edit_history: bubblePayment["Edit History"] || null,
          issuer_bank: bubblePayment["Issuer Bank"] || null,
          epp_month: bubblePayment["EPP Month"] || null,
          bank_charges: bubblePayment["Bank Charges"] || null,
          terminal: bubblePayment.terminal || null,
          epp_type: bubblePayment["EPP Type"] || null,
          last_synced_at: new Date(),
          updated_at: new Date(),
        };

        // Insert or update payment
        await db.insert(payments)
          .values(mappedPayment)
          .onConflictDoUpdate({
            target: payments.bubble_id,
            set: mappedPayment
          });

        syncedCount++;
        logSyncActivity(`Synced payment ${paymentId}`, 'INFO');

        // Step 3: Append to synced list
        fs.appendFileSync(PAYMENT_SYNCED_LIST_PATH, `${paymentId}\n`);

        // Step 4: Remove from sync list (rewrite file without this ID)
        const remainingIds = paymentIds.filter(id => id !== paymentId);
        fs.writeFileSync(PAYMENT_SYNC_LIST_PATH, remainingIds.join('\n'));

        // Remove from problem syncs if it was there before
        const updatedProblems = existingProblems.filter(p => p.paymentBubbleId !== paymentId);
        if (updatedProblems.length !== existingProblems.length) {
          saveProblemSyncList(updatedProblems);
        }

      } catch (err: any) {
        const errorMsg = `Failed to sync payment ${paymentId}: ${(err as Error).message}`;
        errors.push(errorMsg);
        logSyncActivity(errorMsg, 'ERROR');

        // Add to problem syncs list
        const problem: ProblemSync = {
          paymentBubbleId: paymentId,
          issueType: String(err).includes('Not Found') ? 'bubble_not_found' : 'sync_failed',
          timestamp: new Date().toISOString(),
          errorMessage: (err as Error).message,
        };

        // Check if payment already exists locally to get more info
        try {
          const existingPayment = await db.query.payments.findFirst({
            where: eq(payments.bubble_id, paymentId)
          });
          if (existingPayment) {
            problem.paymentAmount = existingPayment.amount || undefined;
            problem.paymentDate = existingPayment.payment_date?.toISOString();
            problem.linkedInvoiceBubbleId = existingPayment.linked_invoice || undefined;
          }
        } catch {}

        // Merge with existing problems
        const updatedProblems = existingProblems.filter(p => p.paymentBubbleId !== paymentId);
        updatedProblems.push(problem);
        saveProblemSyncList(updatedProblems);
      }
    }

    // Step 5: Check if all synced
    const remainingCount = (await loadPaymentSyncList()).length;

    if (remainingCount === 0) {
      logSyncActivity(`✅ All payments synced! Proceeding to Step 2: Link payments to invoices`, 'INFO');
    } else {
      logSyncActivity(`⚠️  Sync complete with ${errors.length} errors. ${remainingCount} IDs remaining in list.`, 'WARN');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/sync/problem-syncs");

    return {
      success: true,
      syncedCount,
      errors,
      remainingCount,
      message: `Synced ${syncedCount} payments. ${remainingCount} IDs remaining.`
    };

  } catch (error) {
    logSyncActivity(`Payment Sync CRASHED: ${String(error)}`, 'ERROR');
    return {
      success: false,
      syncedCount: 0,
      errors: [String(error)],
      error: String(error)
    };
  }
}

/**
 * ============================================================================
 * FUNCTION: linkPaymentsToInvoices
 * ============================================================================
 *
 * INTENT (What & Why):
 * Cross-check synced payments against invoices and link them together.
 * For each payment, find its invoice and add the payment to the invoice's
 * linked_payment array. Track orphaned payments (invoices not found).
 *
 * INPUTS:
 * None (reads from payment-synced-list.txt)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   linkedCount: number,
 *   orphanCount: number,
 *   orphans: ProblemSync[],
 *   message: string
 * }
 */

export async function linkPaymentsToInvoices() {
  logSyncActivity(`Step 2: Linking payments to invoices...`, 'INFO');

  try {
    // Step 1: Load synced payment IDs
    if (!fs.existsSync(PAYMENT_SYNCED_LIST_PATH)) {
      return {
        success: false,
        error: "No synced payments found. Run syncPaymentsFromBubble() first."
      };
    }

    const syncedContent = fs.readFileSync(PAYMENT_SYNCED_LIST_PATH, 'utf-8');
    const syncedIds = syncedContent.split('\n').map(id => id.trim()).filter(id => id.length > 0);

    if (syncedIds.length === 0) {
      return {
        success: false,
        error: "No synced payments found. Run syncPaymentsFromBubble() first."
      };
    }

    logSyncActivity(`Processing ${syncedIds.length} synced payments...`, 'INFO');

    let linkedCount = 0;
    const orphans: ProblemSync[] = [];
    const existingProblems = loadProblemSyncList();

    // Step 2: Process each synced payment
    for (const paymentBubbleId of syncedIds) {
      try {
        // Fetch payment
        const payment = await db.query.payments.findFirst({
          where: eq(payments.bubble_id, paymentBubbleId)
        });

        if (!payment) {
          logSyncActivity(`Payment ${paymentBubbleId} not found in database`, 'WARN');
          orphans.push({
            paymentBubbleId,
            issueType: 'sync_failed',
            timestamp: new Date().toISOString(),
            errorMessage: 'Payment not found in database after sync'
          });
          continue;
        }

        // Check if payment has linked_invoice
        if (!payment.linked_invoice) {
          logSyncActivity(`Payment ${paymentBubbleId} has no linked_invoice`, 'WARN');
          orphans.push({
            paymentBubbleId,
            issueType: 'missing_invoice',
            timestamp: new Date().toISOString(),
            errorMessage: 'Payment has no linked_invoice field',
            paymentAmount: payment.amount || undefined,
            paymentDate: payment.payment_date?.toISOString(),
          });
          continue;
        }

        // Find invoice by bubble_id
        const invoice = await db.query.invoices.findFirst({
          where: eq(invoices.bubble_id, payment.linked_invoice)
        });

        if (!invoice) {
          logSyncActivity(`Invoice ${payment.linked_invoice} not found for payment ${paymentBubbleId}`, 'WARN');
          orphans.push({
            paymentBubbleId,
            linkedInvoiceBubbleId: payment.linked_invoice,
            issueType: 'missing_invoice',
            timestamp: new Date().toISOString(),
            errorMessage: `Linked invoice ${payment.linked_invoice} not found in database`,
            paymentAmount: payment.amount || undefined,
            paymentDate: payment.payment_date?.toISOString(),
          });
          continue;
        }

        // Check if payment already in linked_payment array
        const currentLinkedPayments = invoice.linked_payment || [];
        if (currentLinkedPayments.includes(paymentBubbleId)) {
          logSyncActivity(`Payment ${paymentBubbleId} already linked to invoice ${payment.linked_invoice}`, 'INFO');
          linkedCount++;
          continue;
        }

        // Add payment to invoice.linked_payment array
        const updatedLinkedPayments = [...currentLinkedPayments, paymentBubbleId];

        await db.update(invoices)
          .set({ linked_payment: updatedLinkedPayments })
          .where(eq(invoices.id, invoice.id));

        logSyncActivity(`✓ Linked payment ${paymentBubbleId} to invoice ${payment.linked_invoice}`, 'INFO');
        linkedCount++;

        // Remove from problem syncs if it was there
        const updatedProblems = existingProblems.filter(p => p.paymentBubbleId !== paymentBubbleId);
        if (updatedProblems.length !== existingProblems.length) {
          saveProblemSyncList(updatedProblems);
        }

      } catch (err: any) {
        logSyncActivity(`Error processing payment ${paymentBubbleId}: ${(err as Error).message}`, 'ERROR');
        orphans.push({
          paymentBubbleId,
          issueType: 'sync_failed',
          timestamp: new Date().toISOString(),
          errorMessage: (err as Error).message
        });
      }
    }

    // Step 3: Save orphan list
    if (orphans.length > 0) {
      // Merge with existing problems, update timestamps for current ones
      const existingOrphans = existingProblems.filter(p => orphans.some(o => o.paymentBubbleId === p.paymentBubbleId));
      const newOrphans = orphans.filter(o => !existingProblems.some(p => p.paymentBubbleId === o.paymentBubbleId));

      const allProblems = [...existingOrphans, ...newOrphans];
      saveProblemSyncList(allProblems);

      logSyncActivity(`Saved ${orphans.length} problem payments to ${PAYMENT_ORPHAN_LIST_JSON_PATH}`, 'WARN');
    }

    // Step 4: Clear synced list
    fs.unlinkSync(PAYMENT_SYNCED_LIST_PATH);
    logSyncActivity(`Cleared payment-synced-list.txt`, 'INFO');

    logSyncActivity(`✅ Step 2 COMPLETE: ${linkedCount} linked, ${orphans.length} orphans`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/sync/problem-syncs");

    return {
      success: true,
      linkedCount,
      orphanCount: orphans.length,
      orphans,
      message: `Linked ${linkedCount} payments to invoices. ${orphans.length} orphaned payments (invoices not found).`
    };

  } catch (error) {
    logSyncActivity(`Link Payments CRASHED: ${String(error)}`, 'ERROR');
    return {
      success: false,
      linkedCount: 0,
      orphanCount: 0,
      orphans: [],
      error: String(error)
    };
  }
}

/**
 * ============================================================================
 * FUNCTION: recalculateInvoicePaymentStatus
 * ============================================================================
 *
 * INTENT (What & Why):
 * Recalculate percent_of_total_amount and paid status for all invoices.
 * For each invoice, sum up all linked payments and calculate percentage.
 * If percent >= 100%, set invoice.paid = true.
 *
 * INPUTS:
 * None (operates on all invoices with linked payments)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   processedCount: number,
 *   paidCount: number,
 *   message: string
 * }
 */

export async function recalculateInvoicePaymentStatus() {
  logSyncActivity(`Step 3: Recalculating invoice payment status...`, 'INFO');

  try {
    // Step 1: Fetch all invoices with linked payments
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      total_amount: invoices.total_amount,
      linked_payment: invoices.linked_payment
    })
    .from(invoices)
    .where(sql`${invoices.linked_payment} IS NOT NULL AND array_length(${invoices.linked_payment}, 1) > 0`);

    logSyncActivity(`Found ${allInvoices.length} invoices with linked payments`, 'INFO');

    let processedCount = 0;
    let paidCount = 0;

    // Step 2: Process each invoice
    for (const invoice of allInvoices) {
      try {
        const totalAmount = parseFloat(invoice.total_amount || '0');

        // Skip if total_amount is 0 or null
        if (totalAmount <= 0) {
          logSyncActivity(`Skipping invoice ${invoice.bubble_id}: total_amount is ${totalAmount}`, 'WARN');
          continue;
        }

        // Sum up all linked payments
        let totalPaid = 0;
        const linkedPayments = invoice.linked_payment || [];

        for (const paymentBubbleId of linkedPayments) {
          const payment = await db.query.payments.findFirst({
            where: eq(payments.bubble_id, paymentBubbleId)
          });

          if (payment && payment.amount) {
            totalPaid += parseFloat(payment.amount);
          } else {
            logSyncActivity(`Payment ${paymentBubbleId} not found for invoice ${invoice.bubble_id}`, 'WARN');
          }
        }

        // Calculate percentage
        const percentage = (totalPaid / totalAmount) * 100;
        const isPaid = percentage >= 100;
        const balanceDue = totalAmount - totalPaid;

        // Update invoice
        await db.update(invoices)
          .set({
            percent_of_total_amount: percentage.toString(),
            updated_at: new Date()
          })
          .where(eq(invoices.id, invoice.id));

        processedCount++;
        if (isPaid) paidCount++;

        logSyncActivity(`✓ Invoice ${invoice.bubble_id}: ${percentage.toFixed(2)}% paid (${isPaid ? 'PAID' : 'UNPAID'})`, 'INFO');

      } catch (err: any) {
        logSyncActivity(`Error processing invoice ${invoice.bubble_id}: ${(err as Error).message}`, 'ERROR');
      }
    }

    logSyncActivity(`✅ Step 3 COMPLETE: ${processedCount} invoices processed, ${paidCount} marked as PAID`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      processedCount,
      paidCount,
      message: `Recalculated ${processedCount} invoices. ${paidCount} are now marked as PAID (100%+).`
    };

  } catch (error) {
    logSyncActivity(`Recalculate Payment Status CRASHED: ${String(error)}`, 'ERROR');
    return {
      success: false,
      processedCount: 0,
      paidCount: 0,
      error: String(error)
    };
  }
}

/**
 * ============================================================================
 * FUNCTION: patchAllInvoicePercentages
 * ============================================================================
 *
 * INTENT (What & Why):
 * Force-recalculate all invoice percentages by summing actual linked payments.
 * This fixes data inconsistencies where percentages were stored as ratios (0-1).
 */
export async function patchAllInvoicePercentages() {
  logSyncActivity(`Starting Global Invoice Payment Percentage Patch...`, 'INFO');

  try {
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      invoice_id: invoices.invoice_id,
      total_amount: invoices.total_amount,
      linked_payment: invoices.linked_payment,
      percent_of_total_amount: invoices.percent_of_total_amount
    })
    .from(invoices)
    .where(sql`${invoices.linked_payment} IS NOT NULL AND array_length(${invoices.linked_payment}, 1) > 0`);

    let updatedCount = 0;

    for (const invoice of allInvoices) {
      const totalAmount = parseFloat(invoice.total_amount || '0');
      if (totalAmount <= 0) continue;

      const linkedPayments = invoice.linked_payment || [];
      let totalPaid = 0;

      const paymentRecords = await db.select({ amount: payments.amount })
        .from(payments)
        .where(sql`${payments.bubble_id} = ANY(${linkedPayments})`);

      for (const p of paymentRecords) {
        if (p.amount) totalPaid += parseFloat(p.amount);
      }

      const newPercentage = (totalPaid / totalAmount) * 100;
      const oldPercentage = parseFloat(invoice.percent_of_total_amount || '0');

      if (Math.abs(newPercentage - oldPercentage) > 0.001) {
        await db.update(invoices)
          .set({
            percent_of_total_amount: newPercentage.toString(),
            updated_at: new Date()
          })
          .where(eq(invoices.id, invoice.id));
        updatedCount++;
      }
    }

    logSyncActivity(`✅ Patch Complete: ${updatedCount} invoices updated.`, 'INFO');
    
    revalidatePath("/sync");
    revalidatePath("/seda");

    return {
      success: true,
      updatedCount,
      message: `Successfully patched ${updatedCount} invoices with correct percentages.`
    };
  } catch (error) {
    logSyncActivity(`Patch Failed: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: getProblemSyncList
 * ============================================================================
 *
 * INTENT (What & Why):
 * Get the list of problematic syncs (orphans, failed syncs).
 * This is used by the UI to display problem syncs.
 *
 * INPUTS:
 * None
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   problems: ProblemSync[],
 *   count: number
 * }
 */

export async function getProblemSyncList() {
  try {
    const problems = loadProblemSyncList();

    return {
      success: true,
      problems,
      count: problems.length
    };
  } catch (error) {
    logSyncActivity(`Failed to load problem sync list: ${String(error)}`, 'ERROR');
    return {
      success: false,
      problems: [],
      count: 0,
      error: String(error)
    };
  }
}

/**
 * ============================================================================
 * FUNCTION: clearProblemSyncList
 * ============================================================================
 *
 * INTENT (What & Why):
 * Clear the problem sync list.
 * Useful after fixing issues.
 *
 * INPUTS:
 * @param paymentId - optional: Clear only specific payment ID
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   message: string
 * }
 */

export async function clearProblemSyncList(paymentId?: string) {
  try {
    if (paymentId) {
      // Remove specific payment from problem list
      const problems = loadProblemSyncList();
      const updatedProblems = problems.filter(p => p.paymentBubbleId !== paymentId);

      if (updatedProblems.length !== problems.length) {
        saveProblemSyncList(updatedProblems);
        return {
          success: true,
          message: `Removed payment ${paymentId} from problem list.`
        };
      } else {
        return {
          success: true,
          message: `Payment ${paymentId} not found in problem list.`
        };
      }
    } else {
      // Clear entire problem list
      if (fs.existsSync(PAYMENT_ORPHAN_LIST_JSON_PATH)) {
        fs.unlinkSync(PAYMENT_ORPHAN_LIST_JSON_PATH);
        logSyncActivity(`Cleared problem sync list`, 'INFO');
      }

      return {
        success: true,
        message: `Problem sync list cleared.`
      };
    }
  } catch (error) {
    logSyncActivity(`Failed to clear problem sync list: ${String(error)}`, 'ERROR');
    return {
      success: false,
      error: String(error)
    };
  }
}
