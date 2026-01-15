"use server";

import { db } from "@/lib/db";
import { invoices, payments, submitted_payments } from "@/db/schema";
import { syncCompleteInvoicePackage } from "@/lib/bubble";
import { revalidatePath } from "next/cache";
import { logSyncActivity, getLatestLogs } from "@/lib/logger";
import { eq, sql, and, or } from "drizzle-orm";

export async function runManualSync(dateFrom?: string, dateTo?: string, syncFiles = false) {
  logSyncActivity(`Manual Sync Triggered: ${dateFrom || 'All'} to ${dateTo || 'All'}, syncFiles: ${syncFiles}`, 'INFO');
  
  try {
    const result = await syncCompleteInvoicePackage(dateFrom, dateTo, syncFiles);
    
    if (result.success) {
      logSyncActivity(`Manual Sync SUCCESS: ${result.results?.syncedInvoices} invoices, ${result.results?.syncedCustomers} customers`, 'INFO');
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

export async function runIncrementalSync() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return await runManualSync(yesterday, undefined, true);
}

export async function fetchSyncLogs() {
  return getLatestLogs(100);
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
