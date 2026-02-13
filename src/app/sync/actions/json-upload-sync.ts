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

import { db } from "@/lib/db";
import { payments, submitted_payments } from "@/db/schema";
import { eq, or, isNull } from "drizzle-orm";

/**
 * ============================================================================
 * FUNCTION: patchPaymentMethodsFromJson
 * ============================================================================
 *
 * Specific patch function that takes a JSON upload of payments and ONLY 
 * updates the payment_method if it is currently empty in our database.
 * Matches by bubble_id (unique id).
 */
export async function patchPaymentMethodsFromJson(jsonData: any[]) {
  logSyncActivity(`JSON Payment Method Patch: Starting with ${jsonData.length} records`, 'INFO');

  try {
    if (!Array.isArray(jsonData)) {
      return { success: false, error: "Invalid JSON: Expected an array" };
    }

    let patchedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

    for (const item of jsonData) {
      const bubbleId = item["unique id"] || item._id;
      if (!bubbleId) continue;

      // Determine the source method (V1 or V2)
      const sourceMethod = item["Payment Method"] || item["Payment Method V2"] || item["Payment Method v2"];
      if (!sourceMethod) {
        skippedCount++;
        continue;
      }

      // 1. Check verified payments table
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.bubble_id, bubbleId)
      });

      if (existingPayment) {
        // Build update object for missing fields
        const updates: any = { updated_at: new Date() };
        let hasChanges = false;

        // 1. Payment Method Patch
        if (!existingPayment.payment_method || existingPayment.payment_method === '') {
          updates.payment_method = sourceMethod;
          updates.payment_method_v2 = item["Payment Method V2"] || item["Payment Method v2"] || existingPayment.payment_method_v2;
          hasChanges = true;
        }

        // 2. EPP Fields Patch (if currently empty)
        if (!existingPayment.issuer_bank || existingPayment.issuer_bank === '') {
          if (item["Issuer Bank"]) {
            updates.issuer_bank = item["Issuer Bank"];
            hasChanges = true;
          }
        }
        if (!existingPayment.epp_month || existingPayment.epp_month === null) {
          if (item["EPP Month"]) {
            updates.epp_month = String(item["EPP Month"]);
            hasChanges = true;
          }
        }
        if (!existingPayment.epp_type || existingPayment.epp_type === '') {
          if (item["EPP Type"]) {
            updates.epp_type = String(item["EPP Type"]);
            hasChanges = true;
          }
        }

        if (hasChanges) {
          await db.update(payments)
            .set(updates)
            .where(eq(payments.id, existingPayment.id));
          patchedCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      // 2. Check submitted payments table
      const existingSubmitted = await db.query.submitted_payments.findFirst({
        where: eq(submitted_payments.bubble_id, bubbleId)
      });

      if (existingSubmitted) {
        const updates: any = { updated_at: new Date() };
        let hasChanges = false;

        if (!existingSubmitted.payment_method || existingSubmitted.payment_method === '') {
          updates.payment_method = sourceMethod;
          updates.payment_method_v2 = item["Payment Method V2"] || item["Payment Method v2"] || existingSubmitted.payment_method_v2;
          hasChanges = true;
        }

        if (!existingSubmitted.issuer_bank || existingSubmitted.issuer_bank === '') {
          if (item["Issuer Bank"]) {
            updates.issuer_bank = item["Issuer Bank"];
            hasChanges = true;
          }
        }
        if (!existingSubmitted.epp_month || existingSubmitted.epp_month === null) {
          if (item["EPP Month"]) {
            updates.epp_month = String(item["EPP Month"]);
            hasChanges = true;
          }
        }
        if (!existingSubmitted.epp_type || existingSubmitted.epp_type === '') {
          if (item["EPP Type"]) {
            updates.epp_type = String(item["EPP Type"]);
            hasChanges = true;
          }
        }

        if (hasChanges) {
          await db.update(submitted_payments)
            .set(updates)
            .where(eq(submitted_payments.id, existingSubmitted.id));
          patchedCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      notFoundCount++;
    }

    logSyncActivity(`JSON Payment Method Patch SUCCESS: Patched ${patchedCount}, Skipped ${skippedCount}, Not found ${notFoundCount}`, 'INFO');
    
    revalidatePath("/payments");
    revalidatePath("/sync");

    return { 
      success: true, 
      patchedCount, 
      skippedCount, 
      notFoundCount,
      message: `Successfully patched ${patchedCount} payment methods. ${skippedCount} records were skipped (already had data or no source), and ${notFoundCount} records were not found in our database.`
    };

  } catch (error) {
    const errorMsg = `Payment Method Patch FAILED: ${String(error)}`;
    logSyncActivity(errorMsg, 'ERROR');
    return { success: false, error: errorMsg };
  }
}

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
