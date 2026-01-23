"use server";

/**
 * ============================================================================
 * INTEGRITY-FIRST SYNC OPERATIONS
 * ============================================================================
 *
 * Integrity sync uses complete field mappings (zero data loss), respects
 * dependency order (syncs relations first), and implements MERGE logic
 * (preserves local-only fields).
 *
 * Functions:
 * - runIntegritySync: Single invoice with full integrity
 * - runIntegrityBatchSync: Batch sync with date range
 * - runInvoiceIdListSync: Fast sync by ID list with integrity
 *
 * File: src/app/sync/actions/integrity-sync.ts
 */

import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { syncInvoiceWithFullIntegrity, syncBatchInvoicesWithIntegrity } from "@/lib/integrity-sync";
import { createSyncProgress } from "@/lib/sync-progress";
import { restoreInvoiceSedaLinks } from "./link-restoration";
import { patchSedaCustomerLinks } from "./link-restoration";

/**
 * ============================================================================
 * FUNCTION: runIntegritySync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Integrity-first sync for a single invoice. Uses complete field mappings
 * (zero data loss), respects dependency order (syncs relations before invoice),
 * and implements MERGE logic (preserves local-only fields during updates).
 *
 * BEST FOR:
 * - Syncing critical invoices that must be 100% accurate
 * - Testing sync functionality
 * - Fixing broken invoice data
 *
 * INPUTS:
 * @param invoiceBubbleId - string (required): The Bubble ID of the invoice to sync
 * @param options.force - boolean (default: false): Skip timestamp check and force sync
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   invoiceId: string,
 *   steps: string[],
 *   errors: string[],
 *   stats: { agent: number, customer: number, user: number, ... }
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Fetch invoice from Bubble by ID
 * 2. Extract all relation IDs (customer, agent, payments, SEDA, items, template)
 * 3. SYNC DEPENDENCIES FIRST (order matters):
 *    a. Sync Agent (if exists)
 *    b. Sync Customer (if exists)
 *    c. Sync User linked to Agent (if exists)
 *    d. Sync Payments (all in linked_payment array)
 *    e. Sync Submitted Payments (all in linked_payment array)
 *    f. Sync Invoice Items (all items)
 *    g. Sync SEDA Registration (if exists)
 *    h. Sync Invoice Template (if exists)
 * 4. Sync Invoice LAST (after all dependencies)
 * 5. For each entity: Use MERGE logic (preserve local-only fields)
 * 6. Auto-patch links after successful sync
 *
 * MERGE LOGIC:
 * - If record doesn't exist → INSERT all fields
 * - If record exists → UPDATE only known fields, preserve unknown fields
 * - Prevents data loss when new fields added to Bubble
 *
 * EDGE CASES:
 * - Customer/Agent not found in Bubble → Logs error, continues sync
 * - force=true → Syncs even if local copy is newer
 * - Partial success → Returns success: true with errors array
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (all invoice-related tables)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 * - Calls onProgress callback with step updates
 *
 * DEPENDENCIES:
 * - Requires: syncInvoiceWithFullIntegrity(), restoreInvoiceSedaLinks(), patchSedaCustomerLinks()
 * - Used by: src/app/sync/page.tsx (Integrity Sync form)
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
 * ============================================================================
 * FUNCTION: runIntegrityBatchSync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Integrity-first batch sync for multiple invoices within a date range.
 * Recommended method for bulk syncs. Uses same integrity guarantees as
 * runIntegritySync (complete mappings, dependency order, MERGE logic).
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - skipUsers: Skips syncing users (they rarely change) - DEFAULT: true
 * - skipAgents: Skips syncing agents (they rarely change) - DEFAULT: true
 *
 * INPUTS:
 * @param dateFrom - ISO date string (required): Start date for sync window
 * @param dateTo - ISO date string (optional): End date. Defaults to present.
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   results: { total: number, synced: number, skipped: number, failed: number, errors: string[] },
 *   syncSessionId: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Create sync progress session in database
 * 2. Fetch all invoices within date range from Bubble
 * 3. Filter by Modified Date (Bubble API limitation: fetch all, filter locally)
 * 4. For each invoice:
 *    a. Check if newer than local copy
 *    b. If newer, run integrity sync (same logic as runIntegritySync)
 *    c. Update progress session
 * 5. Return results with syncSessionId for progress tracking
 *
 * PROGRESS TRACKING:
 * - UI can query /api/sync/progress/[syncSessionId] for real-time updates
 * - Progress includes: total, synced, skipped, failed counts
 * - onProgress callback called for each invoice processed
 *
 * EDGE CASES:
 * - No invoices in date range → Returns success with total: 0
 * - Some invoices fail → Continues processing, reports failed count
 * - Network error mid-batch → Resumable via syncSessionId
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (all invoice-related tables)
 * - Writes to sync_progress table
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncBatchInvoicesWithIntegrity(), createSyncProgress()
 * - Used by: src/app/sync/page.tsx (Integrity Batch Sync form)
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
      skipUsers: true, // Skip syncing users (faster - they rarely change)
      skipAgents: true, // Skip syncing agents (faster - they rarely change)
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

      // NOTE: Skipping auto link patching - integrity sync already handles proper linking
      // The sync process correctly sets linked_seda_registration during invoice sync
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

/**
 * ============================================================================
 * FUNCTION: runInvoiceIdListSync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Fast integrity-first sync for specific invoice IDs. Paste a list of Bubble IDs
 * to sync directly. Much faster than date range sync - no need to fetch all
 * invoices. Uses same integrity guarantees as runIntegritySync.
 *
 * USAGE:
 * User pastes invoice IDs (one per line or comma-separated) from Bubble UI.
 * System parses IDs and runs integrity sync for each.
 *
 * INPUTS:
 * @param invoiceIdText - string (required): List of invoice IDs (newline or comma separated)
 * @param skipUsers - boolean (default: true): Skip syncing users for speed
 * @param skipAgents - boolean (default: true): Skip syncing agents for speed
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   results: { total: number, synced: number, skipped: number, failed: number, errors: string[] },
 *   syncSessionId: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Parse invoice IDs from text (handle newlines, commas, spaces)
 * 2. Create sync progress session in database
 * 3. For each invoice ID:
 *    a. Fetch invoice from Bubble
 *    b. Run integrity sync (same logic as runIntegritySync)
 *    c. Update progress session
 * 4. Return results with syncSessionId
 *
 * ID PARSING:
 * Handles multiple formats:
 * - Newline separated: "1647839483923x8394832\n1647839483926x8394835"
 * - Comma separated: "1647839483923x8394832, 1647839483926x8394835"
 * - Mixed: "1647839483923x8394832, \n1647839483926x8394835"
 *
 * EDGE CASES:
 * - Empty input → Returns success: false with error message
 * - Invalid IDs → Logs error, counts as failed
 * - IDs not found in Bubble → Logs error, continues processing
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (all invoice-related tables)
 * - Writes to sync_progress table
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncInvoiceListByIds() from @/lib/integrity-sync-idlist
 * - Used by: src/app/sync/page.tsx (Invoice ID List Sync form)
 */
export async function runInvoiceIdListSync(
  invoiceIdText: string,
  skipUsers: boolean = true,
  skipAgents: boolean = true
) {
  logSyncActivity(`Fast Invoice ID List Sync triggered`, 'INFO');

  // Parse invoice IDs from text (handle newlines, commas, spaces)
  const invoiceIds = invoiceIdText
    .split(/[\n,\s]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);

  if (invoiceIds.length === 0) {
    return {
      success: false,
      error: 'No invoice IDs found. Please paste a list of invoice Bubble IDs.'
    };
  }

  logSyncActivity(`Parsing ${invoiceIds.length} invoice IDs from paste`, 'INFO');

  // Create sync progress session
  const syncSessionId = await createSyncProgress();
  logSyncActivity(`Created sync progress session: ${syncSessionId}`, 'INFO');

  try {
    const { syncInvoiceListByIds } = await import('@/lib/integrity-sync-idlist');

    const result = await syncInvoiceListByIds(invoiceIds, {
      syncSessionId,
      skipUsers,
      skipAgents,
      onProgress: (current, total, message) => {
        logSyncActivity(`[${current}/${total}] ${message}`, 'INFO');
      }
    });

    if (result.success) {
      logSyncActivity(`✅ ID List Sync SUCCESS!`, 'INFO');
      logSyncActivity(`Total: ${result.results.total}, Synced: ${result.results.synced}, Skipped: ${result.results.skipped}, Failed: ${result.results.failed}`, 'INFO');

      if (result.results.errors.length > 0) {
        logSyncActivity(`⚠️  ${result.results.errors.length} error(s) occurred`, 'ERROR');
        result.results.errors.slice(0, 10).forEach((err) => {
          logSyncActivity(`  • ${err}`, 'ERROR');
        });
      }

      // NOTE: Skipping auto link patching for ID list sync to avoid overhead
      // The integrity sync already handles proper linking during sync
    } else {
      logSyncActivity(`❌ ID List Sync FAILED`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return {
      ...result,
      syncSessionId,
    };
  } catch (error) {
    logSyncActivity(`ID List Sync CRASHED: ${String(error)}`, 'ERROR');
    return {
      success: false,
      results: {
        total: invoiceIds.length,
        synced: 0,
        skipped: 0,
        failed: invoiceIds.length,
        errors: [String(error)]
      },
      syncSessionId,
    };
  }
}
