"use server";

/**
 * ============================================================================
 * INVOICE SYNC OPERATIONS
 * ============================================================================
 *
 * Invoice-specific sync operations with different strategies:
 * - Full sync with date range (syncs all relations)
 * - ID list sync (targeted sync for specific invoices)
 *
 * Functions:
 * - runFullInvoiceSync: Date range sync with relational data
 * - runIdListSync: CSV-based fast sync for specific IDs
 *
 * File: src/app/sync/actions/invoice-sync.ts
 */

import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { syncInvoicePackageWithRelations } from "@/lib/bubble";
import { restoreInvoiceSedaLinks } from "./link-restoration";
import { patchSedaCustomerLinks } from "./link-restoration";

/**
 * ============================================================================
 * FUNCTION: runFullInvoiceSync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Sync invoices within a date range with ALL relational data (customer, agent,
 * payments, SEDA, items). Unlike syncCompleteInvoicePackage, this directly
 * queries related tables ensuring complete data packages.
 *
 * KEY DIFFERENCES FROM syncCompleteInvoicePackage:
 * - Filters by invoice Modified Date range (dateFrom to dateTo)
 * - For each invoice, fetches ALL relations regardless of their timestamps
 * - Ensures complete invoice data packages (relations forced to sync)
 * - Does NOT download files (user handles file migration separately)
 *
 * INPUTS:
 * @param dateFrom - ISO date string (required): Start of sync window
 * @param dateTo - ISO date string (optional): End of sync window. Defaults to current date.
 * @param sessionId - string (optional): Progress tracking session ID
 *
 * OUTPUTS:
 * @returns { success: boolean, results?: { syncedInvoices: number, ... }, error?: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Call syncInvoicePackageWithRelations with date range
 * 2. On success, restore Invoice→SEDA links from SEDA.linked_invoice array
 * 3. Patch SEDA→Customer links from Invoice.linked_customer
 * 4. Revalidate Next.js cached paths
 * 5. Return sync results
 *
 * FORCE-SYNC BEHAVIOR:
 * If an invoice is newer in Bubble than PostgreSQL, ALL its related data
 * (customer, agent, payments, SEDA, items, templates) is synced regardless of
 * their individual timestamps. This prevents data inconsistencies.
 *
 * EDGE CASES:
 * - No invoices in date range → Returns success with 0 synced
 * - Customer/Agent not found in Bubble → Skips that relation, continues sync
 * - Network failure → Returns success: false with error message
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (invoices, customers, agents, payments, seda, templates)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncInvoicePackageWithRelations(), restoreInvoiceSedaLinks(), patchSedaCustomerLinks()
 * - Used by: src/app/sync/page.tsx (Full Invoice Sync form)
 */
export async function runFullInvoiceSync(dateFrom: string, dateTo?: string, sessionId?: string) {
  logSyncActivity(`Full Invoice Sync: ${dateFrom} to ${dateTo || 'current'}`, 'INFO');

  try {
    const result = await syncInvoicePackageWithRelations(dateFrom, dateTo, sessionId);

    if (result.success) {
      logSyncActivity(`Full Invoice Sync SUCCESS: ${result.results?.syncedInvoices} invoices with all relations`, 'INFO');

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`Full Invoice Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");
    revalidatePath("/customers");

    return result;
  } catch (error) {
    logSyncActivity(`Full Invoice Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: runIdListSync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Ultra-fast sync for specific Invoice and SEDA IDs from CSV. Checks local data
 * first - only fetches from Bubble if newer. Much faster than date range sync
 * for targeted updates.
 *
 * CSV FORMAT:
 * ```csv
 * type,id,modified_date
 * invoice,1647839483923x8394832,2026-01-19T10:30:00Z
 * seda,1647839483926x8394835,2026-01-19T09:15:00Z
 * ```
 *
 * INPUTS:
 * @param csvData - string (required): CSV data with type, id, modified_date columns
 *
 * OUTPUTS:
 * @returns { success: boolean, results?: {...}, error?: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Parse CSV data to extract (type, id, modified_date) tuples
 * 2. Group by type (invoice vs seda)
 * 3. Check local database for existing records and their timestamps
 * 4. Fetch from Bubble API only if newer than local copy
 * 5. Upsert to PostgreSQL
 * 6. Restore Invoice→SEDA links
 * 7. Patch SEDA→Customer links
 * 8. Revalidate Next.js cached paths
 *
 * OPTIMIZATION STRATEGY:
 * - Avoids fetching all invoices (no need to scan 4000+ records)
 * - Timestamp comparison prevents unnecessary API calls
 * - Batch fetching for multiple IDs of same type
 *
 * EDGE CASES:
 * - Invalid CSV format → Returns success: false with error
 * - IDs not found in Bubble → Logs error, continues processing
 * - Mixed valid/invalid rows → Processes valid rows, reports errors for invalid
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (invoices, seda tables)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncByIdList() from @/lib/bubble
 * - Used by: src/app/sync/page.tsx (Fast ID-List Sync form)
 */
export async function runIdListSync(csvData: string) {
  logSyncActivity(`Optimized Fast ID-List Sync Triggered`, 'INFO');

  try {
    const { syncByIdList } = await import('@/lib/bubble');
    const result = await syncByIdList(csvData);

    if (result.success) {
      logSyncActivity(`Optimized Fast ID-List Sync SUCCESS!`, 'INFO');

      // Auto-patch links after successful sync
      logSyncActivity(`Running automatic link patching...`, 'INFO');

      // Patch 1: Restore Invoice→SEDA links from SEDA.linked_invoice array
      const invoiceLinkResult = await restoreInvoiceSedaLinks();
      logSyncActivity(`Invoice→SEDA links restored: ${invoiceLinkResult.linked || 0} linked`, 'INFO');

      // Patch 2: Fix SEDA→Customer links from Invoice.linked_customer
      const sedaCustomerResult = await patchSedaCustomerLinks();
      logSyncActivity(`SEDA→Customer links patched: ${sedaCustomerResult.patched || 0} patched`, 'INFO');
    } else {
      logSyncActivity(`Optimized Fast ID-List Sync FAILED: ${result.error}`, 'ERROR');
    }

    revalidatePath("/sync");
    revalidatePath("/seda");
    revalidatePath("/invoices");

    return result;
  } catch (error) {
    logSyncActivity(`Optimized Fast ID-List Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * ============================================================================
 * FUNCTION: runJsonFileSync
 * ============================================================================
 *
 * INTENT (What & Why):
 * Sync invoices from a locally exported JSON file to PostgreSQL. This is useful
 * when you have exported data from Bubble and want to sync it without accessing
 * the Bubble API.
 *
 * INPUTS:
 * @param jsonFilePath - string (required): Path to the JSON file (relative to project root)
 * @param limit - number (optional): Limit on number of records to sync (for testing)
 *
 * OUTPUTS:
 * @returns { success: boolean, results?: { processed: number, synced: number, errors: string[] }, error?: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Read JSON file from disk
 * 2. Parse JSON data
 * 3. For each invoice record:
 *    - Transform Bubble field names to PostgreSQL schema
 *    - Parse dates, amounts, comma-separated lists
 *    - Upsert to PostgreSQL
 * 4. Revalidate Next.js cached paths
 * 5. Return sync results
 *
 * FIELD MAPPINGS:
 * - "unique id" → bubble_id
 * - "Invoice ID" → invoice_id (parsed as number)
 * - "Amount" → amount
 * - "Total Amount" → total_amount
 * - "Invoice Date" → invoice_date
 * - "Created Date" → created_at
 * - "Modified Date" → updated_at
 * - "Linked Customer" → linked_customer
 * - "Linked Agent" → linked_agent
 * - "Linked Payment" → linked_payment (comma-separated → array)
 * - "Linked Invoice Item" → linked_invoice_item (comma-separated → array)
 * - "Linked SEDA registration" → linked_seda_registration
 *
 * EDGE CASES:
 * - File not found → Returns success: false with error
 * - Invalid JSON → Returns success: false with error
 * - Missing "unique id" → Logs error, skips record
 * - Some records fail → Continues processing, returns errors array
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (invoices table)
 * - Calls logSyncActivity() for audit trail
 * - Calls revalidatePath() to refresh Next.js cache
 *
 * DEPENDENCIES:
 * - Requires: syncInvoicesFromJsonFile() from @/lib/bubble
 * - Used by: src/app/sync/page.tsx (JSON File Sync form)
 */
export async function runJsonFileSync(jsonFilePath: string, limit?: number) {
  logSyncActivity(`JSON File Sync: ${jsonFilePath}${limit ? ` (limit: ${limit})` : ''}`, 'INFO');

  try {
    const { syncInvoicesFromJsonFile } = await import('@/lib/bubble');
    const result = await syncInvoicesFromJsonFile(jsonFilePath, limit);

    if (result.success) {
      logSyncActivity(`JSON File Sync SUCCESS: ${result.synced}/${result.processed} invoices synced`, 'INFO');
    } else {
      logSyncActivity(`JSON File Sync FAILED`, 'ERROR');
    }

    if (result.errors.length > 0) {
      logSyncActivity(`Errors encountered: ${result.errors.length}`, 'ERROR');
      result.errors.slice(0, 5).forEach(e => logSyncActivity(e, 'ERROR'));
    }

    revalidatePath("/sync");
    revalidatePath("/invoices");

    return { success: result.success, results: result, error: result.success ? undefined : 'Sync failed' };
  } catch (error) {
    logSyncActivity(`JSON File Sync CRASHED: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
