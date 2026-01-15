"use server";

import { syncCompleteInvoicePackage } from "@/lib/bubble";
import { revalidatePath } from "next/cache";
import { logSyncActivity, getLatestLogs } from "@/lib/logger";

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
