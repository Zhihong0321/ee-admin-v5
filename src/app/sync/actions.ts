"use server";

import { db } from "@/lib/db";
import { invoices, payments, submitted_payments, agents, users, sedaRegistration } from "@/db/schema";
import { syncCompleteInvoicePackage } from "@/lib/bubble";
import { revalidatePath } from "next/cache";
import { logSyncActivity, getLatestLogs } from "@/lib/logger";
import { eq, sql, and, or, isNull, isNotNull, inArray } from "drizzle-orm";

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

    logSyncActivity(`Found ${demoInvoiceIds.length} demo invoices. ${sedaIdsToDelete.length} linked SEDA registrations will also be deleted.`, 'INFO');

    // 3. Perform Deletion
    // A. Delete SEDA Registrations
    let sedaDeletedCount = 0;
    if (sedaIdsToDelete.length > 0) {
      // Chunking if too many (unlikely to exceed postgres limits here but good practice)
      // PostgreSQL limit is 65535 parameters. 
      await db.delete(sedaRegistration).where(inArray(sedaRegistration.bubble_id, sedaIdsToDelete));
      sedaDeletedCount = sedaIdsToDelete.length;
      logSyncActivity(`Deleted ${sedaDeletedCount} SEDA registrations.`, 'INFO');
    }

    // B. Delete Invoices
    // We use the ID list
    await db.delete(invoices).where(inArray(invoices.id, demoInvoiceIds));
    
    logSyncActivity(`Deleted ${demoInvoiceIds.length} Demo Invoices.`, 'INFO');

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return {
      success: true,
      deletedInvoices: demoInvoiceIds.length,
      deletedSeda: sedaDeletedCount,
      message: `Successfully deleted ${demoInvoiceIds.length} demo invoices and ${sedaDeletedCount} associated SEDA registrations.`
    };

  } catch (error) {
    logSyncActivity(`Delete Demo Invoices Job CRASHED: ${String(error)}`, 'ERROR');
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
