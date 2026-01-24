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
import { invoices, payments, sedaRegistration, invoice_items } from "@/db/schema";
import { logSyncActivity } from "@/lib/logger";
import { eq } from "drizzle-orm";

/**
 * ============================================================================
 * TYPE DEFINITIONS
 * ============================================================================
 */
export type EntityType = 'invoice' | 'payment' | 'seda_registration' | 'invoice_item';

export interface JsonUploadSyncResult {
  success: boolean;
  entityType: EntityType;
  processed: number;
  synced: number;
  errors: string[];
  validationError?: string;
}

/**
 * ============================================================================
 * HELPER FUNCTIONS
 * ============================================================================
 */

// Parse comma-separated string to array
function parseCommaSeparated(value?: string): string[] | null {
  if (!value || value === "") return null;
  const parts = value.split(',').map(s => s.trim()).filter(s => s !== "");
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

// Upsert function for invoices - FULL OVERWRITE mode
async function upsertInvoice(bubbleId: string, vals: any): Promise<void> {
  const existing = await db.query.invoices.findFirst({
    where: eq(invoices.bubble_id, bubbleId)
  });

  if (existing) {
    // FULL OVERWRITE - replace all fields with JSON data
    await db.update(invoices)
      .set(vals)
      .where(eq(invoices.bubble_id, bubbleId));
  } else {
    await db.insert(invoices).values(vals);
  }
}

// Upsert function for payments - FULL OVERWRITE mode
async function upsertPayment(bubbleId: string, vals: any): Promise<void> {
  const existing = await db.query.payments.findFirst({
    where: eq(payments.bubble_id, bubbleId)
  });

  if (existing) {
    // FULL OVERWRITE - replace all fields with JSON data
    await db.update(payments)
      .set(vals)
      .where(eq(payments.bubble_id, bubbleId));
  } else {
    await db.insert(payments).values(vals);
  }
}

// Upsert function for SEDA registrations - FULL OVERWRITE mode
async function upsertSedaRegistration(bubbleId: string, vals: any): Promise<void> {
  const existing = await db.query.sedaRegistration.findFirst({
    where: eq(sedaRegistration.bubble_id, bubbleId)
  });

  if (existing) {
    // FULL OVERWRITE - replace all fields with JSON data
    await db.update(sedaRegistration)
      .set(vals)
      .where(eq(sedaRegistration.bubble_id, bubbleId));
  } else {
    await db.insert(sedaRegistration).values(vals);
  }
}

// Upsert function for invoice items - FULL OVERWRITE mode
async function upsertInvoiceItem(bubbleId: string, vals: any): Promise<void> {
  const existing = await db.query.invoice_items.findFirst({
    where: eq(invoice_items.bubble_id, bubbleId)
  });

  if (existing) {
    // FULL OVERWRITE - replace all fields with JSON data
    await db.update(invoice_items)
      .set(vals)
      .where(eq(invoice_items.bubble_id, bubbleId));
  } else {
    await db.insert(invoice_items).values(vals);
  }
}

/**
 * ============================================================================
 * INVOICE SYNC FUNCTION
 * ============================================================================
 */
async function syncInvoice(inv: any): Promise<void> {
  const bubbleId = inv["unique id"] || inv._id;
  if (!bubbleId) throw new Error("Invoice missing 'unique id' or '_id' field");

  const vals = {
    bubble_id: bubbleId,
    invoice_id: inv["Invoice ID"] ? Number(inv["Invoice ID"]) : null,
    invoice_number: inv["Invoice Number"] || String(inv["Invoice ID"] || ""),
    linked_customer: inv["Linked Customer"] || null,
    linked_agent: inv["Linked Agent"] || null,
    linked_payment: parseCommaSeparated(inv["Linked Payment"]),
    linked_seda_registration: inv["Linked SEDA registration"] || inv["Linked SEDA Registration"] || null,
    linked_invoice_item: parseCommaSeparated(inv["Linked Invoice Item"]),
    amount: parseAmount(inv["Amount"]),
    total_amount: parseAmount(inv["Total Amount"] || inv["Amount"]),
    percent_of_total_amount: parseAmount(inv["Percent of Total Amount"]),
    status: inv["Status"] || inv["Paid?"] || 'draft',
    approval_status: inv["Approval Status"] || null,
    case_status: inv["Case Status"] || null,
    invoice_date: parseBubbleDate(inv["Invoice Date"]),
    created_at: parseBubbleDate(inv["Created Date"]) || new Date(),
    updated_at: parseBubbleDate(inv["Modified Date"]) || new Date(),
    created_by: inv["Created By"] || inv["Creator"] || null,
    dealercode: inv["Dealercode"] || null,
  };

  await upsertInvoice(bubbleId, vals);
}

/**
 * ============================================================================
 * PAYMENT SYNC FUNCTION
 * ============================================================================
 */
async function syncPayment(pay: any): Promise<void> {
  const bubbleId = pay["unique id"] || pay._id;
  if (!bubbleId) throw new Error("Payment missing 'unique id' or '_id' field");

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
    modified_date: parseBubbleDate(pay["Modified Date"]),
    payment_index: pay["Payment Index"] ? Number(pay["Payment Index"]) : null,
    epp_month: pay["EPP Month"] ? Number(pay["EPP Month"]) : null,
    bank_charges: pay["Bank Charges"] ? Number(pay["Bank Charges"]) : null,
    terminal: pay["Terminal"] || null,
    attachment: pay["Attachment"] || null,
    verified_by: pay["Verified By"] || null,
    edit_history: pay["Edit History"] || null,
    issuer_bank: pay["Issuer Bank"] || null,
    epp_type: pay["EPP Type"] || null,
    created_at: parseBubbleDate(pay["Created Date"]) || new Date(),
    updated_at: parseBubbleDate(pay["Modified Date"]) || new Date(),
    last_synced_at: new Date(),
  };

  await upsertPayment(bubbleId, vals);
}

/**
 * ============================================================================
 * SEDA REGISTRATION SYNC FUNCTION
 * ============================================================================
 */
async function syncSedaRegistration(seda: any): Promise<void> {
  const bubbleId = seda["unique id"] || seda._id;
  if (!bubbleId) throw new Error("SEDA registration missing 'unique id' or '_id' field");

  const vals = {
    bubble_id: bubbleId,
    seda_status: seda["SEDA Status"] || null,
    state: seda["State"] || null,
    city: seda["City"] || null,
    agent: seda["Agent"] || null,
    project_price: parseAmount(seda["Project Price"]),
    linked_customer: seda["Linked Customer"] || null,
    customer_signature: seda["Customer Signature"] || null,
    ic_copy_front: seda["IC Copy Front"] || null,
    ic_copy_back: seda["IC Copy Back"] || null,
    tnb_bill_1: seda["TNB Bill 1"] || null,
    tnb_bill_2: seda["TNB Bill 2"] || null,
    tnb_bill_3: seda["TNB Bill 3"] || null,
    nem_cert: seda["NEM Cert"] || null,
    mykad_pdf: seda["MyKAD PDF"] || null,
    property_ownership_prove: seda["Property Ownership Prove"] || null,
    roof_images: seda["Roof Images"] || null,
    site_images: seda["Site Images"] || null,
    drawing_pdf_system: seda["Drawing PDF System"] || null,
    drawing_system_actual: seda["Drawing System Actual"] || null,
    drawing_engineering_seda_pdf: seda["Drawing Engineering SEDA PDF"] || null,
    system_size: seda["System Size"] ? Number(seda["System Size"]) : null,
    system_size_in_form_kwp: seda["System Size in Form (kwp)"] ? Number(seda["System Size in Form (kwp)"]) : null,
    inverter_kwac: seda["Inverter kWac"] ? Number(seda["Inverter kWac"]) : null,
    sunpeak_hours: parseAmount(seda["Sunpeak Hours"]),
    estimated_monthly_saving: parseAmount(seda["Estimated Monthly Saving"]),
    average_tnb: seda["Average TNB"] ? Number(seda["Average TNB"]) : null,
    nem_application_no: seda["NEM Application No"] || null,
    nem_type: seda["NEM Type"] || null,
    phase_type: seda["Phase Type"] || null,
    tnb_account_no: seda["TNB Account No"] || null,
    tnb_meter: seda["TNB Meter"] || null,
    tnb_meter_status: seda["TNB Meter Status"] || null,
    tnb_meter_install_date: parseBubbleDate(seda["TNB Meter Install Date"]),
    first_completion_date: parseBubbleDate(seda["First Completion Date"]),
    inverter_serial_no: seda["Inverter Serial No"] || null,
    special_remark: seda["Special Remark"] || null,
    email: seda["Email"] || null,
    ic_no: seda["IC No"] || null,
    e_contact_name: seda["E Contact Name"] || null,
    e_contact_no: seda["E Contact No"] || null,
    e_contact_relationship: seda["E Contact Relationship"] || null,
    e_contact_mykad: seda["E Contact MyKAD"] || null,
    e_email: seda["E Email"] || null,
    redex_status: seda["REDEX Status"] || null,
    redex_remark: seda["REDEX Remark"] || null,
    g_electric_folder_link: seda["G Electric Folder Link"] || null,
    g_roof_folder_link: seda["G Roof Folder Link"] || null,
    installation_address: seda["Installation Address"] || null,
    price_category: seda["Price Category"] || null,
    linked_invoice: parseCommaSeparated(seda["Linked Invoice"]),
    slug: seda["Slug"] || null,
    drawing_system_submitted: seda["Drawing System Submitted"] || null,
    request_drawing_date: parseBubbleDate(seda["Request Drawing Date"]),
    reg_status: seda["Reg Status"] || null,
    created_by: seda["Created By"] || null,
    created_date: parseBubbleDate(seda["Created Date"]),
    modified_date: parseBubbleDate(seda["Modified Date"]),
    created_at: parseBubbleDate(seda["Created Date"]) || new Date(),
    updated_at: parseBubbleDate(seda["Modified Date"]) || new Date(),
    last_synced_at: new Date(),
  };

  await upsertSedaRegistration(bubbleId, vals);
}

/**
 * ============================================================================
 * INVOICE ITEM SYNC FUNCTION
 * ============================================================================
 */
async function syncInvoiceItem(item: any): Promise<void> {
  const bubbleId = item["unique id"] || item._id;
  if (!bubbleId) throw new Error("Invoice item missing 'unique id' or '_id' field");

  const vals = {
    bubble_id: bubbleId,
    description: item["Description"] || null,
    qty: item["Qty"] ? Number(item["Qty"]) : null,
    amount: parseAmount(item["Amount"]),
    unit_price: parseAmount(item["Unit Price"]),
    created_by: item["Created By"] || null,
    created_date: parseBubbleDate(item["Created Date"]),
    modified_date: parseBubbleDate(item["Modified Date"]),
    is_a_package: item["Is a Package"] || item["Is A Package"] || false,
    inv_item_type: item["Inv Item Type"] || null,
    linked_package: item["Linked Package"] || null,
    epp: item["EPP"] ? Number(item["EPP"]) : null,
    linked_invoice: item["Linked Invoice"] || null,
    sort: item["Sort"] ? Number(item["Sort"]) : null,
    linked_voucher: item["Linked Voucher"] || null,
    voucher_remark: item["Voucher Remark"] || null,
    created_at: parseBubbleDate(item["Created Date"]) || new Date(),
    updated_at: parseBubbleDate(item["Modified Date"]) || new Date(),
    last_synced_at: new Date(),
  };

  await upsertInvoiceItem(bubbleId, vals);
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
    errors: []
  };

  // Validate input
  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    result.validationError = "JSON data must be a non-empty array";
    return result;
  }

  // Select sync function based on entity type
  let syncFn: ((data: any) => Promise<void>) | null = null;
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
    default:
      result.validationError = `Unknown entity type: ${entityType}`;
      return result;
  }

  logSyncActivity(`Starting JSON sync for ${tableName} (${jsonData.length} records)`, 'INFO');

  // STEP 1: VALIDATE FIRST ENTRY
  logSyncActivity(`Validating first entry...`, 'INFO');
  try {
    await syncFn(jsonData[0]);
    result.synced = 1;
    result.processed = 1;
    logSyncActivity(`✓ First entry validation passed`, 'INFO');
  } catch (err) {
    const errorMsg = `First entry validation failed: ${err}`;
    result.validationError = errorMsg;
    logSyncActivity(`✗ ${errorMsg}`, 'ERROR');
    return result; // REJECT ENTIRE SYNC
  }

  // STEP 2: PROCESS REMAINING ENTRIES
  logSyncActivity(`Processing remaining ${jsonData.length - 1} entries...`, 'INFO');

  for (let i = 1; i < jsonData.length; i++) {
    result.processed++;
    try {
      await syncFn(jsonData[i]);
      result.synced++;

      // Log progress every 100 records
      if (result.synced % 100 === 0) {
        logSyncActivity(`Progress: ${result.synced}/${jsonData.length} synced`, 'INFO');
      }
    } catch (err) {
      const errorMsg = `Entry ${i + 1}: ${err}`;
      result.errors.push(errorMsg);
      logSyncActivity(`Error: ${errorMsg}`, 'ERROR');
    }
  }

  result.success = result.errors.length === 0 || result.synced > 0;

  logSyncActivity(`${tableName} sync complete: ${result.synced}/${result.processed} synced`, result.success ? 'INFO' : 'ERROR');

  if (result.errors.length > 0) {
    logSyncActivity(`Errors encountered: ${result.errors.length}`, 'ERROR');
  }

  return result;
}
