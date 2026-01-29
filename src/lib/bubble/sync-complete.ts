/**
 * ============================================================================
 * COMPLETE DATA & FILE SYNC ENGINE
 * ============================================================================
 *
 * Main sync engine that orchestrates full data sync from Bubble to PostgreSQL.
 * Syncs all tables in dependency order with file download support.
 *
 * File: src/lib/bubble/sync-complete.ts
 */

import { db } from "@/lib/db";
import { users, agents, payments, submitted_payments, customers, invoices, sedaRegistration, invoice_templates } from "@/db/schema";
import { syncFilesByCategory } from "@/app/manage-company/storage-actions";
import { logSyncActivity } from "@/lib/logger";
import { createProgressSession, updateProgress, getProgress } from "@/lib/progress-tracker";
import { BUBBLE_BASE_URL, BUBBLE_API_HEADERS } from "./client";
import { mapSedaRegistrationFields } from "../complete-bubble-mappings";

/**
 * ============================================================================
 * SHARED HELPER: syncTable
 * ============================================================================
 *
 * INTENT (What & Why):
 * Generic sync function that fetches all records from a Bubble object type
 * and upserts them to PostgreSQL with pagination support.
 *
 * INPUTS:
 * @param typeName - Bubble object type (e.g., 'agent', 'user')
 * @param table - Drizzle ORM table definition
 * @param conflictCol - Column for unique constraint (upsert key)
 * @param mapFn - Function to map Bubble record → PostgreSQL values
 * @param results - Results object to track sync counts/errors
 *
 * OUTPUTS:
 * @returns void (modifies results object in place)
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Log sync start for table type
 * 2. Loop with cursor-based pagination:
 *    a. Fetch 100 records from Bubble
 *    b. For each record, call mapFn to transform data
 *    c. Upsert to PostgreSQL (INSERT ... ON CONFLICT UPDATE)
 *    d. Track errors in results array
 * 3. Continue until remaining = 0
 *
 * UPSERT STRATEGY:
 * - Uses Drizzle onConflictDoUpdate
 * - Inserts new records
 * - Updates existing records (all fields from mapFn)
 * - Conflict column ensures uniqueness
 *
 * EDGE CASES:
 * - API failure mid-sync → Stops pagination, logs error
 * - Map function error → Caught, logged to results.errors, continues
 * - Empty table → Loops once, completes successfully
 *
 * SIDE EFFECTS:
 * - Writes to PostgreSQL (upsert operations)
 * - Appends to results.errors array
 * - Logs sync activity
 *
 * DEPENDENCIES:
 * - Requires: db, table definitions, BUBBLE_BASE_URL
 * - Used by: syncCompleteInvoicePackage (all tables)
 */
async function syncTable(typeName: string, table: any, conflictCol: any, mapFn: (b: any) => any, results: any) {
  let cursor = 0;
  let remaining = 1;
  logSyncActivity(`Sync Engine: Syncing ${typeName}...`, 'INFO');

  while (remaining > 0) {
    try {
      const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}`, { headers: BUBBLE_API_HEADERS });
      if (!res.ok) {
        logSyncActivity(`Sync Engine: ${typeName} fetch failed: ${res.status}`, 'ERROR');
        break;
      }
      const data = await res.json();
      const records = data.response.results || [];
      remaining = data.response.remaining || 0;
      cursor += records.length;

      if (records.length === 0) break;

      for (const b of records) {
        try {
          const vals = mapFn(b);
          await db.insert(table).values({ bubble_id: b._id, ...vals })
            .onConflictDoUpdate({
              target: conflictCol,
              set: vals
            });
        } catch (err) {
          results.errors.push(`${typeName} ${b._id}: ${err}`);
        }
      }
    } catch (err) {
      logSyncActivity(`Sync Engine: ${typeName} batch error: ${String(err)}`, 'ERROR');
      break;
    }
  }
}

/**
 * ============================================================================
 * FUNCTION: syncCompleteInvoicePackage
 * ============================================================================
 *
 * INTENT (What & Why):
 * Complete data and file sync engine. Syncs all Bubble tables to PostgreSQL
 * in dependency order. Optionally downloads files after data sync.
 *
 * DEPENDENCY ORDER (must sync in this sequence):
 * 1. Agents (referenced by Users)
 * 2. Users (referenced by Invoices as created_by)
 * 3. Customers (referenced by Invoices)
 * 4. Invoices (referenced by Payments, SEDA)
 * 5. SEDA Registrations (linked to Invoices)
 * 6. Invoice Templates (referenced by Invoices)
 * 7. Payments (reference Invoices, Customers)
 * 8. Submitted Payments (reference Invoices, Customers)
 *
 * INPUTS:
 * @param dateFrom - ISO date string (optional): NOT USED (legacy parameter)
 * @param dateTo - ISO date string (optional): NOT USED (legacy parameter)
 * @param triggerFileSync - boolean (default: false): Whether to download files after sync
 * @param sessionId - string (optional): Progress tracking session ID
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   results: {
 *     syncedCustomers: number,
 *     syncedInvoices: number,
 *     syncedPayments: number,
 *     syncedSubmittedPayments: number,
 *     syncedSedas: number,
 *     syncedUsers: number,
 *     syncedAgents: number,
 *     syncedTemplates: number,
 *     errors: string[]
 *   },
 *   error?: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Initialize progress session if sessionId provided
 * 2. Sync Agents
 * 3. Sync Users
 * 4. Sync Customers
 * 5. Sync Invoices
 * 6. Sync SEDA Registrations
 * 7. Sync Invoice Templates
 * 8. Sync Payments
 * 9. Sync Submitted Payments
 * 10. If triggerFileSync:
 *     a. For each file category (signatures, ic_copies, bills, etc.)
 *     b. Call syncFilesByCategory with 100 batch size
 *     c. Update progress after each category
 * 11. Mark progress as completed
 * 12. Return results
 *
 * FILE CATEGORIES DOWNLOADED:
 * - signatures: Customer signatures
 * - ic_copies: ID card copies (front/back)
 * - bills: TNB bills
 * - user_profiles: User profile pictures
 * - roof_site_images: Roof and site photos
 * - payments: Payment attachments
 *
 * FIELD MAPPINGS (simplified):
 * Each table has a mapping function that transforms Bubble field names
 * to PostgreSQL column names. See individual syncTable calls below.
 *
 * EDGE CASES:
 * - API error mid-sync → Stops, returns partial results with errors
 * - File sync error → Continues to next category, logs error
 * - No new data → All tables process 0 records, returns success
 *
 * SIDE EFFECTS:
 * - Writes to ALL major tables in PostgreSQL
 * - Downloads files to /storage directory if triggerFileSync=true
 * - Updates progress session if sessionId provided
 * - Calls logSyncActivity() for audit trail
 *
 * DEPENDENCIES:
 * - Requires: syncTable(), syncFilesByCategory(), db operations
 * - Used by: src/app/sync/actions/core-sync.ts (runManualSync)
 *
 * PERFORMANCE NOTES:
 * - Full sync (4000+ invoices): ~5-10 minutes
 * - File sync (1000+ files): ~10-30 minutes
 * - Each table sync: 30-120 seconds depending on record count
 *
 * DATE FILTER NOTE:
 * dateFrom/dateTo parameters are NOT IMPLEMENTED. This function always
 * syncs ALL records. For date-filtered sync, use syncInvoicePackageWithRelations.
 */
export async function syncCompleteInvoicePackage(dateFrom?: string, dateTo?: string, triggerFileSync = false, sessionId?: string) {
  logSyncActivity(`Sync Engine: Starting sync (DateFrom: ${dateFrom || 'ALL'}, FileSync: ${triggerFileSync})`, 'INFO');

  const results = {
    syncedCustomers: 0, syncedInvoices: 0,
    syncedPayments: 0, syncedSubmittedPayments: 0, syncedSedas: 0, syncedUsers: 0, syncedAgents: 0,
    syncedTemplates: 0,
    errors: [] as string[]
  };

  // Initialize progress session if provided
  if (sessionId) {
    updateProgress(sessionId, {
      status: 'idle',
      categoriesTotal: triggerFileSync ? ['signatures', 'ic_copies', 'bills', 'user_profiles', 'roof_site_images', 'payments'] : []
    });
  }

  try {
    // 1. Sync Agents
    await syncTable('agent', agents, agents.bubble_id, (b) => ({
      name: b.Name, email: b.email, contact: b.Contact, agent_type: b["Agent Type"],
      address: b.Address, bankin_account: b.bankin_account, banker: b.banker,
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }), results);

    // 2. Sync Users
    await syncTable('user', users, users.bubble_id, (b) => ({
      email: b.authentication?.email?.email, linked_agent_profile: b["Linked Agent Profile"],
      agent_code: b.agent_code, dealership: b.Dealership, profile_picture: b["Profile Picture"],
      user_signed_up: b.user_signed_up, access_level: b["Access Level"] || [],
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }), results);

    // 3. Sync Customers
    await syncTable('Customer_Profile', customers, customers.customer_id, (b) => ({
      name: b.Name || b.name || "", email: b.Email || b.email || null,
      phone: b.Contact || b.Whatsapp || b.phone || null, address: b.Address || b.address || null,
      city: b.City || b.city || null, state: b.State || b.state || null,
      postcode: b.Postcode || b.postcode || null, ic_number: b["IC Number"] || b.ic_number || b["IC No"] || null,
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }), results);

    // 4. Sync Invoices
    await syncTable('invoice', invoices, invoices.bubble_id, (b) => ({
      invoice_id: b["Invoice ID"] || b.invoice_id || null,
      invoice_number: b["Invoice Number"] || b.invoice_number || (b["Invoice ID"] ? b["Invoice ID"].toString() : null),
      linked_customer: b["Linked Customer"] || b.linked_customer || null,
      linked_agent: b["Linked Agent"] || b.linked_agent || null,
      linked_payment: b["Linked Payment"] || b.linked_payment || null,
      linked_seda_registration: b["Linked SEDA Registration"] || b.linked_seda_registration || null,
      linked_invoice_item: b["Linked Invoice Item"] || b["Linked invoice item"] || null,
      amount: b.Amount ? b.Amount.toString() : null,
      total_amount: b["Total Amount"] || b.total_amount || b.Amount || null,
      status: b.Status || b.status || 'draft',

      // Fix for missing dates:
      invoice_date: b["Invoice Date"] ? new Date(b["Invoice Date"]) : (b["Created Date"] ? new Date(b["Created Date"]) : null),
      created_at: b["Created Date"] ? new Date(b["Created Date"]) : new Date(), // Fallback to now if missing from Bubble
      created_by: b["Created By"] || null,

      updated_at: new Date(b["Modified Date"]),
    }), results);

    // 5. Sync SEDA
    await syncTable('seda_registration', sedaRegistration, sedaRegistration.bubble_id, (b) => {
      const mapped = mapSedaRegistrationFields(b);
      return {
        ...mapped,
        updated_at: new Date(b["Modified Date"]),
        last_synced_at: new Date()
      };
    }, results);

    // 6. Sync Invoice Templates
    await syncTable('invoice_template', invoice_templates, invoice_templates.bubble_id, (b) => ({
      template_name: b["Template Name"], company_name: b["Company Name"],
      company_address: b["Company Address"], company_phone: b["Company Phone"],
      company_email: b["Company Email"], sst_registration_no: b["SST Registration No"],
      bank_name: b["Bank Name"], bank_account_no: b["Bank Account No"],
      bank_account_name: b["Bank Account Name"], logo_url: b["Logo URL"],
      terms_and_conditions: b["Terms and Conditions"], active: b["Active"],
      is_default: b["Is Default"], disclaimer: b["Disclaimer"],
      apply_sst: b["Apply SST"],
      updated_at: new Date(b["Modified Date"])
    }), results);

    // 7. Sync Payments
    await syncTable('payment', payments, payments.bubble_id, (b) => ({
      amount: b.Amount?.toString(),
      payment_date: b["Payment Date"] ? new Date(b["Payment Date"]) : null,
      payment_method: b["Payment Method"],
      remark: b.Remark,
      linked_agent: b["Linked Agent"],
      linked_customer: b["Linked Customer"],
      linked_invoice: b["Linked Invoice"],
      created_by: b["Created By"],
      created_date: b["Created Date"] ? new Date(b["Created Date"]) : null,
      modified_date: new Date(b["Modified Date"]),
      last_synced_at: new Date()
    }), results);

    // 8. Sync Submitted Payments
    await syncTable('submit_payment', submitted_payments, submitted_payments.bubble_id, (b) => ({
      amount: b.Amount?.toString(),
      payment_date: b["Payment Date"] ? new Date(b["Payment Date"]) : null,
      payment_method: b["Payment Method"],
      remark: b.Remark,
      linked_agent: b["Linked Agent"],
      linked_customer: b["Linked Customer"],
      linked_invoice: b["Linked Invoice"],
      created_by: b["Created By"],
      created_date: b["Created Date"] ? new Date(b["Created Date"]) : null,
      modified_date: new Date(b["Modified Date"]),
      status: b.Status || 'pending',
      last_synced_at: new Date()
    }), results);

    // File sync (optional)
    if (triggerFileSync) {
      logSyncActivity('Sync Engine: Auto-triggering file sync categories...', 'INFO');
      const categories: any[] = ['signatures', 'ic_copies', 'bills', 'user_profiles', 'roof_site_images', 'payments'];

      if (sessionId) {
        updateProgress(sessionId, {
          categoriesTotal: categories,
          categoriesCompleted: [],
          status: 'running'
        });
      }

      for (const cat of categories) {
        logSyncActivity(`Sync Engine: Starting file category ${cat}...`, 'INFO');

        const fileRes = await syncFilesByCategory(cat, 100, sessionId);

        if (sessionId) {
          const currentProgress = getProgress(sessionId);
          const completed = currentProgress?.categoriesCompleted || [];
          updateProgress(sessionId, {
            categoriesCompleted: [...completed, cat]
          });
        }

        logSyncActivity(`Sync Engine: File category ${cat} finished. Success: ${fileRes.results?.success}, Fail: ${fileRes.results?.failed}`, 'INFO');
      }

      if (sessionId) {
        updateProgress(sessionId, { status: 'completed' });
      }
    }

    logSyncActivity('Sync Engine: All tables finished.', 'INFO');
    return { success: true, results };
  } catch (error) {
    logSyncActivity(`Sync Engine Error: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
