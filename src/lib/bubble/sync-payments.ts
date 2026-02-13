/**
 * ============================================================================
 * PAYMENT SYNC WITH DELETION TRACKING
 * ============================================================================
 *
 * Syncs payment records from Bubble with intelligent deletion tracking.
 * Detects new payments and syncs their full invoice chains.
 *
 * File: src/lib/bubble/sync-payments.ts
 */

import { db } from "@/lib/db";
import { payments, submitted_payments, invoices, customers, agents } from "@/db/schema";
import { logSyncActivity } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { BUBBLE_BASE_URL, BUBBLE_API_HEADERS } from "./client";
import { fetchBubbleRecordByTypeName, fetchAllBubbleIds } from "./fetch-helpers";
import { getInvoiceTotalWithFallback } from "./utils";

/**
 * Helper to parse Bubble attachment field (usually a string URL or "//" empty ref)
 */
function parseAttachment(value: any): string[] | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "//") return null;
  // If it starts with // (common in Bubble), we keep it as is or add https:
  // The UI usually handles // URLs, but storing as an array as per schema
  return [trimmed];
}

/**
 * ============================================================================
 * FUNCTION: syncPaymentsFromBubble
 * ============================================================================
 *
 * INTENT (What & Why):
 * Complete payment sync with four key features:
 * 1. Syncs all payment records from Bubble (overwrites local)
 * 2. Syncs all submit_payment records (overwrites local)
 * 3. DELETES submitted_payments that no longer exist in Bubble (verified payments)
 * 4. For NEW payments detected, traces linked_invoice and syncs full invoice chain
 *
 * DELETION TRACKING STRATEGY:
 * - Fetch all Bubble IDs for payments and submit_payments
 * - Compare with local IDs in PostgreSQL
 * - Local IDs not in Bubble = verified payments (deleted from Bubble)
 * - Hard delete from submitted_payments table
 *
 * INVOICE CHAIN SYNC STRATEGY:
 * - New payments detected (exist in Bubble, not locally)
 * - Extract linked_invoice IDs from new payments
 * - Fetch invoices from Bubble
 * - Sync invoices with all relations (customer, agent, SEDA, etc.)
 *
 * INPUTS:
 * None (syncs all payment records)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   results: {
 *     syncedPayments: number,
 *     syncedSubmittedPayments: number,
 *     deletedSubmittedPayments: number,
 *     syncedInvoicesFromPayments: number,
 *     errors: string[]
 *   },
 *   error?: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Fetch all Bubble IDs (payment, submit_payment)
 * 2. Get local IDs to detect new payments and deleted submissions
 * 3. Sync all payment records (overwrite)
 * 4. Sync all submit_payment records (overwrite)
 * 5. Delete verified submitted_payments (exist locally but not in Bubble)
 * 6. For new payments, trace linked_invoice and sync invoice chain
 * 7. Return results
 *
 * INVOICE CHAIN SYNC (Step 6 Detail):
 * For each invoice linked to new payments:
 * a. Fetch invoice from Bubble
 * b. Use fallback logic to preserve total_amount
 * c. Upsert invoice to PostgreSQL
 * d. If invoice has linked_customer, sync customer
 * e. If invoice has linked_agent, sync agent
 *
 * EDGE CASES:
 * - Payment doesn't exist in Bubble (404) → Logs error, continues
 * - Invoice chain sync fails → Logs error, continues with next invoice
 * - No new payments → Skips invoice chain sync
 *
 * SIDE EFFECTS:
 * - Writes to payments, submitted_payments tables (full sync)
 * - Hard deletes from submitted_payments (verified payments only)
 * - Writes to invoices, customers, agents tables (for new payments)
 * - Calls logSyncActivity() for audit trail
 *
 * DEPENDENCIES:
 * - Requires: fetchAllBubbleIds(), fetchBubbleRecordByTypeName(), getInvoiceTotalWithFallback()
 * - Used by: Scheduled payment sync jobs
 *
 * CRITICAL NOTE:
 * This function performs HARD DELETE on verified submitted_payments.
 * Records are permanently removed from PostgreSQL. This is intentional
 * because verified payments are moved from submit_payment → payment in Bubble.
 */
export async function syncPaymentsFromBubble() {
  const results = {
    syncedPayments: 0,
    syncedSubmittedPayments: 0,
    deletedSubmittedPayments: 0,
    syncedInvoicesFromPayments: 0,
    errors: [] as string[]
  };

  try {
    logSyncActivity('Payment Sync: Starting full payment sync with deletion tracking...', 'INFO');

    // Step 1: Fetch all Bubble IDs for both tables
    logSyncActivity('Step 1: Fetching payment IDs from Bubble...', 'INFO');
    const bubblePaymentIds = await fetchAllBubbleIds('payment');
    const bubbleSubmittedPaymentIds = await fetchAllBubbleIds('submit_payment');
    logSyncActivity(`Found ${bubblePaymentIds.size} payments, ${bubbleSubmittedPaymentIds.size} submitted payments in Bubble`, 'INFO');

    // Step 2: Get local IDs to detect new payments and deleted submissions
    logSyncActivity('Step 2: Comparing with local database...', 'INFO');
    const localPayments = await db.query.payments.findMany({
      columns: { bubble_id: true, linked_invoice: true }
    });
    const localPaymentIds = new Set(localPayments.map(p => p.bubble_id).filter((id): id is string => id !== null));

    const localSubmittedPayments = await db.query.submitted_payments.findMany({
      columns: { bubble_id: true }
    });
    const localSubmittedPaymentIds = new Set(localSubmittedPayments.map(p => p.bubble_id).filter((id): id is string => id !== null));

    // Detect new payments (exist in Bubble but not locally)
    const newPaymentIds = Array.from(bubblePaymentIds).filter(id => !localPaymentIds.has(id));
    logSyncActivity(`Detected ${newPaymentIds.length} new payments`, 'INFO');

    // Detect deleted submitted_payments (exist locally but not in Bubble = verified)
    const deletedSubmittedPaymentIds = Array.from(localSubmittedPaymentIds).filter(id => !bubbleSubmittedPaymentIds.has(id));
    logSyncActivity(`Detected ${deletedSubmittedPaymentIds.length} verified submitted payments to delete`, 'INFO');

    // Step 3: Sync all payment records from Bubble (overwrite)
    logSyncActivity('Step 3: Syncing payment records from Bubble...', 'INFO');
    await syncTable('payment', payments, payments.bubble_id, (b) => ({
      amount: b.Amount?.toString(),
      payment_date: b["Payment Date"] ? new Date(b["Payment Date"]) : null,
      payment_method: b["Payment Method"] || b["Payment Method V2"],
      payment_method_v2: b["Payment Method V2"],
      remark: b.Remark,
      linked_agent: b["Linked Agent"],
      linked_customer: b["Linked Customer"],
      linked_invoice: b["Linked Invoice"],
      attachment: b.Attachment ? [b.Attachment] : null,
      issuer_bank: b["Issuer Bank"],
      epp_month: b["EPP Month"]?.toString(),
      epp_type: b["EPP Type"],
      created_by: b["Created By"],
      created_date: b["Created Date"] ? new Date(b["Created Date"]) : null,
      modified_date: new Date(b["Modified Date"]),
      last_synced_at: new Date()
    }), results);

    // Step 4: Sync all submit_payment records from Bubble (overwrite)
    logSyncActivity('Step 4: Syncing submitted payment records from Bubble...', 'INFO');
    await syncTable('submit_payment', submitted_payments, submitted_payments.bubble_id, (b) => ({
      amount: b.Amount?.toString(),
      payment_date: b["Payment Date"] ? new Date(b["Payment Date"]) : null,
      payment_method: b["Payment Method"] || b["Payment Method V2"],
      payment_method_v2: b["Payment Method V2"],
      remark: b.Remark,
      linked_agent: b["Linked Agent"],
      linked_customer: b["Linked Customer"],
      linked_invoice: b["Linked Invoice"],
      attachment: b.Attachment ? [b.Attachment] : null,
      issuer_bank: b["Issuer Bank"],
      epp_month: b["EPP Month"]?.toString(),
      epp_type: b["EPP Type"],
      created_by: b["Created By"],
      created_date: b["Created Date"] ? new Date(b["Created Date"]) : null,
      modified_date: new Date(b["Modified Date"]),
      status: b.Status || 'pending',
      last_synced_at: new Date()
    }), results);

    // Step 5: Delete submitted_payments that were verified in Bubble (no longer exist)
    if (deletedSubmittedPaymentIds.length > 0) {
      logSyncActivity(`Step 5: Deleting ${deletedSubmittedPaymentIds.length} verified submitted payments...`, 'INFO');
      for (const id of deletedSubmittedPaymentIds) {
        try {
          await db
            .delete(submitted_payments)
            .where(eq(submitted_payments.bubble_id, id));
          results.deletedSubmittedPayments++;
          logSyncActivity(`Deleted verified submitted_payment: ${id}`, 'INFO');
        } catch (err) {
          results.errors.push(`Delete submitted_payment ${id}: ${err}`);
          logSyncActivity(`Error deleting submitted_payment ${id}: ${err}`, 'ERROR');
        }
      }
    }

    // Step 6: For new payments, trace linked_invoice and sync invoice chain
    if (newPaymentIds.length > 0) {
      logSyncActivity(`Step 6: Syncing invoice chain for ${newPaymentIds.length} new payments...`, 'INFO');

      // Fetch the new payment details to get linked_invoice
      const newPayments = await Promise.all(
        newPaymentIds.map(id => fetchBubbleRecordByTypeName('payment', id))
      );

      // Collect unique invoice IDs to sync
      const invoiceIdsToSync = new Set<string>();
      for (const payment of newPayments) {
        if (payment["Linked Invoice"]) {
          invoiceIdsToSync.add(payment["Linked Invoice"]);
        }
      }

      logSyncActivity(`Found ${invoiceIdsToSync.size} unique invoices linked to new payments`, 'INFO');

      // Sync each invoice with its full chain
      for (const invoiceId of invoiceIdsToSync) {
        try {
          logSyncActivity(`Syncing invoice chain for invoice ${invoiceId}...`, 'INFO');

          // Fetch the invoice from Bubble
          const invoice = await fetchBubbleRecordByTypeName('invoice', invoiceId);

          // Get existing invoice to preserve local data if needed
          const existingInvoice = await db.query.invoices.findFirst({
            where: eq(invoices.bubble_id, invoiceId),
          });

          // Sync the invoice with all relations (customer, agent, payments, SEDA, etc.)
          // This uses the existing syncInvoicePackageWithRelations logic but for a single invoice

          const bubbleModifiedDate = new Date(invoice["Modified Date"]);
          const linkedItems = invoice["linked_invoice_item"] || invoice.linked_invoice_item || [];

          // Use fallback logic to preserve total_amount
          const total_amount = await getInvoiceTotalWithFallback(
            invoice["Total Amount"] || invoice.total_amount || invoice.Amount,
            linkedItems,
            existingInvoice?.total_amount
          );

          // Use fallback logic for amount field too
          const amount = await getInvoiceTotalWithFallback(
            invoice.Amount,
            linkedItems,
            existingInvoice?.amount
          );

          const vals = {
            invoice_id: invoice["Invoice ID"] || invoice.invoice_id || null,
            invoice_number: invoice["Invoice Number"] || invoice.invoice_number || null,
            linked_customer: invoice["Linked Customer"] || null,
            linked_agent: invoice["Linked Agent"] || null,
            linked_payment: invoice["Linked Payment"] || null,
            linked_seda_registration: invoice["Linked SEDA Registration"] || null,
            linked_invoice_item: linkedItems,
            amount: amount,
            total_amount: total_amount,
            status: invoice.Status || 'draft',
            invoice_date: invoice["Invoice Date"] ? new Date(invoice["Invoice Date"]) : null,
            created_at: invoice["Created Date"] ? new Date(invoice["Created Date"]) : new Date(),
            created_by: invoice["Created By"] || null,
            updated_at: bubbleModifiedDate,
            last_synced_at: new Date()
          };

          await db.insert(invoices).values({ bubble_id: invoiceId, ...vals })
            .onConflictDoUpdate({ target: invoices.bubble_id, set: vals });
          results.syncedInvoicesFromPayments++;

          // Sync customer if linked
          if (invoice["Linked Customer"]) {
            try {
              const customer = await fetchBubbleRecordByTypeName('Customer_Profile', invoice["Linked Customer"]);
              const customerVals = {
                name: customer.Name || customer.name || "",
                email: customer.Email || customer.email || null,
                phone: customer.Contact || customer.Whatsapp || customer.phone || null,
                address: customer.Address || customer.address || null,
                city: customer.City || customer.city || null,
                state: customer.State || customer.state || null,
                postcode: customer.Postcode || customer.postcode || null,
                ic_number: customer["IC Number"] || customer.ic_number || null,
                updated_at: new Date(customer["Modified Date"]),
                last_synced_at: new Date()
              };
              await db.insert(customers).values({ customer_id: invoice["Linked Customer"], ...customerVals })
                .onConflictDoUpdate({ target: customers.customer_id, set: customerVals });
            } catch (err) {
              results.errors.push(`Customer ${invoice["Linked Customer"]}: ${err}`);
            }
          }

          // Sync agent if linked
          if (invoice["Linked Agent"]) {
            try {
              const agent = await fetchBubbleRecordByTypeName('agent', invoice["Linked Agent"]);
              const agentVals = {
                name: agent.Name,
                email: agent.email,
                contact: agent.Contact,
                agent_type: agent["Agent Type"],
                address: agent.Address,
                bankin_account: agent.bankin_account,
                banker: agent.banker,
                ic_front: agent["IC Front"] || agent["ic_front"] || null,
                ic_back: agent["IC Back"] || agent["ic_back"] || null,
                updated_at: new Date(agent["Modified Date"]),
                last_synced_at: new Date()
              };
              await db.insert(agents).values({ bubble_id: invoice["Linked Agent"], ...agentVals })
                .onConflictDoUpdate({ target: agents.bubble_id, set: agentVals });
            } catch (err) {
              results.errors.push(`Agent ${invoice["Linked Agent"]}: ${err}`);
            }
          }

          logSyncActivity(`Synced invoice chain for ${invoiceId}`, 'INFO');
        } catch (err) {
          results.errors.push(`Invoice chain sync ${invoiceId}: ${err}`);
          logSyncActivity(`Error syncing invoice chain for ${invoiceId}: ${err}`, 'ERROR');
        }
      }
    }

    logSyncActivity(`Payment Sync Complete:`, 'INFO');
    logSyncActivity(`  - Synced ${results.syncedPayments} payments`, 'INFO');
    logSyncActivity(`  - Synced ${results.syncedSubmittedPayments} submitted payments`, 'INFO');
    logSyncActivity(`  - Deleted ${results.deletedSubmittedPayments} verified submitted payments`, 'INFO');
    logSyncActivity(`  - Synced ${results.syncedInvoicesFromPayments} invoices from new payments`, 'INFO');

    if (results.errors.length > 0) {
      logSyncActivity(`Errors: ${results.errors.length}`, 'ERROR');
      results.errors.slice(0, 5).forEach(e => logSyncActivity(e, 'ERROR'));
    }

    return { success: true, results };
  } catch (error) {
    console.error("Sync Payments Error:", error);
    logSyncActivity(`Payment Sync Error: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * SHARED HELPER: syncTable
 * ============================================================================
 *
 * Generic sync function (duplicated for module independence).
 */
async function syncTable(typeName: string, table: any, conflictCol: any, mapFn: (b: any) => any, results: any) {
  let cursor = 0;
  let remaining = 1;

  while (remaining > 0) {
    try {
      const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}`, { headers: BUBBLE_API_HEADERS });
      if (!res.ok) break;
      const data = await res.json();
      const records = data.response.results || [];
      remaining = data.response.remaining || 0;
      cursor += records.length;

      if (records.length === 0) break;

      for (const b of records) {
        try {
          const vals = mapFn(b);
          await db.insert(table).values({ bubble_id: b._id, ...vals })
            .onConflictDoUpdate({
              target: conflictCol,
              set: vals
            });
        } catch (err) {
          results.errors.push(`${typeName} ${b._id}: ${err}`);
        }
      }
    } catch (err) {
      console.error(`Error syncing ${typeName}:`, err);
      break;
    }
  }
}
