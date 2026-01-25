"use server";

/**
 * ============================================================================
 * SEDA SYNC OPERATIONS
 * ============================================================================
 *
 * SEDA (Sustainable Energy Development Authority) registration sync.
 * Syncs SEDA registrations within a date range without affecting other data.
 *
 * Functions:
 * - runSedaOnlySync: SEDA-only sync with date range filtering
 *
 * File: src/app/sync/actions/seda-sync.ts
 */

import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { restoreInvoiceSedaLinks } from "./link-restoration";
import { patchSedaCustomerLinks } from "./link-restoration";

/**
 * ============================================================================
 * FUNCTION: runSedaOnlySync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Sync SEDA registrations within a date range without syncing invoices or
 * other related data. Useful when only SEDA forms have been updated in Bubble.
 *
 * DIFFERENCES FROM FULL SYNC:
 * - Only syncs SEDA registrations table
 * - Does NOT sync invoices, customers, agents, payments
 * - Overwrites local data if Bubble version is newer
 *
 * INPUTS:
 * @param dateFrom - ISO date string (required): Start of sync window
 * @param dateTo - ISO date string (optional): End of sync window. Defaults to present.
 *
 * OUTPUTS:
 * @returns { success: boolean, results?: { syncedSedas: number, ... }, error?: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Call syncSedaRegistrations from @/lib/bubble
 * 2. Fetch SEDA registrations from Bubble within date range
 * 3. Upsert to PostgreSQL (bubble_id as conflict key)
 * 4. On success, restore Invoice→SEDA links from SEDA.linked_invoice array
 * 5. Patch SEDA→Customer links from Invoice.linked_customer
 * 6. Revalidate Next.js cached paths
 * 7. Return sync results
 *
 * AUTO-PATCHES (Why we patch after sync):
 * - Patch 1 (Invoice→SEDA): SEDA has linked_invoice array but invoice.linked_seda_registration may be missing
 * - Patch 2 (SEDA→Customer): SEDA.linked_customer may not be populated
 *
 * EDGE CASES:
 * - No SEDAs in date range → Returns success with syncedSedas: 0
 * - Network failure → Returns success: false with error message
 * - Partial sync → Returns results with synced count, may have skipped count
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (seda_registration table)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncSedaRegistrations() from @/lib/bubble
 * - Used by: src/app/sync/page.tsx (SEDA-Only Sync form)
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
