"use server";

/**
 * ============================================================================
 * JSON UPLOAD SYNC ACTIONS
 * ============================================================================
 *
 * Server actions for uploading and syncing JSON files from Bubble.
 * Validates first entry before processing all records.
 *
 * Supported entities: invoice, payment, seda_registration, invoice_item
 *
 * File: src/app/sync/actions/json-upload-sync.ts
 */

import { revalidatePath } from "next/cache";
import { logSyncActivity } from "@/lib/logger";
import { syncJsonWithValidation, type EntityType, type JsonUploadSyncResult } from "@/lib/bubble/sync-json-upload";

/**
 * ============================================================================
 * FUNCTION: uploadAndSyncJson
 * ============================================================================
 *
 * Upload and sync JSON data from a Bubble export.
 *
 * IMPORTANT: Validates the first entry. If validation fails, entire sync is rejected.
 *
 * @param entityType - Type of entity to sync ('invoice' | 'payment' | 'seda_registration' | 'invoice_item')
 * @param jsonData - Array of JSON objects from Bubble export
 * @returns { success: boolean, result?: SyncResult, error?: string }
 */
export async function uploadAndSyncJson(
  entityType: EntityType,
  jsonData: any[]
) {
  logSyncActivity(`JSON Upload Sync: ${entityType} (${jsonData.length} records)`, 'INFO');

  try {
    // Validate JSON is an array
    if (!Array.isArray(jsonData)) {
      const error = "Invalid JSON: Expected an array of records";
      logSyncActivity(`JSON Upload Sync FAILED: ${error}`, 'ERROR');
      return { success: false, error };
    }

    // Run sync with first-entry validation
    const result = await syncJsonWithValidation(entityType, jsonData);

    if (result.validationError) {
      logSyncActivity(`JSON Upload Sync REJECTED: ${result.validationError}`, 'ERROR');
      return {
        success: false,
        error: result.validationError,
        result
      };
    }

    if (result.success) {
      logSyncActivity(`JSON Upload Sync SUCCESS: ${result.synced}/${result.processed} ${entityType} records synced`, 'INFO');
    } else {
      logSyncActivity(`JSON Upload Sync completed with errors`, 'ERROR');
    }

    // Revalidate paths based on entity type
    const pathsToRevalidate = ["/sync"];
    switch (entityType) {
      case 'invoice':
        pathsToRevalidate.push("/invoices");
        break;
      case 'payment':
        pathsToRevalidate.push("/payments");
        break;
      case 'seda_registration':
        pathsToRevalidate.push("/seda");
        break;
      case 'invoice_item':
        pathsToRevalidate.push("/invoices");
        break;
    }

    pathsToRevalidate.forEach(path => revalidatePath(path));

    return { success: result.success, result };

  } catch (error) {
    const errorMsg = `JSON Upload Sync CRASHED: ${String(error)}`;
    logSyncActivity(errorMsg, 'ERROR');
    return { success: false, error: errorMsg };
  }
}

/**
 * ============================================================================
 * CONVENIENCE FUNCTIONS FOR EACH ENTITY TYPE
 * ============================================================================
 */

/**
 * Upload and sync invoice data from JSON
 */
export async function uploadInvoicesJson(jsonData: any[]) {
  return uploadAndSyncJson('invoice', jsonData);
}

/**
 * Upload and sync payment data from JSON
 */
export async function uploadPaymentsJson(jsonData: any[]) {
  return uploadAndSyncJson('payment', jsonData);
}

/**
 * Upload and sync SEDA registration data from JSON
 */
export async function uploadSedaRegistrationsJson(jsonData: any[]) {
  return uploadAndSyncJson('seda_registration', jsonData);
}

/**
 * Upload and sync invoice item data from JSON
 */
export async function uploadInvoiceItemsJson(jsonData: any[]) {
  return uploadAndSyncJson('invoice_item', jsonData);
}
