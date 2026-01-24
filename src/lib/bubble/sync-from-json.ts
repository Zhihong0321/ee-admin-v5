/**
 * ============================================================================
 * INVOICE SYNC FROM JSON FILE
 * ============================================================================
 *
 * Sync invoice data from a locally exported JSON file to PostgreSQL.
 * This is useful when you have exported data from Bubble and want to sync it.
 *
 * File: src/lib/bubble/sync-from-json.ts
 */

import { db } from "@/lib/db";
import { invoices, customers, agents, payments, submitted_payments, sedaRegistration } from "@/db/schema";
import { logSyncActivity } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * ============================================================================
 * TYPE: Bubble JSON Export Format
 * ============================================================================
 */
interface BubbleInvoiceJsonExport {
  "unique id": string;              // Bubble unique identifier (export format)
  "Modified Date": string;
  "Created Date": string;
  "Invoice ID"?: string | number;
  "Invoice Number"?: string;
  "Invoice Date"?: string;
  "Amount"?: string | number;
  "Total Amount"?: string | number;
  "Status"?: string;
  "Linked Customer"?: string;
  "Linked Agent"?: string;
  "Linked Payment"?: string;        // Comma-separated in JSON export
  "Linked Invoice Item"?: string;   // Comma-separated in JSON export
  "Linked SEDA registration"?: string;
  "Linked Package"?: string;
  "Created By"?: string;
  "Creator"?: string;
  "Type"?: string;
  "State"?: string;
  "Payment Method"?: string;
  "Description"?: string;
  "Panel Qty"?: string | number;
  "Customer Average TNB"?: string | number;
  "Estimated Saving"?: string | number;
  "visit"?: string | number;
  "Strategic VA"?: string | number;
  "Percent of Total Amount"?: string | number;
  "Commission Paid"?: string;
  "Commission Finalized"?: string;
  "Paid?"?: string;
  "INSTALLATION STATUS"?: string;
  "Case Status"?: string;
  "Approval Status"?: string;
  "Remark Financne"?: string;
  "1st Payment %"?: string;
  "1st Payment Date"?: string;
  "2nd Payment %"?: string;
  "Full Payment Date"?: string;
  "Last Payment Date"?: string;
  "EFFECTIVE EPP"?: string;
  // Additional fields from export
  [key: string]: any;
}

/**
 * ============================================================================
 * HELPER: Parse comma-separated string to array
 * ============================================================================
 */
function parseCommaSeparated(value?: string): string[] | null {
  if (!value || value === "") return null;
  const parts = value.split(',').map(s => s.trim()).filter(s => s !== "");
  return parts.length > 0 ? parts : null;
}

/**
 * ============================================================================
 * HELPER: Convert Bubble date string to Date object
 * ============================================================================
 */
function parseBubbleDate(dateStr?: string): Date | null {
  if (!dateStr || dateStr === "") return null;

  // Try parsing various date formats from Bubble
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  return null;
}

/**
 * ============================================================================
 * HELPER: Convert amount to string
 * ============================================================================
 */
function parseAmount(amount?: string | number): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  return String(amount);
}

/**
 * ============================================================================
 * HELPER: Sync invoice to database
 * ============================================================================
 */
async function syncInvoiceFromJson(inv: BubbleInvoiceJsonExport): Promise<void> {
  const bubbleId = inv["unique id"];
  if (!bubbleId) {
    throw new Error("Invoice missing 'unique id' field");
  }

  // Parse comma-separated fields
  const linkedPayments = parseCommaSeparated(inv["Linked Payment"]);
  const linkedItems = parseCommaSeparated(inv["Linked Invoice Item"]);

  // Parse invoice_id to number if present
  const invoiceIdValue = inv["Invoice ID"];
  const invoiceIdNumber = invoiceIdValue
    ? (typeof invoiceIdValue === 'number' ? invoiceIdValue : parseInt(String(invoiceIdValue), 10))
    : null;

  // Parse dates
  const invoiceDate = parseBubbleDate(inv["Invoice Date"]);
  const createdDate = parseBubbleDate(inv["Created Date"]);
  const modifiedDate = parseBubbleDate(inv["Modified Date"]);

  // Build the invoice record - only use columns that exist in the database schema
  const vals = {
    // Core identifiers
    bubble_id: bubbleId,
    invoice_id: invoiceIdNumber,
    invoice_number: inv["Invoice Number"]
      ? String(inv["Invoice Number"])
      : (inv["Invoice ID"] ? String(inv["Invoice ID"]) : null),

    // Relations
    linked_customer: inv["Linked Customer"] || null,
    linked_agent: inv["Linked Agent"] || null,
    linked_payment: linkedPayments,
    linked_seda_registration: inv["Linked SEDA registration"] || null,
    linked_invoice_item: linkedItems,

    // Amounts
    amount: parseAmount(inv["Amount"]),
    total_amount: parseAmount(inv["Total Amount"] || inv["Amount"]),
    percent_of_total_amount: parseAmount(inv["Percent of Total Amount"]),

    // Status
    status: inv["Status"] || inv["Paid?"] || 'draft',
    approval_status: inv["Approval Status"] || null,
    case_status: inv["Case Status"] || null,

    // Dates
    invoice_date: invoiceDate,
    created_at: createdDate || new Date(),
    updated_at: modifiedDate || new Date(),
    created_by: inv["Created By"] || inv["Creator"] || null,

    // Additional fields that exist in schema
    dealercode: inv["Dealercode"] || null,
  };

  // Upsert invoice - since bubble_id doesn't have a unique constraint,
  // we need to manually check if it exists first
  try {
    // Check if invoice exists
    const existing = await db.query.invoices.findFirst({
      where: eq(invoices.bubble_id, bubbleId)
    });

    if (existing) {
      // Update existing record
      await db.update(invoices)
        .set({
          ...vals,
          // Don't update created_at on existing records
          created_at: existing.created_at
        })
        .where(eq(invoices.bubble_id, bubbleId));
    } else {
      // Insert new record
      await db.insert(invoices).values(vals);
    }
  } catch (dbError) {
    throw new Error(`Database error: ${dbError}`);
  }
}

/**
 * ============================================================================
 * FUNCTION: syncInvoicesFromJsonFile
 * ============================================================================
 *
 * Sync invoices from a JSON file exported from Bubble.
 *
 * INPUTS:
 * @param jsonFilePath - Path to the JSON file (relative to project root)
 * @param limit - Optional limit on number of records to sync
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   processed: number,
 *   synced: number,
 *   errors: string[]
 * }
 */
export async function syncInvoicesFromJsonFile(
  jsonFilePath: string,
  limit?: number
): Promise<{
  success: boolean;
  processed: number;
  synced: number;
  errors: string[];
}> {
  const results = {
    success: false,
    processed: 0,
    synced: 0,
    errors: [] as string[]
  };

  try {
    logSyncActivity(`Loading invoice data from ${jsonFilePath}...`, 'INFO');

    // Read and parse JSON file
    const fullPath = join(process.cwd(), jsonFilePath);
    const fileContent = readFileSync(fullPath, 'utf-8');
    const invoiceData: BubbleInvoiceJsonExport[] = JSON.parse(fileContent);

    if (!Array.isArray(invoiceData)) {
      throw new Error('JSON file must contain an array of invoice records');
    }

    logSyncActivity(`Loaded ${invoiceData.length} invoice records from JSON file`, 'INFO');

    // Apply limit if specified
    const recordsToProcess = limit ? invoiceData.slice(0, limit) : invoiceData;
    const totalToProcess = recordsToProcess.length;

    logSyncActivity(`Processing ${totalToProcess} invoice records...`, 'INFO');

    // Process each invoice
    for (let i = 0; i < recordsToProcess.length; i++) {
      const inv = recordsToProcess[i];
      results.processed++;

      try {
        await syncInvoiceFromJson(inv);
        results.synced++;

        if (results.synced % 10 === 0) {
          logSyncActivity(`Progress: ${results.synced}/${totalToProcess} invoices synced`, 'INFO');
        }
      } catch (err) {
        const errorMsg = `Invoice ${inv["unique id"] || "unknown"}: ${err}`;
        results.errors.push(errorMsg);
        logSyncActivity(`Error syncing invoice: ${errorMsg}`, 'ERROR');
      }
    }

    results.success = true;

    logSyncActivity(`JSON sync complete: ${results.synced}/${results.processed} invoices synced successfully`, 'INFO');

    if (results.errors.length > 0) {
      logSyncActivity(`Encountered ${results.errors.length} errors during sync`, 'ERROR');
    }

    return results;
  } catch (error) {
    const errorMsg = `JSON file sync failed: ${error}`;
    results.errors.push(errorMsg);
    logSyncActivity(errorMsg, 'ERROR');
    return results;
  }
}
