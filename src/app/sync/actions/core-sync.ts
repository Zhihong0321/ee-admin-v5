"use server";

/**
 * ============================================================================
 * CORE SYNC OPERATIONS
 * ============================================================================
 *
 * Core sync functionality for manual and incremental invoice synchronization.
 * These are the primary entry points for sync operations.
 *
 * Functions:
 * - runManualSync: Main sync function with date range filtering
 * - runIncrementalSync: Quick sync for last 24 hours
 * - startManualSyncWithProgress: Async sync with progress tracking via SSE
 *
 * File: src/app/sync/actions/core-sync.ts
 */

import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { syncCompleteInvoicePackage } from "@/lib/bubble";
import { restoreInvoiceSedaLinks } from "./link-restoration";
import { patchSedaCustomerLinks } from "./link-restoration";

/**
 * ============================================================================
 * FUNCTION: runManualSync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Primary sync function that fetches invoices from Bubble API within a date range
 * and stores them in PostgreSQL. Automatically patches data links after sync.
 *
 * INPUTS:
 * @param dateFrom - ISO date string (optional): Start of sync window. If undefined, syncs all history.
 * @param dateTo - ISO date string (optional): End of sync window. Defaults to current date.
 * @param syncFiles - boolean (default: false): Whether to download associated files
 * @param sessionId - string (optional): Progress tracking session ID for real-time UI updates
 *
 * OUTPUTS:
 * @returns { success: boolean, results?: { syncedInvoices: number, ... }, error?: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Call syncCompleteInvoicePackage to fetch and store data
 * 2. On success, restore Invoice→SEDA links from SEDA.linked_invoice array
 * 3. Patch SEDA→Customer links from Invoice.linked_customer
 * 4. Revalidate Next.js cached paths
 * 5. Return sync results
 *
 * AUTO-PATCHES (Why we patch after sync):
 * - Patch 1 (Invoice→SEDA): SEDA has linked_invoice array but invoice.linked_seda_registration was missing
 * - Patch 2 (SEDA→Customer): SEDA.linked_customer was not populated from invoice's customer
 *
 * EDGE CASES:
 * - No invoices in date range → Returns success with 0 synced
 * - Network failure → Returns success: false with error message
 * - Partial sync → Returns results with synced count, may have errors array
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (all invoice-related tables)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncCompleteInvoicePackage(), restoreInvoiceSedaLinks(), patchSedaCustomerLinks()
 * - Used by: src/app/sync/page.tsx (Manual Sync button)
 */
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

/**
 * ============================================================================
 * FUNCTION: runIncrementalSync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Quick sync for recent changes (last 24 hours). Useful for frequent updates
 * without syncing entire database.
 *
 * INPUTS:
 * None (uses fixed 24-hour window)
 *
 * OUTPUTS:
 * @returns { success: boolean, results?: {...}, error?: string }
 *
 * EXECUTION ORDER:
 * 1. Calculate yesterday's date (now - 24 hours)
 * 2. Call runManualSync with yesterday as dateFrom
 *
 * EDGE CASES:
 * - Inherits all edge cases from runManualSync
 *
 * SIDE EFFECTS:
 * - See runManualSync side effects
 *
 * DEPENDENCIES:
 * - Requires: runManualSync()
 * - Used by: src/app/sync/page.tsx (Incremental Sync button)
 */
export async function runIncrementalSync() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return await runManualSync(yesterday, undefined, true);
}

/**
 * ============================================================================
 * FUNCTION: startManualSyncWithProgress
 * ============================================================================
 *
 * INTENT (What & Why):
 * Starts manual sync in background with progress tracking. Returns immediately
 * with a sessionId. UI can poll SSE endpoint for real-time progress updates.
 *
 * INPUTS:
 * @param dateFrom - ISO date string (optional): Start of sync window
 * @param dateTo - ISO date string (optional): End of sync window
 * @param syncFiles - boolean (default: false): Whether to download files
 *
 * OUTPUTS:
 * @returns { success: boolean, sessionId: string } - sessionId for SSE progress tracking
 *
 * EXECUTION ORDER:
 * 1. Generate unique session ID (UUID)
 * 2. Create progress session in memory
 * 3. Run sync in background (non-blocking)
 * 4. Return sessionId immediately
 *
 * PROGRESS TRACKING:
 * - UI polls /api/sync/progress/[sessionId] for real-time updates
 * - Progress includes: current step, total steps, status message
 * - Background sync logs to progress session via updateProgress()
 *
 * EDGE CASES:
 * - Sync crashes in background → Error logged to progress session
 * - Session expires → Progress session auto-deleted after 1 hour
 *
 * SIDE EFFECTS:
 * - Creates in-memory progress session
 * - Spawns background async operation
 *
 * DEPENDENCIES:
 * - Requires: createProgressSession(), runManualSync()
 * - Used by: src/app/sync/page.tsx (Sync with Progress)
 */
export async function startManualSyncWithProgress(dateFrom?: string, dateTo?: string, syncFiles = false) {
  const { randomUUID } = await import("crypto");
  const { createProgressSession } = await import("@/lib/progress-tracker");

  const sessionId = randomUUID();
  createProgressSession(sessionId);

  // Run sync in background
  runManualSync(dateFrom, dateTo, syncFiles, sessionId).catch((error) => {
    logSyncActivity(`Background Sync Error: ${String(error)}`, 'ERROR');
  });

  return { success: true, sessionId };
}
