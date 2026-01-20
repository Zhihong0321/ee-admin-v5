/**
 * FAST INVOICE SYNC BY ID LIST
 *
 * Paste a list of invoice Bubble IDs to sync directly
 * No need to fetch all invoices from Bubble - much faster!
 */

import { syncInvoiceWithFullIntegrity } from "./integrity-sync";
import {
  updateSyncProgress,
  completeSyncProgress,
  errorSyncProgress
} from "./sync-progress";

export interface SyncInvoiceListOptions {
  syncSessionId?: string;
  skipUsers?: boolean;  // Skip syncing users (rarely change)
  skipAgents?: boolean; // Skip syncing agents (rarely change)
  onProgress?: (current: number, total: number, message: string) => void;
}

export interface SyncInvoiceListResult {
  success: boolean;
  results: {
    total: number;
    synced: number;
    skipped: number;
    failed: number;
    errors: string[];
  };
  syncSessionId?: string;
}

/**
 * Sync a list of invoices by their Bubble IDs
 *
 * Usage: Paste list from Bubble ERP → Sync directly
 * Much faster than date range sync
 */
export async function syncInvoiceListByIds(
  invoiceIds: string[],
  options: SyncInvoiceListOptions = {}
): Promise<SyncInvoiceListResult> {
  const {
    syncSessionId,
    skipUsers = true,  // Default: skip users (rarely change)
    skipAgents = true, // Default: skip agents (rarely change)
    onProgress
  } = options;

  if (invoiceIds.length === 0) {
    return {
      success: true,
      results: {
        total: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        errors: []
      }
    };
  }

  console.log(`[ID List Sync] Starting sync for ${invoiceIds.length} invoices`);
  console.log(`[ID List Sync] Skip users: ${skipUsers}, Skip agents: ${skipAgents}`);

  // Initialize progress in database if sessionId provided
  if (syncSessionId) {
    await updateSyncProgress(syncSessionId, {
      total_invoices: invoiceIds.length,
      synced_invoices: 0,
    });
  }

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < invoiceIds.length; i++) {
    const invoiceId = invoiceIds[i].trim();

    if (!invoiceId) continue;

    onProgress?.(i + 1, invoiceIds.length, `Syncing invoice ${invoiceId}...`);

    try {
      const result = await syncInvoiceWithFullIntegrity(invoiceId, {
        force: false, // Skip if up-to-date
        skipUsers,
        skipAgents,
        onProgress: (step, message) => {
          console.log(`[${invoiceId}] ${step}: ${message}`);
        }
      });

      if (result.success) {
        if (result.steps.some(s => s.action === 'skip')) {
          skipped++;
        } else {
          synced++;
        }
      } else {
        failed++;
        errors.push(...result.errors);
      }

      // Update progress in database
      if (syncSessionId) {
        await updateSyncProgress(syncSessionId, {
          synced_invoices: synced + skipped, // Total processed
          current_invoice_id: invoiceId,
        });
      }

      // Log progress every 10 invoices
      if ((i + 1) % 10 === 0) {
        console.log(`[ID List Sync] Progress: ${i + 1}/${invoiceIds.length}`);
      }
    } catch (error: any) {
      failed++;
      errors.push(`${invoiceId}: ${error.message}`);
      console.error(`[ID List Sync] Failed to sync ${invoiceId}:`, error.message);
    }
  }

  console.log(`[ID List Sync] Complete! Synced: ${synced}, Skipped: ${skipped}, Failed: ${failed}`);

  // Mark progress as completed
  if (syncSessionId) {
    await completeSyncProgress(syncSessionId, { synced });
  }

  return {
    success: true,
    results: {
      total: invoiceIds.length,
      synced,
      skipped,
      failed,
      errors
    },
    syncSessionId
  };
}
