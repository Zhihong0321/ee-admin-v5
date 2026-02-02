/**
 * ============================================================================
 * JSON UPLOAD SYNC - WITH FIRST ENTRY VALIDATION
 * ============================================================================
 *
 * Generic sync function that validates the first entry before processing.
 * If first entry fails, entire sync is rejected.
 *
 * Supported entities: invoices, payments, seda_registration, invoice_items
 *
 * File: src/lib/bubble/sync-json-upload.ts
 */

import { db } from "@/lib/db";
import { invoices, payments, sedaRegistration, invoice_items, users } from "@/db/schema";
import { logSyncActivity } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { patchSchemaFromJson, type SchemaPatchResult } from "./schema-patcher";
import { mapSedaRegistrationFields } from "../complete-bubble-mappings";

/**
 * ============================================================================
 * TYPE DEFINITIONS
 * ============================================================================
 */
export type EntityType = 'invoice' | 'payment' | 'seda_registration' | 'invoice_item' | 'user';

export interface JsonUploadSyncResult {
  success: boolean;
  entityType: EntityType;
  processed: number;
  synced: number;
  skipped: number;
  errors: string[];
  validationError?: string;
  schemaPatch?: SchemaPatchResult;
}

/**
 * ============================================================================
 * HELPER FUNCTIONS
 * ============================================================================
 */

// Parse comma-separated string to array (handles both strings and arrays)
function parseCommaSeparated(value?: string | string[] | any): string[] | null {
  // Handle null/undefined
  if (value === null || value === undefined) return null;

  // If already an array, process it
  if (Array.isArray(value)) {
    const items = value
      .map(v => String(v).trim())
      .filter(s => s !== "");
    return items.length > 0 ? items : null;
  }

  // If string, split by comma
  if (typeof value === 'string') {
    if (value === "") return null;
    const parts = value.split(',').map(s => s.trim()).filter(s => s !== "");
    return parts.length > 0 ? parts : null;
  }

  // For any other type, convert to string and try to split
  const strValue = String(value);
  if (strValue === "") return null;
  const parts = strValue.split(',').map(s => s.trim()).filter(s => s !== "");
  return parts.length > 0 ? parts : null;
}

// Parse Bubble date string to Date object
function parseBubbleDate(dateStr?: string): Date | null {
  if (!dateStr || dateStr === "") return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// Parse amount to string
function parseAmount(amount?: string | number): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  return String(amount);
}

// Upsert function for invoices - ONLY overwrite if JSON is newer
async function upsertInvoice(bubbleId: string, vals: any, jsonModifiedDate: Date | null): Promise<{ updated: boolean; reason?: string }> {
  const existing = await db.query.invoices.findFirst({
    where: eq(invoices.bubble_id, bubbleId)
  });

  if (existing) {
    // Check if JSON data is newer than existing record
    // Note: invoices table doesn't have modified_date, use updated_at
    const existingDate = existing.updated_at || existing.created_at;
    
    if (jsonModifiedDate && existingDate) {
      // If existing record is newer or same, skip update
      if (existingDate > jsonModifiedDate) {
        return { updated: false, reason: 'existing_is_newer' };
      }
      // If dates are equal, check if data is actually different
      if (existingDate.getTime() === jsonModifiedDate.getTime()) {
        // Optionally skip if same timestamp to avoid unnecessary updates
        return { updated: false, reason: 'same_timestamp' };
      }
    }
    
    // JSON is newer - perform update
    await db.update(invoices)
      .set(vals)
      .where(eq(invoices.bubble_id, bubbleId));
    return { updated: true };
  } else {
    await db.insert(invoices).values(vals);
    return { updated: true };
  }
}

// Upsert function for payments - ONLY overwrite if JSON is newer
async function upsertPayment(bubbleId: string, vals: any, jsonModifiedDate: Date | null): Promise<{ updated: boolean; reason?: string }> {
  const existing = await db.query.payments.findFirst({
    where: eq(payments.bubble_id, bubbleId)
  });

  if (existing) {
    // Check if JSON data is newer than existing record
    const existingDate = existing.updated_at || existing.modified_date || existing.created_at;
    
    if (jsonModifiedDate && existingDate) {
      // If existing record is newer or same, skip update
      if (existingDate > jsonModifiedDate) {
        return { updated: false, reason: 'existing_is_newer' };
      }
      // If dates are equal, skip to avoid unnecessary updates
      if (existingDate.getTime() === jsonModifiedDate.getTime()) {
        return { updated: false, reason: 'same_timestamp' };
      }
    }
    
    // JSON is newer - perform update
    await db.update(payments)
      .set(vals)
      .where(eq(payments.bubble_id, bubbleId));
    return { updated: true };
  } else {
    await db.insert(payments).values(vals);
    return { updated: true };
  }
}

// Upsert function for SEDA registrations - ONLY overwrite if JSON is newer
async function upsertSedaRegistration(bubbleId: string, vals: any, jsonModifiedDate: Date | null): Promise<{ updated: boolean; reason?: string }> {
  const existing = await db.query.sedaRegistration.findFirst({
    where: eq(sedaRegistration.bubble_id, bubbleId)
  });

  if (existing) {
    // Check if JSON data is newer than existing record
    const existingDate = existing.updated_at || existing.modified_date || existing.created_at;
    
    if (jsonModifiedDate && existingDate) {
      // If existing record is newer or same, skip update
      if (existingDate > jsonModifiedDate) {
        return { updated: false, reason: 'existing_is_newer' };
      }
      // If dates are equal, skip to avoid unnecessary updates
      if (existingDate.getTime() === jsonModifiedDate.getTime()) {
        return { updated: false, reason: 'same_timestamp' };
      }
    }
    
    // JSON is newer - perform update
    await db.update(sedaRegistration)
      .set(vals)
      .where(eq(sedaRegistration.bubble_id, bubbleId));
    return { updated: true };
  } else {
    await db.insert(sedaRegistration).values(vals);
    return { updated: true };
  }
}

// Upsert function for invoice items - ONLY overwrite if JSON is newer
async function upsertInvoiceItem(bubbleId: string, vals: any, jsonModifiedDate: Date | null): Promise<{ updated: boolean; reason?: string }> {
  const existing = await db.query.invoice_items.findFirst({
    where: eq(invoice_items.bubble_id, bubbleId)
  });

  if (existing) {
    // Check if JSON data is newer than existing record
    const existingDate = existing.updated_at || existing.modified_date || existing.created_at;
    
    if (jsonModifiedDate && existingDate) {
      // If existing record is newer or same, skip update
      if (existingDate > jsonModifiedDate) {
        return { updated: false, reason: 'existing_is_newer' };
      }
      // If dates are equal, skip to avoid unnecessary updates
      if (existingDate.getTime() === jsonModifiedDate.getTime()) {
        return { updated: false, reason: 'same_timestamp' };
      }
    }
    
    // JSON is newer - perform update
    await db.update(invoice_items)
      .set(vals)
      .where(eq(invoice_items.bubble_id, bubbleId));
    return { updated: true };
  } else {
    await db.insert(invoice_items).values(vals);
    return { updated: true };
  }
}

// Upsert function for users - ONLY overwrite if JSON is newer
async function upsertUser(bubbleId: string, vals: any, jsonModifiedDate: Date | null): Promise<{ updated: boolean; reason?: string }> {
  const existing = await db.query.users.findFirst({
    where: eq(users.bubble_id, bubbleId)
  });

  if (existing) {
    // Check if JSON data is newer than existing record
    const existingDate = existing.updated_at || existing.created_at;
    
    if (jsonModifiedDate && existingDate) {
      // If existing record is newer or same, skip update
      if (existingDate > jsonModifiedDate) {
        return { updated: false, reason: 'existing_is_newer' };
      }
      // If dates are equal, skip to avoid unnecessary updates
      if (existingDate.getTime() === jsonModifiedDate.getTime()) {
        return { updated: false, reason: 'same_timestamp' };
      }
    }
    
    // JSON is newer - perform update
    await db.update(users)
      .set(vals)
      .where(eq(users.bubble_id, bubbleId));
    return { updated: true };
  } else {
    await db.insert(users).values(vals);
    return { updated: true };
  }
}

/**
 * ============================================================================
 * INVOICE SYNC FUNCTION
 * ============================================================================
 */
async function syncInvoice(inv: any): Promise<{ updated: boolean; reason?: string }> {
  const bubbleId = inv["unique id"] || inv._id;
  if (!bubbleId) throw new Error("Invoice missing 'unique id' or '_id' field");

  try {
    // Parse array fields properly
    const linkedPayment = parseCommaSeparated(inv["Linked Payment"]);
    const linkedInvoiceItem = parseCommaSeparated(inv["Linked Invoice Item"]);
    
    // Parse Modified Date for comparison
    const jsonModifiedDate = parseBubbleDate(inv["Modified Date"]);

    const vals = {
      bubble_id: bubbleId,
      invoice_id: inv["Invoice ID"] ? Number(inv["Invoice ID"]) : null,
      invoice_number: inv["Invoice Number"] || String(inv["Invoice ID"] || ""),
      linked_customer: inv["Linked Customer"] || null,
      linked_agent: inv["Linked Agent"] || null,
      linked_payment: linkedPayment,
      linked_seda_registration: inv["Linked SEDA registration"] || inv["Linked SEDA Registration"] || null,
      linked_invoice_item: linkedInvoiceItem,
      amount: parseAmount(inv["Amount"]),
      total_amount: parseAmount(inv["Total Amount"] || inv["Amount"]),
      percent_of_total_amount: parseAmount(inv["Percent of Total Amount"]),
      status: inv["Status"] || inv["Paid?"] || 'draft',
      approval_status: inv["Approval Status"] || null,
      case_status: inv["Case Status"] || null,
      invoice_date: parseBubbleDate(inv["Invoice Date"]),
      created_at: parseBubbleDate(inv["Created Date"]) || new Date(),
      updated_at: jsonModifiedDate || new Date(),
      modified_date: jsonModifiedDate,
      created_by: inv["Created By"] || inv["Creator"] || null,
      dealercode: inv["Dealercode"] || null,
    };

    return await upsertInvoice(bubbleId, vals, jsonModifiedDate);
  } catch (error: any) {
    // Extract column name from Postgres error if available
    let columnInfo = '';
    if (error?.message) {
      const columnMatch = error.message.match(/column "([^"]+)"/);
      if (columnMatch) {
        columnInfo = `Column: ${columnMatch[1]} | `;
      }
    }
    throw new Error(`Invoice ${bubbleId} sync failed: ${columnInfo}${error?.message || error}`);
  }
}

/**
 * ============================================================================
 * PAYMENT SYNC FUNCTION
 * ============================================================================
 */
async function syncPayment(pay: any): Promise<{ updated: boolean; reason?: string }> {
  const bubbleId = pay["unique id"] || pay._id;
  if (!bubbleId) throw new Error("Payment missing 'unique id' or '_id' field");

  try {
    // Parse array fields properly
    const attachment = parseCommaSeparated(pay["Attachment"]);
    
    // Parse Modified Date for comparison
    const jsonModifiedDate = parseBubbleDate(pay["Modified Date"]);

    const vals = {
      bubble_id: bubbleId,
      amount: parseAmount(pay["Amount"]),
      payment_date: parseBubbleDate(pay["Payment Date"]),
      payment_method: pay["Payment Method"] || null,
      payment_method_v2: pay["Payment Method V2"] || pay["Payment Method v2"] || null,
      remark: pay["Remark"] || null,
      linked_agent: pay["Linked Agent"] || null,
      linked_customer: pay["Linked Customer"] || null,
      linked_invoice: pay["Linked Invoice"] || null,
      created_by: pay["Created By"] || null,
      created_date: parseBubbleDate(pay["Created Date"]),
      modified_date: jsonModifiedDate,
      payment_index: pay["Payment Index"] ? Number(pay["Payment Index"]) : null,
      epp_month: pay["EPP Month"] ? Number(pay["EPP Month"]) : null,
      bank_charges: pay["Bank Charges"] ? Number(pay["Bank Charges"]) : null,
      terminal: pay["Terminal"] || null,
      attachment: attachment,
      verified_by: pay["Verified By"] || null,
      edit_history: pay["Edit History"] || null,
      issuer_bank: pay["Issuer Bank"] || null,
      epp_type: pay["EPP Type"] || null,
      created_at: parseBubbleDate(pay["Created Date"]) || new Date(),
      updated_at: jsonModifiedDate || new Date(),
      last_synced_at: new Date(),
    };

    return await upsertPayment(bubbleId, vals, jsonModifiedDate);
  } catch (error: any) {
    let columnInfo = '';
    if (error?.message) {
      const columnMatch = error.message.match(/column "([^"]+)"/);
      if (columnMatch) {
        columnInfo = `Column: ${columnMatch[1]} | `;
      }
    }
    throw new Error(`Payment ${bubbleId} sync failed: ${columnInfo}${error?.message || error}`);
  }
}

/**
 * ============================================================================
 * SEDA REGISTRATION SYNC FUNCTION
 * ============================================================================
 */
async function syncSedaRegistration(seda: any): Promise<{ updated: boolean; reason?: string }> {
  const bubbleId = seda["unique id"] || seda._id;
  if (!bubbleId) throw new Error("SEDA registration missing 'unique id' or '_id' field");

  try {
    // Parse Modified Date for comparison
    const jsonModifiedDate = parseBubbleDate(seda["Modified Date"]);
    
    const mapped = mapSedaRegistrationFields(seda);
    const vals = {
      ...mapped,
      bubble_id: bubbleId,
      created_at: parseBubbleDate(seda["Created Date"]) || new Date(),
      updated_at: jsonModifiedDate || new Date(),
      modified_date: jsonModifiedDate,
      last_synced_at: new Date(),
    };

    return await upsertSedaRegistration(bubbleId, vals, jsonModifiedDate);
  } catch (error: any) {
    let columnInfo = '';
    if (error?.message) {
      const columnMatch = error.message.match(/column "([^"]+)"/);
      if (columnMatch) {
        columnInfo = `Column: ${columnMatch[1]} | `;
      }
    }
    throw new Error(`SEDA ${bubbleId} sync failed: ${columnInfo}${error?.message || error}`);
  }
}

/**
 * ============================================================================
 * INVOICE ITEM SYNC FUNCTION
 * ============================================================================
 */
async function syncInvoiceItem(item: any): Promise<{ updated: boolean; reason?: string }> {
  const bubbleId = item["unique id"] || item._id;
  if (!bubbleId) throw new Error("Invoice item missing 'unique id' or '_id' field");

  // Parse Modified Date for comparison
  const jsonModifiedDate = parseBubbleDate(item["Modified Date"]);

  const vals = {
    bubble_id: bubbleId,
    description: item["Description"] || null,
    qty: item["Qty"] ? Number(item["Qty"]) : null,
    amount: parseAmount(item["Amount"]),
    unit_price: parseAmount(item["Unit Price"]),
    created_by: item["Created By"] || null,
    created_date: parseBubbleDate(item["Created Date"]),
    modified_date: jsonModifiedDate,
    is_a_package: item["Is a Package"] || item["Is A Package"] || false,
    inv_item_type: item["Inv Item Type"] || null,
    linked_package: item["Linked Package"] || null,
    epp: item["EPP"] ? Number(item["EPP"]) : null,
    linked_invoice: item["Linked Invoice"] || null,
    sort: item["Sort"] ? Number(item["Sort"]) : null,
    linked_voucher: item["Linked Voucher"] || null,
    voucher_remark: item["Voucher Remark"] || null,
    created_at: parseBubbleDate(item["Created Date"]) || new Date(),
    updated_at: jsonModifiedDate || new Date(),
    last_synced_at: new Date(),
  };

  return await upsertInvoiceItem(bubbleId, vals, jsonModifiedDate);
}

/**
 * ============================================================================
 * USER SYNC FUNCTION
 * ============================================================================
 */
async function syncUser(user: any): Promise<{ updated: boolean; reason?: string }> {
  const bubbleId = user["unique id"] || user._id;
  if (!bubbleId) throw new Error("User missing 'unique id' or '_id' field");

  try {
    // Parse array field for access_level
    const accessLevel = parseCommaSeparated(user["Access Level"]);
    
    // Parse Modified Date for comparison
    const jsonModifiedDate = parseBubbleDate(user["Modified Date"]);

    const vals = {
      bubble_id: bubbleId,
      email: user["Email"] || user["authentication"]?.email || null,
      linked_agent_profile: user["Linked Agent Profile"] || null,
      agent_code: user["Agent Code"] || null,
      dealership: user["Dealership"] || null,
      profile_picture: user["Profile Picture"] || null,
      user_signed_up: user["User Signed Up"] || false,
      access_level: accessLevel,
      created_date: parseBubbleDate(user["Created Date"]),
      created_at: parseBubbleDate(user["Created Date"]) || new Date(),
      updated_at: jsonModifiedDate || new Date(),
      last_synced_at: new Date(),
    };

    return await upsertUser(bubbleId, vals, jsonModifiedDate);
  } catch (error: any) {
    let columnInfo = '';
    if (error?.message) {
      const columnMatch = error.message.match(/column "([^"]+)"/);
      if (columnMatch) {
        columnInfo = `Column: ${columnMatch[1]} | `;
      }
    }
    throw new Error(`User ${bubbleId} sync failed: ${columnInfo}${error?.message || error}`);
  }
}

/**
 * ============================================================================
 * MAIN SYNC FUNCTION - WITH FIRST ENTRY VALIDATION
 * ============================================================================
 */

/**
 * Sync entities from JSON data with first entry validation.
 *
 * @param entityType - Type of entity to sync (invoice, payment, seda_registration, invoice_item)
 * @param jsonData - Array of JSON objects from Bubble export
 * @returns SyncResult with success status, counts, and errors
 *
 * IMPORTANT: Validates first entry first. If first entry fails, rejects entire sync.
 */
export async function syncJsonWithValidation(
  entityType: EntityType,
  jsonData: any[]
): Promise<JsonUploadSyncResult> {
  const result: JsonUploadSyncResult = {
    success: false,
    entityType,
    processed: 0,
    synced: 0,
    skipped: 0,
    errors: []
  };

  // Validate input
  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    result.validationError = "JSON data must be a non-empty array";
    return result;
  }

  // Select sync function based on entity type
  let syncFn: ((data: any) => Promise<{ updated: boolean; reason?: string }>) | null = null;
  let tableName = "";

  switch (entityType) {
    case 'invoice':
      syncFn = syncInvoice;
      tableName = "invoices";
      break;
    case 'payment':
      syncFn = syncPayment;
      tableName = "payments";
      break;
    case 'seda_registration':
      syncFn = syncSedaRegistration;
      tableName = "seda_registrations";
      break;
    case 'invoice_item':
      syncFn = syncInvoiceItem;
      tableName = "invoice_items";
      break;
    case 'user':
      syncFn = syncUser;
      tableName = "users";
      break;
    default:
      result.validationError = `Unknown entity type: ${entityType}`;
      return result;
  }

  logSyncActivity(`Starting JSON sync for ${tableName} (${jsonData.length} records)`, 'INFO');

  // STEP 0: AUTO-PATCH SCHEMA (NEW!)
  logSyncActivity(`Step 0: Analyzing JSON and patching schema if needed...`, 'INFO');
  try {
    const schemaPatch = await patchSchemaFromJson(entityType, jsonData);
    result.schemaPatch = schemaPatch;

    if (schemaPatch.addedColumns.length > 0) {
      logSyncActivity(`✓ Added ${schemaPatch.addedColumns.length} new columns to schema`, 'INFO');
      logSyncActivity(`New columns: ${schemaPatch.addedColumns.join(', ')}`, 'INFO');
    } else if (schemaPatch.missingColumns.length === 0) {
      logSyncActivity(`✓ Schema is up to date`, 'INFO');
    }

    if (schemaPatch.errors.length > 0) {
      logSyncActivity(`Schema patch completed with ${schemaPatch.errors.length} errors (continuing...)`, 'WARN');
    }
  } catch (err) {
    logSyncActivity(`Schema patching failed: ${err} (continuing with sync...)`, 'WARN');
    // Don't fail the entire sync if schema patching fails
  }

  // STEP 1: VALIDATE FIRST ENTRY
  logSyncActivity(`Step 1: Validating first entry...`, 'INFO');
  try {
    const firstResult = await syncFn(jsonData[0]);
    result.processed = 1;
    if (firstResult.updated) {
      result.synced = 1;
      logSyncActivity(`✓ First entry validation passed (updated)`, 'INFO');
    } else {
      result.skipped = 1;
      logSyncActivity(`✓ First entry validation passed (skipped: ${firstResult.reason})`, 'INFO');
    }
  } catch (err) {
    const errorMsg = `First entry validation failed: ${err}`;
    result.validationError = errorMsg;
    logSyncActivity(`✗ ${errorMsg}`, 'ERROR');
    return result; // REJECT ENTIRE SYNC
  }

  // STEP 2: PROCESS REMAINING ENTRIES
  logSyncActivity(`Step 2: Processing remaining ${jsonData.length - 1} entries...`, 'INFO');

  for (let i = 1; i < jsonData.length; i++) {
    result.processed++;
    try {
      const syncResult = await syncFn(jsonData[i]);
      if (syncResult.updated) {
        result.synced++;
      } else {
        result.skipped++;
      }

      // Log progress every 100 records
      if ((result.synced + result.skipped) % 100 === 0) {
        logSyncActivity(`Progress: ${result.synced} synced, ${result.skipped} skipped`, 'INFO');
      }
    } catch (err) {
      const errorMsg = `Entry ${i + 1}: ${err}`;
      result.errors.push(errorMsg);
      logSyncActivity(`Error: ${errorMsg}`, 'ERROR');
    }
  }

  result.success = result.errors.length === 0 || result.synced > 0;

  logSyncActivity(`${tableName} sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.errors.length} errors`, result.success ? 'INFO' : 'ERROR');

  if (result.errors.length > 0) {
    logSyncActivity(`Errors encountered: ${result.errors.length}`, 'ERROR');
  }

  return result;
}
