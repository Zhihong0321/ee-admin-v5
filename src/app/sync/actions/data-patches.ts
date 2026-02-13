"use server";
import { desc } from "drizzle-orm";

/**
 * ============================================================================
 * DATA PATCH OPERATIONS
 * ============================================================================
 *
 * Post-sync data patching operations to fix calculated fields, statuses,
 * and creator references. These operations run after syncs to ensure
 * data consistency.
 *
 * Functions:
 * - updateInvoicePaymentPercentages: DEPRECATED
 * - updatePaymentCalculations: Recalculate percent_of_total_amount, paid status, and full_payment_date
 * - patchInvoiceCreators: Fill in missing created_by from agent relationships
 * - updateInvoiceStatuses: Update status based on payment/SEDA state
 *
 * File: src/app/sync/actions/data-patches.ts
 */

import { db } from "@/lib/db";
import { invoices, payments, submitted_payments, users, agents, sedaRegistration } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { eq, sql, and, isNull, isNotNull, or } from "drizzle-orm";

/**
 * ============================================================================
 * FUNCTION: updateInvoicePaymentPercentages
 * ============================================================================
 *
 * INTENT (What & Why):
 * Calculate and populate percent_of_total_amount field for all invoices.
 * This is a calculated field that sums up all linked payments and compares
 * to invoice total_amount.
 *
 * CALCULATION:
 * percent_of_total_amount = (sum_of_all_payments / total_amount) * 100
 *
 * INPUTS:
 * None (operates on all invoices with total_amount > 0)
 *
 * OUTPUTS:
 * @returns { success: boolean, updated: number, skipped: number, message: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Fetch all invoices with total_amount > 0
 * 2. For each invoice:
 *    a. If no linked_payments → Skip
 *    b. Fetch all payments and submitted_payments by bubble_id
 *    c. Sum up payment amounts
 *    d. Calculate percentage: (totalPaid / totalAmount) * 100
 *    e. Update invoice.percent_of_total_amount
 * 3. Return counts (updated, skipped)
 *
 * PAYMENT LOOKUP STRATEGY:
 * - Checks both payments table and submitted_payments table
 * - Uses bubble_id to match linked_payment array items
 * - Sums amounts from both tables (payments can move between them)
 *
 * EDGE CASES:
 * - Invoice with no payments → Skipped (percent would be 0% anyway)
 * - total_amount = 0 or null → Skipped (division by zero)
 * - Payment not found in either table → Assumes amount = 0, continues
 *
 * SIDE EFFECTS:
 * - Updates invoice.percent_of_total_amount for all matching invoices
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: db.query.payments, db.query.submitted_payments, db.update(invoices)
 * - Used by: src/app/sync/page.tsx (Update Payment Percentages button)
 */
export async function updateInvoicePaymentPercentages() {
  logSyncActivity(`DEPRECATED: updateInvoicePaymentPercentages called but disabled.`, 'WARN');
  return {
    success: false,
    error: "This function is deprecated and disabled. Please do not use."
  };
}

/**
 * ============================================================================
 * FUNCTION: updatePaymentCalculations
 * ============================================================================
 * 
 * INTENT:
 * Recalculate payment percentages and update payment status/dates.
 * 
 * LOGIC:
 * 1. Calculate percent_of_total_amount = (sum of verified payments / total amount) * 100
 * 2. If percent >= 100, set paid = true
 * 3. Update full_payment_date = date of the last payment (if fully paid)
 * 
 * INPUTS:
 * None (scans all invoices)
 */
export async function updatePaymentCalculations() {
  logSyncActivity("Starting 'Update Payment Calculations' job...", 'INFO');

  try {
    // 1. Fetch all invoices
    const allInvoices = await db.select({
      id: invoices.id,
      bubble_id: invoices.bubble_id,
      invoice_number: invoices.invoice_number,
      total_amount: invoices.total_amount,
      amount: invoices.amount,
      linked_payment: invoices.linked_payment,
    })
      .from(invoices)
      .where(and(
        sql`${invoices.status} != 'deleted'`,
        or(
          isNotNull(invoices.total_amount),
          isNotNull(invoices.amount)
        )
      ));

    logSyncActivity(`Processing ${allInvoices.length} invoices...`, 'INFO');

    let updatedCount = 0;
    let fullyPaidCount = 0;

    // Pre-fetch all payments for performance
    // Using a map for O(1) access: bubble_id -> { amount, date }
    const allPayments = await db.select({
      bubble_id: payments.bubble_id,
      amount: payments.amount,
      payment_date: payments.payment_date
    }).from(payments);

    const paymentMap = new Map<string, { amount: number, date: Date | null }>();
    allPayments.forEach(p => {
      if (p.bubble_id) {
        paymentMap.set(p.bubble_id, {
          amount: parseFloat(p.amount || '0'),
          date: p.payment_date ? new Date(p.payment_date) : null
        });
      }
    });

    for (const inv of allInvoices) {
      const totalAmount = parseFloat(inv.total_amount || inv.amount || '0');

      if (totalAmount <= 0) continue;

      let totalPaid = 0;
      let lastPaymentDate: Date | null = null;

      if (inv.linked_payment && inv.linked_payment.length > 0) {
        // Iterate through linked payments
        for (const pid of inv.linked_payment) {
          if (!pid) continue;
          const pData = paymentMap.get(pid);
          if (pData) {
            totalPaid += pData.amount;

            // Track latest payment date
            if (pData.date) {
              if (!lastPaymentDate || pData.date > lastPaymentDate) {
                lastPaymentDate = pData.date;
              }
            }
          }
        }
      }

      // 1. Calculate Percentage
      // Clamp between 0.00 and 100.00? User said "0.00 ~ 100.00"
      let percent = (totalPaid / totalAmount) * 100;
      if (percent < 0) percent = 0;
      // Allow > 100 technically but usually capped. User request implied 0~100.
      // Let's cap at 100 for the field, but logic for "paid" is >= 100.
      // Actually, let's store exact first, but formatted.

      // Update Logic
      const isPaid = percent >= 99.9; // Handling float rounding errors, slightly tolerant
      if (isPaid) fullyPaidCount++;

      // If paid, use last payment date. Else null? Or keep existing?
      // Request: "update invoice.full_payment_date = last payment.payment_date"
      // Implies only if fully paid.
      const fullPaymentDate = isPaid ? lastPaymentDate : null;

      // Update DB
      await db.update(invoices)
        .set({
          percent_of_total_amount: percent.toFixed(2),
          paid: isPaid,
          full_payment_date: fullPaymentDate,
          updated_at: new Date()
        })
        .where(eq(invoices.id, inv.id));

      updatedCount++;
    }

    logSyncActivity(`Payment calculations complete. Updated ${updatedCount} invoices. Fully Paid: ${fullyPaidCount}`, 'INFO');
    revalidatePath("/invoices");

    return {
      success: true,
      updated: updatedCount,
      fully_paid: fullyPaidCount,
      message: `Updated ${updatedCount} invoices. identified ${fullyPaidCount} as fully paid.`
    };

  } catch (error) {
    logSyncActivity(`Update Payment Calculations CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: patchInvoiceCreators
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fill in missing created_by fields by looking up the user linked to the
 * invoice's agent. Invoice has linked_agent, Agent has linked User,
 * User.bubble_id should be Invoice.created_by.
 *
 * RELATIONSHIP CHAIN:
 * Invoice.linked_agent → Agent.bubble_id → User.linked_agent_profile → User.bubble_id → Invoice.created_by
 *
 * INPUTS:
 * None (operates on all invoices with created_by = NULL)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   fixed: number,
 *   unfixable: number,
 *   agent_no_user: number,
 *   total_nulls: number,
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Count all invoices with created_by = NULL
 * 2. Find fixable invoices (created_by = NULL AND linked_agent IS NOT NULL)
 * 3. For each fixable invoice:
 *    a. Fetch Agent by invoice.linked_agent
 *    b. Fetch User where user.linked_agent_profile = agent.bubble_id
 *    c. If user found, update invoice.created_by = user.bubble_id
 *    d. If user not found, log warning (agent has no user account)
 * 4. Count unfixable invoices (created_by = NULL AND linked_agent = NULL)
 * 5. Return statistics
 *
 * FIXABLE vs UNFIXABLE:
 * - Fixable: Has linked_agent but missing created_by (can look up user)
 * - Unfixable: No linked_agent (orphaned invoice, cannot determine creator)
 * - Agent has no user: Agent exists but no linked user account (data quality issue)
 *
 * EDGE CASES:
 * - Agent ID exists in invoice but not in agents table → Logs error, counts as agent_no_user
 * - User exists but has no bubble_id → Should not happen, logs error
 * - No invoices need patching → Returns fixed: 0
 *
 * SIDE EFFECTS:
 * - Updates invoice.created_by for fixable invoices
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: db.query.invoices, db.query.agents, db.query.users, db.update(invoices)
 * - Used by: src/app/sync/page.tsx (Patch Invoice Creators button)
 */
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

/**
 * ============================================================================
 * FUNCTION: updateInvoiceStatuses
 * ============================================================================
 *
 * INTENT (What & Why):
 * Update invoice.status field based on payment percentage and SEDA form status.
 * This is a calculated field that reflects the current state of each invoice.
 *
 * STATUS LOGIC (Priority Order):
 * 1. 'SEDA APPROVED' - If SEDA form status = 'APPROVED' (highest priority)
 * 2. 'FULLY PAID' - If payment percentage >= 99.9%
 * 3. 'DEPOSIT' - If payment percentage > 0% and < 50%
 * 4. 'draft' - If no payments AND no SEDA form
 *
 * INPUTS:
 * None (operates on all non-deleted invoices)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   updated: number,
 *   processed: number,
 *   changes: { draft: number, deposit: number, seda_approved: number, fully_paid: number, other: number },
 *   message: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Fetch all non-deleted invoices with relevant fields
 * 2. For each invoice:
 *    a. Calculate total paid from linked payments
 *    b. Fetch SEDA registration status (if exists)
 *    c. Determine new status based on priority logic
 *    d. If status changed, update invoice.status
 *    e. Track status change counts
 * 3. Return statistics
 *
 * PAYMENT CALCULATION:
 * - Checks both payments and submitted_payments tables
 * - Sums all payment amounts
 * - Calculates percentage: (totalPaid / totalAmount) * 100
 *
 * STATUS PRIORITY:
 * - SEDA APPROVED takes precedence over payment status
 * - FULLY PAID (>= 99.9%) prevents DEPOSIT status
 * - DEPOSIT only applies between 0-50% paid
 * - draft is default (no payments, no SEDA)
 *
 * EDGE CASES:
 * - Invoice with total_amount = 0 → paymentPercent = 0, treats as unpaid
 * - SEDA status case-insensitive → 'APPROVED' = 'Approved' = 'approved'
 * - Status already correct → Skips update, not counted in 'updated'
 *
 * SIDE EFFECTS:
 * - Updates invoice.status for all non-deleted invoices
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: db.query.invoices, db.query.payments, db.query.submitted_payments, db.query.sedaRegistration, db.update(invoices)
 * - Used by: src/app/sync/page.tsx (Update Invoice Statuses button)
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
