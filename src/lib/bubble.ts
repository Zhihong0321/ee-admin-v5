import { db } from "@/lib/db";
import { users, agents, payments, submitted_payments, customers, invoices, invoice_new_items, sedaRegistration, invoice_templates } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { syncFilesByCategory } from "@/app/manage-company/storage-actions";
import { logSyncActivity } from "./logger";
import { createProgressSession, updateProgress, deleteProgress, getProgress } from "./progress-tracker";

const BUBBLE_API_KEY = process.env.BUBBLE_API_KEY || 'b870d2b5ee6e6b39bcf99409c59c9e02';
const BUBBLE_BASE_URL = 'https://eternalgy.bubbleapps.io/api/1.1/obj';

const headers = {
  'Authorization': `Bearer ${BUBBLE_API_KEY}`,
  'Content-Type': 'application/json'
};

/**
 * Pushes local User updates back to Bubble
 */
export async function pushUserUpdateToBubble(bubbleId: string, data: { access_level?: string[] }) {
  if (!bubbleId) return;

  const bubbleData: any = {};
  if (data.access_level) {
    bubbleData["Access Level"] = data.access_level;
  }

  if (Object.keys(bubbleData).length === 0) return;

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/user/${bubbleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(bubbleData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bubble User Patch Failed (${response.status}):`, errorText);
      throw new Error(`Bubble Update Failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error pushing User update to Bubble:", error);
    throw error;
  }
}

/**
 * Pushes local Agent updates back to Bubble
 */
export async function pushAgentUpdateToBubble(bubbleId: string, data: {
  name?: string | null;
  email?: string | null;
  contact?: string | null;
  agent_type?: string | null;
  address?: string | null;
  bankin_account?: string | null;
  banker?: string | null;
}) {
  if (!bubbleId) return;

  const bubbleData: any = {};
  if (data.name) bubbleData["Name"] = data.name;
  if (data.contact) bubbleData["Contact"] = data.contact;
  if (data.agent_type) bubbleData["Agent Type"] = data.agent_type;
  if (data.email) bubbleData["email"] = data.email;
  if (data.address) bubbleData["Address"] = data.address;
  if (data.bankin_account) bubbleData["bankin_account"] = data.bankin_account;
  if (data.banker) bubbleData["banker"] = data.banker;

  if (Object.keys(bubbleData).length === 0) return;

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/agent/${bubbleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(bubbleData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bubble Agent Patch Failed (${response.status}):`, errorText);
      throw new Error(`Bubble Update Failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error pushing Agent update to Bubble:", error);
    throw error;
  }
}

/**
 * Pushes local Payment updates back to Bubble
 */
export async function pushPaymentUpdateToBubble(bubbleId: string, data: {
  amount?: string | null;
  payment_method?: string | null;
  remark?: string | null;
  payment_date?: Date | null;
}) {
  if (!bubbleId) return;

  const bubbleData: any = {};
  if (data.amount) bubbleData["Amount"] = parseFloat(data.amount);
  if (data.payment_method) bubbleData["Payment Method"] = data.payment_method;
  if (data.remark) bubbleData["Remark"] = data.remark;
  if (data.payment_date) bubbleData["Payment Date"] = data.payment_date.toISOString();

  if (Object.keys(bubbleData).length === 0) return;

  try {
    const response = await fetch(`${BUBBLE_BASE_URL}/payment/${bubbleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(bubbleData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bubble Payment Patch Failed (${response.status}):`, errorText);
      throw new Error(`Bubble Update Failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error pushing Payment update to Bubble:", error);
    throw error;
  }
}

// Shared Sync Helper
async function syncTable(typeName: string, table: any, conflictCol: any, mapFn: (b: any) => any, results: any) {
  let cursor = 0;
  let remaining = 1;
  logSyncActivity(`Sync Engine: Syncing ${typeName}...`, 'INFO');

  while (remaining > 0) {
    try {
      const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}`, { headers });
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
 * Complete Data & File Sync Engine with Pagination and Upsert logic
 */
export async function syncCompleteInvoicePackage(dateFrom?: string, dateTo?: string, triggerFileSync = false, sessionId?: string) {
  logSyncActivity(`Sync Engine: Starting sync (DateFrom: ${dateFrom || 'ALL'}, FileSync: ${triggerFileSync})`, 'INFO');

  const results = {
    syncedCustomers: 0, syncedInvoices: 0, syncedItems: 0,
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
      amount: b.Amount ? b.Amount.toString() : null,
      total_amount: b["Total Amount"] || b.total_amount || b.Amount || null,
      status: b.Status || b.status || 'draft',
      
      // Fix for missing dates:
      invoice_date: b["Invoice Date"] ? new Date(b["Invoice Date"]) : (b["Created Date"] ? new Date(b["Created Date"]) : null),
      created_at: b["Created Date"] ? new Date(b["Created Date"]) : new Date(), // Fallback to now if missing from Bubble
      created_by: b["Created By"] || null,

      updated_at: new Date(b["Modified Date"]),
    }), results);

    // 5. Sync Invoice Items
    await syncTable('invoice_new_item', invoice_new_items, invoice_new_items.bubble_id, (b) => ({
      invoice_id: b.Invoice, description: b.Description, qty: b.Qty,
      unit_price: b["Unit Price"], total_price: b["Total Price"],
      item_type: b["Item Type"], sort_order: b["Sort Order"],
      created_at: new Date(b["Created Date"])
    }), results);

    // 6. Sync SEDA
    await syncTable('seda_registration', sedaRegistration, sedaRegistration.bubble_id, (b) => ({
      reg_status: b["Reg Status"], state: b.State, city: b.City, agent: b.Agent,
      project_price: b["Project Price"], linked_customer: b["Linked Customer"],
      customer_signature: b["Customer Signature"], ic_copy_front: b["IC Copy Front"],
      ic_copy_back: b["IC Copy Back"], tnb_bill_1: b["TNB Bill 1"],
      tnb_bill_2: b["TNB Bill 2"], tnb_bill_3: b["TNB Bill 3"],
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }), results);

    // 7. Sync Invoice Templates
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

    // 8. Sync Payments
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

    // 9. Sync Submitted Payments
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

/**
 * Sync Payments Only
 */
export async function syncPaymentsFromBubble() {
  const results = { syncedPayments: 0, syncedSubmittedPayments: 0, errors: [] as string[] };
  try {
     // Sync Payments
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
  
      // Sync Submitted Payments
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
      
      return { success: true, results };
  } catch (error) {
    console.error("Sync Payments Error:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Sync Profiles Only (User + Agent)
 */
export async function syncProfilesFromBubble() {
    const results = { syncedUsers: 0, syncedAgents: 0, errors: [] as string[] };
    try {
        // Sync Agents
        await syncTable('agent', agents, agents.bubble_id, (b) => ({
            name: b.Name, email: b.email, contact: b.Contact, agent_type: b["Agent Type"],
            address: b.Address, bankin_account: b.bankin_account, banker: b.banker,
            updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
        }), results);
  
        // Sync Users
        await syncTable('user', users, users.bubble_id, (b) => ({
            email: b.authentication?.email?.email, linked_agent_profile: b["Linked Agent Profile"],
            agent_code: b.agent_code, dealership: b.Dealership, profile_picture: b["Profile Picture"],
            user_signed_up: b.user_signed_up, access_level: b["Access Level"] || [],
            updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
        }), results);

        return { success: true, results };
    } catch (error) {
        console.error("Sync Profiles Error:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * Sync Single Profile (User or Agent) by ID
 */
export async function syncSingleProfileFromBubble(bubbleId: string, type: 'user' | 'agent') {
    try {
        const typeName = type === 'user' ? 'user' : 'agent';
        const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}/${bubbleId}`, { headers });
        
        if (!res.ok) {
            throw new Error(`Failed to fetch ${type} from Bubble: ${res.statusText}`);
        }
        
        const data = await res.json();
        const b = data.response; // Single object
        
        if (type === 'user') {
            const vals = {
                email: b.authentication?.email?.email, linked_agent_profile: b["Linked Agent Profile"],
                agent_code: b.agent_code, dealership: b.Dealership, profile_picture: b["Profile Picture"],
                user_signed_up: b.user_signed_up, access_level: b["Access Level"] || [],
                updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
            };
            
            await db.insert(users).values({ bubble_id: b._id, ...vals })
                .onConflictDoUpdate({ target: users.bubble_id, set: vals });
        } else {
             const vals = {
                name: b.Name, email: b.email, contact: b.Contact, agent_type: b["Agent Type"],
                address: b.Address, bankin_account: b.bankin_account, banker: b.banker,
                updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
            };
             await db.insert(agents).values({ bubble_id: b._id, ...vals })
                .onConflictDoUpdate({ target: agents.bubble_id, set: vals });
        }

        return { success: true };
    } catch (error) {
        console.error(`Sync Single ${type} Error:`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * Fetch a single record from Bubble API by Bubble ID
 */
async function fetchBubbleRecordByTypeName(typeName: string, bubbleId: string): Promise<any> {
  const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}/${bubbleId}`, { headers });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${typeName} ${bubbleId} from Bubble: ${res.statusText}`);
  }

  const data = await res.json();
  return data.response; // Single object
}

/**
 * Fetch records from Bubble API with optional constraints
 *
 * NOTE: Bubble API does NOT support constraints on system fields like 'Modified Date'
 * Constraints only work on custom fields. For date filtering on Modified Date, fetch all
 * records and filter locally instead.
 */
async function fetchBubbleRecordsWithConstraints(typeName: string, constraints: any[] = []): Promise<any[]> {
  const allRecords: any[] = [];
  let cursor = 0;

  while (true) {
    try {
      let url = `${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}`;

      // Only add constraints if provided (for non-system fields)
      if (constraints.length > 0) {
        const constraintsParam = encodeURIComponent(JSON.stringify(constraints));
        url += `&constraints=${constraintsParam}`;
      }

      const res = await fetch(url, { headers });

      if (!res.ok) {
        // Don't log 404 as error - it just means no records found
        if (res.status !== 404) {
          console.error(`Error fetching ${typeName} batch: ${res.statusText}`);
        }
        break;
      }

      const data = await res.json();
      const records = data.response.results || [];
      const remaining = data.response.remaining || 0;

      allRecords.push(...records);

      if (remaining === 0 || records.length === 0) {
        break;
      }

      cursor += records.length;
    } catch (err) {
      // Only log unexpected errors, not 404s (no records found)
      if (!String(err).includes('Not Found')) {
        console.error(`Error fetching ${typeName} batch:`, err);
      }
      break;
    }
  }

  return allRecords;
}

/**
 * Full Invoice Sync with Date Range and Relational Data
 *
 * NEW APPROACH:
 * 1. Fetch invoices filtered by date range from Bubble
 * 2. For each invoice, fetch ALL its related data (customer, agent, payments, SEDA, items)
 * 3. Upsert everything to PostgreSQL
 * 4. Does NOT download files
 *
 * CRITICAL: If an invoice is newer in Bubble, ALL its related data is synced regardless of
 * their individual timestamps. This ensures complete invoice data package.
 *
 * Source: Bubble Data API (Bubble DB)
 * Destination: PostgreSQL
 */
export async function syncInvoicePackageWithRelations(dateFrom: string, dateTo?: string, sessionId?: string) {
  logSyncActivity(`Full Invoice Sync Engine: Starting (DateFrom: ${dateFrom}, DateTo: ${dateTo || 'current'})`, 'INFO');

  const results = {
    syncedInvoices: 0,
    syncedCustomers: 0,
    syncedAgents: 0,
    syncedUsers: 0,
    syncedPayments: 0,
    syncedSubmittedPayments: 0,
    syncedItems: 0,
    syncedSedas: 0,
    syncedTemplates: 0,
    errors: [] as string[]
  };

  // Initialize progress session if provided
  if (sessionId) {
    updateProgress(sessionId, {
      status: 'running',
      category: 'Fetching invoices',
      details: ['Starting full invoice sync...']
    });
  }

  try {
    // Step 1: Fetch invoices within date range from Bubble
    logSyncActivity(`Step 1: Fetching invoices from ${dateFrom} to ${dateTo || 'current'}...`, 'INFO');

    // NOTE: Bubble API does NOT support constraints on 'Modified Date' field
    // We must fetch ALL invoices and filter locally
    const fromDate = new Date(dateFrom);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    logSyncActivity(`Fetching all invoices from Bubble (API doesn't support Modified Date constraints)...`, 'INFO');
    const allInvoices = await fetchBubbleRecordsWithConstraints('invoice', []);
    logSyncActivity(`Fetched ${allInvoices.length} total invoices from Bubble`, 'INFO');

    // Filter locally by Modified Date
    const bubbleInvoices = allInvoices.filter(inv => {
      const modifiedDate = new Date(inv["Modified Date"]);
      return modifiedDate >= fromDate && modifiedDate <= toDate;
    });

    logSyncActivity(`After filtering by Modified Date: ${bubbleInvoices.length} invoices in range`, 'INFO');

    if (bubbleInvoices.length === 0) {
      logSyncActivity(`No invoices found in the specified date range`, 'INFO');
      return { success: true, results };
    }

    // Build a map of which invoices need sync (invoice OR relations are newer)
    const invoicesNeedingFullSync = new Map<string, boolean>();
    const customerIdsToSync = new Set<string>();
    const agentIdsToSync = new Set<string>();
    const paymentIdsToSync = new Set<string>();
    const sedaIdsToSync = new Set<string>();

    logSyncActivity(`Step 2: Checking which invoices OR their relations are newer...`, 'INFO');

    for (const inv of bubbleInvoices) {
      let needsSync = false;
      const reasons: string[] = [];

      // Check invoice timestamp
      const existingInvoice = await db.query.invoices.findFirst({
        where: eq(invoices.bubble_id, inv._id)
      });

      const bubbleInvModifiedDate = new Date(inv["Modified Date"]);
      const invoiceIsNewer = !existingInvoice ||
        !existingInvoice.updated_at ||
        bubbleInvModifiedDate > new Date(existingInvoice.updated_at);

      if (invoiceIsNewer) {
        needsSync = true;
        reasons.push('invoice');
      }

      // Check customer timestamp
      if (inv["Linked Customer"]) {
        const existingCustomer = await db.query.customers.findFirst({
          where: eq(customers.customer_id, inv["Linked Customer"])
        });

        // Need to fetch from Bubble to check Modified Date
        try {
          const customer = await fetchBubbleRecordByTypeName('Customer_Profile', inv["Linked Customer"]);
          const bubbleCustModifiedDate = new Date(customer["Modified Date"]);
          const customerIsNewer = !existingCustomer ||
            !existingCustomer.last_synced_at ||
            bubbleCustModifiedDate > new Date(existingCustomer.last_synced_at);

          if (customerIsNewer) {
            needsSync = true;
            reasons.push('customer');
          }
        } catch (err) {
          // Customer might not exist, skip
        }
      }

      // Check agent timestamp
      if (inv["Linked Agent"]) {
        const existingAgent = await db.query.agents.findFirst({
          where: eq(agents.bubble_id, inv["Linked Agent"])
        });

        try {
          const agent = await fetchBubbleRecordByTypeName('agent', inv["Linked Agent"]);
          const bubbleAgentModifiedDate = new Date(agent["Modified Date"]);
          const agentIsNewer = !existingAgent ||
            !existingAgent.last_synced_at ||
            bubbleAgentModifiedDate > new Date(existingAgent.last_synced_at);

          if (agentIsNewer) {
            needsSync = true;
            reasons.push('agent');
          }
        } catch (err) {
          // Agent might not exist, skip
        }
      }

      // Check SEDA timestamp
      if (inv["Linked SEDA Registration"]) {
        const existingSeda = await db.query.sedaRegistration.findFirst({
          where: eq(sedaRegistration.bubble_id, inv["Linked SEDA Registration"])
        });

        try {
          const seda = await fetchBubbleRecordByTypeName('seda_registration', inv["Linked SEDA Registration"]);
          const bubbleSedaModifiedDate = new Date(seda["Modified Date"]);
          const sedaIsNewer = !existingSeda ||
            !existingSeda.last_synced_at ||
            bubbleSedaModifiedDate > new Date(existingSeda.last_synced_at);

          if (sedaIsNewer) {
            needsSync = true;
            reasons.push('seda');
          }
        } catch (err) {
          // SEDA might not exist, skip
        }
      }

      // Check payments timestamps
      if (inv["Linked Payment"] && Array.isArray(inv["Linked Payment"])) {
        for (const paymentId of inv["Linked Payment"] as string[]) {
          let paymentIsNewer = false;

          // Try payment table first
          const existingPayment = await db.query.payments.findFirst({
            where: eq(payments.bubble_id, paymentId)
          });

          if (existingPayment) {
            if (!existingPayment.last_synced_at) {
              paymentIsNewer = true;
            } else if (existingPayment.modified_date) {
              paymentIsNewer = new Date(existingPayment.modified_date) > new Date(existingPayment.last_synced_at);
            }
          } else {
            // Try submitted_payments table
            const existingSubmittedPayment = await db.query.submitted_payments.findFirst({
              where: eq(submitted_payments.bubble_id, paymentId)
            });

            if (existingSubmittedPayment) {
              if (!existingSubmittedPayment.last_synced_at) {
                paymentIsNewer = true;
              } else if (existingSubmittedPayment.modified_date) {
                paymentIsNewer = new Date(existingSubmittedPayment.modified_date) > new Date(existingSubmittedPayment.last_synced_at);
              }
            } else {
              // Payment doesn't exist locally, needs sync
              paymentIsNewer = true;
            }
          }

          if (paymentIsNewer) {
            needsSync = true;
            reasons.push('payment');
            break; // At least one payment is newer, no need to check more
          }
        }
      }

      invoicesNeedingFullSync.set(inv._id, needsSync);

      // Collect IDs only for invoices that need sync
      if (needsSync) {
        if (inv["Linked Customer"]) customerIdsToSync.add(inv["Linked Customer"]);
        if (inv["Linked Agent"]) agentIdsToSync.add(inv["Linked Agent"]);
        if (inv["Linked Payment"]) {
          (inv["Linked Payment"] as string[]).forEach(p => paymentIdsToSync.add(p));
        }
        if (inv["Linked SEDA Registration"]) sedaIdsToSync.add(inv["Linked SEDA Registration"]);

        // Log why this invoice needs sync (for debugging)
        logSyncActivity(`Invoice ${inv._id} needs sync: ${reasons.join(', ')}`, 'INFO');
      }
    }

    const needsSyncCount = Array.from(invoicesNeedingFullSync.values()).filter(v => v).length;
    logSyncActivity(`Found ${needsSyncCount} invoices needing sync (invoice or relations newer)`, 'INFO');

    // Step 3: Fetch and sync all related data
    // NOTE: We force-sync these because invoice OR relations are newer
    logSyncActivity(`Step 3: Fetching and syncing related data for invoices needing sync...`, 'INFO');

    // 3a. Fetch and sync Customers (FORCE SYNC - linked to newer invoices)
    for (const customerId of customerIdsToSync) {
      try {
        const customer = await fetchBubbleRecordByTypeName('Customer_Profile', customerId);

        const vals = {
          name: customer.Name || customer.name || "",
          email: customer.Email || customer.email || null,
          phone: customer.Contact || customer.Whatsapp || customer.phone || null,
          address: customer.Address || customer.address || null,
          city: customer.City || customer.city || null,
          state: customer.State || customer.state || null,
          postcode: customer.Postcode || customer.postcode || null,
          ic_number: customer["IC Number"] || customer.ic_number || customer["IC No"] || null,
          updated_at: new Date(customer["Modified Date"]),
          last_synced_at: new Date()
        };

        // FORCE UPSERT - Always update because parent invoice is newer
        await db.insert(customers).values({ customer_id: customerId, ...vals })
          .onConflictDoUpdate({ target: customers.customer_id, set: vals });
        results.syncedCustomers++;
      } catch (err) {
        results.errors.push(`Customer ${customerId}: ${err}`);
      }
    }

    // 3b. Fetch and sync Agents (FORCE SYNC - linked to newer invoices)
    for (const agentId of agentIdsToSync) {
      try {
        const agent = await fetchBubbleRecordByTypeName('agent', agentId);

        const vals = {
          name: agent.Name,
          email: agent.email,
          contact: agent.Contact,
          agent_type: agent["Agent Type"],
          address: agent.Address,
          bankin_account: agent.bankin_account,
          banker: agent.banker,
          updated_at: new Date(agent["Modified Date"]),
          last_synced_at: new Date()
        };

        // FORCE UPSERT - Always update because parent invoice is newer
        await db.insert(agents).values({ bubble_id: agentId, ...vals })
          .onConflictDoUpdate({ target: agents.bubble_id, set: vals });
        results.syncedAgents++;
      } catch (err) {
        results.errors.push(`Agent ${agentId}: ${err}`);
      }
    }

    // 3c. Fetch and sync Users (FORCE SYNC - linked to newer invoices via agents)
    for (const agentId of agentIdsToSync) {
      try {
        // Find user by querying for users with this agent profile
        const userConstraints = [{
          key: 'Linked Agent Profile',
          constraint: 'equals',
          value: agentId
        }];
        const bubbleUsers = await fetchBubbleRecordsWithConstraints('user', userConstraints);

        // Skip if no users found for this agent (not an error, just no linked user)
        if (!bubbleUsers || bubbleUsers.length === 0) {
          continue;
        }

        for (const user of bubbleUsers) {
          const vals = {
            email: user.authentication?.email?.email,
            linked_agent_profile: user["Linked Agent Profile"],
            agent_code: user.agent_code,
            dealership: user.Dealership,
            profile_picture: user["Profile Picture"],
            user_signed_up: user.user_signed_up,
            access_level: user["Access Level"] || [],
            updated_at: new Date(user["Modified Date"]),
            last_synced_at: new Date()
          };

          // FORCE UPSERT - Always update because parent invoice is newer
          await db.insert(users).values({ bubble_id: user._id, ...vals })
            .onConflictDoUpdate({ target: users.bubble_id, set: vals });
          results.syncedUsers++;
        }
      } catch (err) {
        // Only log real errors, not "not found" which is expected for agents without users
        if (!String(err).includes('Not Found')) {
          results.errors.push(`User for agent ${agentId}: ${err}`);
        }
      }
    }

    // 3d. Fetch and sync Payments (FORCE SYNC - linked to newer invoices)
    for (const paymentId of paymentIdsToSync) {
      try {
        const payment = await fetchBubbleRecordByTypeName('payment', paymentId);

        const vals = {
          amount: payment.Amount?.toString(),
          payment_date: payment["Payment Date"] ? new Date(payment["Payment Date"]) : null,
          payment_method: payment["Payment Method"],
          remark: payment.Remark,
          linked_agent: payment["Linked Agent"],
          linked_customer: payment["Linked Customer"],
          linked_invoice: payment["Linked Invoice"],
          created_by: payment["Created By"],
          created_date: payment["Created Date"] ? new Date(payment["Created Date"]) : null,
          modified_date: new Date(payment["Modified Date"]),
          last_synced_at: new Date()
        };

        // FORCE UPSERT - Always update because parent invoice is newer
        await db.insert(payments).values({ bubble_id: paymentId, ...vals })
          .onConflictDoUpdate({ target: payments.bubble_id, set: vals });
        results.syncedPayments++;
      } catch (err) {
        // Payment might be in submit_payment table instead
        try {
          const submittedPayment = await fetchBubbleRecordByTypeName('submit_payment', paymentId);

          const vals = {
            amount: submittedPayment.Amount?.toString(),
            payment_date: submittedPayment["Payment Date"] ? new Date(submittedPayment["Payment Date"]) : null,
            payment_method: submittedPayment["Payment Method"],
            remark: submittedPayment.Remark,
            linked_agent: submittedPayment["Linked Agent"],
            linked_customer: submittedPayment["Linked Customer"],
            linked_invoice: submittedPayment["Linked Invoice"],
            created_by: submittedPayment["Created By"],
            created_date: submittedPayment["Created Date"] ? new Date(submittedPayment["Created Date"]) : null,
            modified_date: new Date(submittedPayment["Modified Date"]),
            status: submittedPayment.Status || 'pending',
            last_synced_at: new Date()
          };

          // FORCE UPSERT - Always update because parent invoice is newer
          await db.insert(submitted_payments).values({ bubble_id: paymentId, ...vals })
            .onConflictDoUpdate({ target: submitted_payments.bubble_id, set: vals });
          results.syncedSubmittedPayments++;
        } catch (err2) {
          results.errors.push(`Payment ${paymentId} (tried both tables): ${err2}`);
        }
      }
    }

    // 3e. Fetch and sync SEDA registrations (FORCE SYNC - linked to newer invoices)
    for (const sedaId of sedaIdsToSync) {
      try {
        const seda = await fetchBubbleRecordByTypeName('seda_registration', sedaId);

        const vals = {
          reg_status: seda["Reg Status"],
          state: seda.State,
          city: seda.City,
          agent: seda.Agent,
          project_price: seda["Project Price"],
          linked_customer: seda["Linked Customer"],
          customer_signature: seda["Customer Signature"],
          ic_copy_front: seda["IC Copy Front"],
          ic_copy_back: seda["IC Copy Back"],
          tnb_bill_1: seda["TNB Bill 1"],
          tnb_bill_2: seda["TNB Bill 2"],
          tnb_bill_3: seda["TNB Bill 3"],
          updated_at: new Date(seda["Modified Date"]),
          last_synced_at: new Date()
        };

        // FORCE UPSERT - Always update because parent invoice is newer
        await db.insert(sedaRegistration).values({ bubble_id: sedaId, ...vals })
          .onConflictDoUpdate({ target: sedaRegistration.bubble_id, set: vals });
        results.syncedSedas++;
      } catch (err) {
        results.errors.push(`SEDA ${sedaId}: ${err}`);
      }
    }

    // Step 4: Sync the invoices themselves (only if newer)
    logSyncActivity(`Step 4: Syncing invoices...`, 'INFO');

    for (const inv of bubbleInvoices) {
      try {
        const isNewer = invoicesNeedingFullSync.get(inv._id);

        if (!isNewer) {
          // Skip if invoice is not newer (we already counted it in step 2)
          continue;
        }

        const bubbleModifiedDate = new Date(inv["Modified Date"]);
        const vals = {
          invoice_id: inv["Invoice ID"] || inv.invoice_id || null,
          invoice_number: inv["Invoice Number"] || inv.invoice_number || (inv["Invoice ID"] ? inv["Invoice ID"].toString() : null),
          linked_customer: inv["Linked Customer"] || inv.linked_customer || null,
          linked_agent: inv["Linked Agent"] || inv.linked_agent || null,
          linked_payment: inv["Linked Payment"] || inv.linked_payment || null,
          linked_seda_registration: inv["Linked SEDA Registration"] || inv.linked_seda_registration || null,
          amount: inv.Amount ? inv.Amount.toString() : null,
          total_amount: inv["Total Amount"] || inv.total_amount || inv.Amount || null,
          status: inv.Status || inv.status || 'draft',
          invoice_date: inv["Invoice Date"] ? new Date(inv["Invoice Date"]) : (inv["Created Date"] ? new Date(inv["Created Date"]) : null),
          created_at: inv["Created Date"] ? new Date(inv["Created Date"]) : new Date(),
          created_by: inv["Created By"] || null,
          updated_at: bubbleModifiedDate,
        };

        // Always update because we confirmed invoice is newer in step 2
        await db.insert(invoices).values({ bubble_id: inv._id, ...vals })
          .onConflictDoUpdate({ target: invoices.bubble_id, set: vals });
        results.syncedInvoices++;
      } catch (err) {
        results.errors.push(`Invoice ${inv._id}: ${err}`);
      }
    }

    // Step 5: Sync invoice items (only for newer invoices - part of complete invoice data)
    logSyncActivity(`Step 5: Syncing invoice items for newer invoices...`, 'INFO');

    for (const inv of bubbleInvoices) {
      const isNewer = invoicesNeedingFullSync.get(inv._id);

      // Only sync items for invoices that are newer (complete data package)
      if (!isNewer) continue;

      try {
        // Fetch items for this invoice
        const itemConstraints = [{
          key: 'Invoice',
          constraint: 'equals',
          value: inv._id
        }];
        const items = await fetchBubbleRecordsWithConstraints('invoice_new_item', itemConstraints);

        for (const item of items) {
          const vals = {
            invoice_id: item.Invoice,
            description: item.Description,
            qty: item.Qty,
            unit_price: item["Unit Price"],
            total_price: item["Total Price"],
            item_type: item["Item Type"],
            sort_order: item["Sort Order"],
            created_at: new Date(item["Created Date"])
          };
          // FORCE UPSERT - Part of complete invoice data package
          await db.insert(invoice_new_items).values({ bubble_id: item._id, ...vals })
            .onConflictDoUpdate({ target: invoice_new_items.bubble_id, set: vals });
          results.syncedItems++;
        }
      } catch (err) {
        results.errors.push(`Items for invoice ${inv._id}: ${err}`);
      }
    }

    // Step 6: Sync invoice templates (fetch all for completeness)
    logSyncActivity(`Step 6: Syncing invoice templates...`, 'INFO');

    let cursor = 0;
    while (true) {
      try {
        const res = await fetch(`${BUBBLE_BASE_URL}/invoice_template?limit=100&cursor=${cursor}`, { headers });
        if (!res.ok) break;
        const data = await res.json();
        const records = data.response.results || [];
        const remaining = data.response.remaining || 0;

        for (const tmpl of records) {
          const vals = {
            template_name: tmpl["Template Name"],
            company_name: tmpl["Company Name"],
            company_address: tmpl["Company Address"],
            company_phone: tmpl["Company Phone"],
            company_email: tmpl["Company Email"],
            sst_registration_no: tmpl["SST Registration No"],
            bank_name: tmpl["Bank Name"],
            bank_account_no: tmpl["Bank Account No"],
            bank_account_name: tmpl["Bank Account Name"],
            logo_url: tmpl["Logo URL"],
            terms_and_conditions: tmpl["Terms and Conditions"],
            active: tmpl["Active"],
            is_default: tmpl["Is Default"],
            disclaimer: tmpl["Disclaimer"],
            apply_sst: tmpl["Apply SST"],
            updated_at: new Date(tmpl["Modified Date"])
          };
          await db.insert(invoice_templates).values({ bubble_id: tmpl._id, ...vals })
            .onConflictDoUpdate({ target: invoice_templates.bubble_id, set: vals });
          results.syncedTemplates++;
        }

        if (remaining === 0 || records.length === 0) break;
        cursor += records.length;
      } catch (err) {
        logSyncActivity(`Template sync error: ${err}`, 'ERROR');
        break;
      }
    }

    if (sessionId) {
      updateProgress(sessionId, {
        status: 'completed',
        category: 'Completed',
        details: [`Full Invoice Sync Complete: ${results.syncedInvoices} invoices synced`]
      });
    }

    logSyncActivity(`Full Invoice Sync Complete: ${results.syncedInvoices} invoices, ${results.syncedCustomers} customers, ${results.syncedAgents} agents, ${results.syncedPayments + results.syncedSubmittedPayments} payments, ${results.syncedItems} items, ${results.syncedSedas} SEDA, ${results.syncedTemplates} templates`, 'INFO');

    if (results.errors.length > 0) {
      logSyncActivity(`Errors encountered: ${results.errors.length}`, 'ERROR');
      results.errors.slice(0, 5).forEach(e => logSyncActivity(e, 'ERROR'));
    }

    return { success: true, results };
  } catch (error) {
    logSyncActivity(`Full Invoice Sync Engine Error: ${String(error)}`, 'ERROR');
    if (sessionId) {
      updateProgress(sessionId, {
        status: 'error',
        category: 'Error',
        details: [`Error: ${String(error)}`]
      });
    }
    return { success: false, error: String(error) };
  }
}

/**
 * SEDA Registration-Only Sync with Date Range
 *
 * Syncs ONLY SEDA registrations within a date range.
 * Overwrites local data if Bubble is newer.
 *
 * Use case: SEDA registrations have frequent updates (status changes, document uploads)
 * and need to be synced independently of invoices.
 */
export async function syncSedaRegistrations(dateFrom: string, dateTo?: string) {
  logSyncActivity(`SEDA Sync: Starting (DateFrom: ${dateFrom}, DateTo: ${dateTo || 'current'})`, 'INFO');

  const results = {
    syncedSedas: 0,
    skippedSedas: 0,
    errors: [] as string[]
  };

  try {
    // Step 1: Fetch SEDA registrations from Bubble
    logSyncActivity(`Step 1: Fetching SEDA registrations from ${dateFrom} to ${dateTo || 'current'}...`, 'INFO');

    // NOTE: Bubble API does NOT support constraints on 'Modified Date' field
    // We must fetch ALL and filter locally
    const fromDate = new Date(dateFrom);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    logSyncActivity(`Fetching all SEDA registrations from Bubble...`, 'INFO');
    const allSedas = await fetchBubbleRecordsWithConstraints('seda_registration', []);
    logSyncActivity(`Fetched ${allSedas.length} total SEDA registrations from Bubble`, 'INFO');

    // Filter locally by Modified Date
    const bubbleSedas = allSedas.filter(seda => {
      const modifiedDate = new Date(seda["Modified Date"]);
      return modifiedDate >= fromDate && modifiedDate <= toDate;
    });

    logSyncActivity(`After filtering by Modified Date: ${bubbleSedas.length} SEDA registrations in range`, 'INFO');

    if (bubbleSedas.length === 0) {
      logSyncActivity(`No SEDA registrations found in the specified date range`, 'INFO');
      return { success: true, results };
    }

    // Step 2: Sync each SEDA registration
    logSyncActivity(`Step 2: Syncing SEDA registrations...`, 'INFO');

    for (const seda of bubbleSedas) {
      try {
        // Check if record exists and compare timestamps
        const existingRecord = await db.query.sedaRegistration.findFirst({
          where: eq(sedaRegistration.bubble_id, seda._id)
        });

        const bubbleModifiedDate = new Date(seda["Modified Date"]);
        const shouldUpdate = !existingRecord ||
          !existingRecord.last_synced_at ||
          bubbleModifiedDate > new Date(existingRecord.last_synced_at);

        if (shouldUpdate) {
          const vals = {
            reg_status: seda["Reg Status"],
            state: seda.State,
            city: seda.City,
            agent: seda.Agent,
            project_price: seda["Project Price"],
            linked_customer: seda["Linked Customer"],
            customer_signature: seda["Customer Signature"],
            ic_copy_front: seda["IC Copy Front"],
            ic_copy_back: seda["IC Copy Back"],
            tnb_bill_1: seda["TNB Bill 1"],
            tnb_bill_2: seda["TNB Bill 2"],
            tnb_bill_3: seda["TNB Bill 3"],
            nem_cert: seda["NEM Cert"],
            mykad_pdf: seda["Mykad PDF"],
            property_ownership_prove: seda["Property Ownership Prove"],
            check_tnb_bill_and_meter_image: seda["Check TNB Bill and Meter Image"],
            roof_images: seda["Roof Images"],
            site_images: seda["Site Images"],
            drawing_pdf_system: seda["Drawing PDF System"],
            drawing_system_actual: seda["Drawing System Actual"],
            drawing_engineering_seda_pdf: seda["Drawing Engineering Seda PDF"],
            modified_date: bubbleModifiedDate,
            updated_at: bubbleModifiedDate,
            last_synced_at: new Date()
          };

          await db.insert(sedaRegistration).values({ bubble_id: seda._id, ...vals })
            .onConflictDoUpdate({ target: sedaRegistration.bubble_id, set: vals });

          results.syncedSedas++;
          logSyncActivity(`Synced SEDA ${seda._id}: ${seda["Reg Status"] || 'No status'}`, 'INFO');
        } else {
          results.skippedSedas++;
        }

      } catch (err) {
        results.errors.push(`SEDA ${seda._id}: ${err}`);
        logSyncActivity(`Error syncing SEDA ${seda._id}: ${err}`, 'ERROR');
      }
    }

    logSyncActivity(`SEDA Sync Complete: ${results.syncedSedas} synced, ${results.skippedSedas} skipped`, 'INFO');

    if (results.errors.length > 0) {
      logSyncActivity(`Errors encountered: ${results.errors.length}`, 'ERROR');
      results.errors.slice(0, 5).forEach(e => logSyncActivity(e, 'ERROR'));
    }

    return { success: true, results };
  } catch (error) {
    logSyncActivity(`SEDA Sync Error: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}

/**
 * Optimized Fast ID-List Sync with Modified Dates
 *
 * Parses CSV format with type, id, modified_date columns.
 * Checks PostgreSQL first - only fetches from Bubble if newer.
 * This dramatically reduces API calls when most records are already up-to-date.
 *
 * CSV Format:
 * type,id,modified_date
 * invoice,1647839483923x8394832,2026-01-19T10:30:00Z
 * seda,1647839483926x8394835,2026-01-19T09:15:00Z
 *
 * @param csvData - CSV string with type, id, modified_date columns
 */
export async function syncByIdList(csvData: string) {
  logSyncActivity(`Optimized Fast ID-List Sync starting...`, 'INFO');

  const results = {
    syncedInvoices: 0,
    syncedSedas: 0,
    skippedInvoices: 0,
    skippedSedas: 0,
    syncedCustomers: 0,
    syncedAgents: 0,
    syncedUsers: 0,
    syncedPayments: 0,
    syncedItems: 0,
    errors: [] as string[]
  };

  try {
    // ============================================================================
    // STEP 1: Parse CSV and Check Local Data
    // ============================================================================
    logSyncActivity(`Step 1: Parsing CSV and checking local data...`, 'INFO');

    const lines = csvData.trim().split('\n');
    const headerLine = lines[0].toLowerCase();

    // Check if CSV has headers
    const hasHeader = headerLine.includes('type') || headerLine.includes('id') || headerLine.includes('modified');
    const startIndex = hasHeader ? 1 : 0;

    interface RecordToSync {
      type: 'invoice' | 'seda';
      id: string;
      modifiedDate: Date;
    }

    const recordsToSync: RecordToSync[] = [];
    const invoiceIdsToFetch: string[] = [];
    const sedaIdsToFetch: string[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line (handle comma or tab separator)
      const parts = line.split(/[,\\t]+/);
      if (parts.length < 2) continue;

      const type = parts[0].trim().toLowerCase();
      const id = parts[1].trim();
      const modifiedDateStr = parts[2]?.trim() || '';

      if (type !== 'invoice' && type !== 'seda') continue;
      if (!id) continue;

      const modifiedDate = new Date(modifiedDateStr);
      if (isNaN(modifiedDate.getTime())) {
        logSyncActivity(`Invalid date for ${type} ${id}, skipping`, 'INFO');
        continue;
      }

      recordsToSync.push({ type: type as 'invoice' | 'seda', id, modifiedDate });
    }

    logSyncActivity(`Parsed ${recordsToSync.length} records from CSV`, 'INFO');

    // Check local data and decide which records to fetch
    for (const record of recordsToSync) {
      if (record.type === 'invoice') {
        const existing = await db.query.invoices.findFirst({
          where: eq(invoices.bubble_id, record.id)
        });

        // Fetch if: doesn't exist OR Bubble is newer
        // Note: invoices table doesn't have last_synced_at, use updated_at instead
        const shouldFetch = !existing ||
          !existing.updated_at ||
          record.modifiedDate > new Date(existing.updated_at);

        if (shouldFetch) {
          invoiceIdsToFetch.push(record.id);
        } else {
          results.skippedInvoices++;
        }
      } else if (record.type === 'seda') {
        const existing = await db.query.sedaRegistration.findFirst({
          where: eq(sedaRegistration.bubble_id, record.id)
        });

        const shouldFetch = !existing ||
          !existing.last_synced_at ||
          record.modifiedDate > new Date(existing.last_synced_at);

        if (shouldFetch) {
          sedaIdsToFetch.push(record.id);
        } else {
          results.skippedSedas++;
        }
      }
    }

    logSyncActivity(`After checking local data:`, 'INFO');
    logSyncActivity(`  Invoices: ${invoiceIdsToFetch.length} to fetch, ${results.skippedInvoices} skipped`, 'INFO');
    logSyncActivity(`  SEDAs: ${sedaIdsToFetch.length} to fetch, ${results.skippedSedas} skipped`, 'INFO');

    if (invoiceIdsToFetch.length === 0 && sedaIdsToFetch.length === 0) {
      logSyncActivity(`All records up-to-date! Nothing to sync.`, 'INFO');
      return { success: true, results };
    }

    // Track unique related IDs we need to fetch
    const customerIds = new Set<string>();
    const agentIds = new Set<string>();
    const paymentIds = new Set<string>();

    // ============================================================================
    // STEP 2: Fetch and Sync Invoices by ID (only newer ones)
    // ============================================================================
    if (invoiceIdsToFetch.length > 0) {
      logSyncActivity(`Step 2: Fetching ${invoiceIdsToFetch.length} newer invoices from Bubble...`, 'INFO');

      // Fetch invoices in batches
      const batchSize = 100;
      for (let i = 0; i < invoiceIdsToFetch.length; i += batchSize) {
        const batch = invoiceIdsToFetch.slice(i, i + batchSize);
        logSyncActivity(`Fetching invoice batch ${Math.floor(i / batchSize) + 1}...`, 'INFO');

        try {
          const batchInvoices = await Promise.all(
            batch.map(id => fetchBubbleRecordByTypeName('invoice', id))
          );

          for (const inv of batchInvoices) {
            try {
              // Collect related IDs
              if (inv["Linked Customer"]) customerIds.add(inv["Linked Customer"]);
              if (inv["Linked Agent"]) agentIds.add(inv["Linked Agent"]);
              if (inv["Linked Payment"]) {
                (inv["Linked Payment"] as string[]).forEach(p => paymentIds.add(p));
              }

              // Upsert invoice
              const bubbleModifiedDate = new Date(inv["Modified Date"]);
              const vals = {
                invoice_id: inv["Invoice ID"] || inv.invoice_id || null,
                invoice_number: inv["Invoice Number"] || inv.invoice_number || null,
                linked_customer: inv["Linked Customer"] || null,
                linked_agent: inv["Linked Agent"] || null,
                linked_payment: inv["Linked Payment"] || null,
                linked_seda_registration: inv["Linked SEDA Registration"] || null,
                amount: inv.Amount ? inv.Amount.toString() : null,
                total_amount: inv["Total Amount"] || null,
                status: inv.Status || 'draft',
                invoice_date: inv["Invoice Date"] ? new Date(inv["Invoice Date"]) : null,
                created_at: inv["Created Date"] ? new Date(inv["Created Date"]) : new Date(),
                created_by: inv["Created By"] || null,
                updated_at: bubbleModifiedDate,
                last_synced_at: new Date()
              };

              await db.insert(invoices).values({ bubble_id: inv._id, ...vals })
                .onConflictDoUpdate({ target: invoices.bubble_id, set: vals });
              results.syncedInvoices++;

            } catch (err) {
              results.errors.push(`Invoice ${inv._id}: ${err}`);
            }
          }
        } catch (err) {
          logSyncActivity(`Error in invoice batch ${Math.floor(i / batchSize) + 1}: ${err}`, 'ERROR');
        }
      }

      // Sync invoice items for synced invoices
      logSyncActivity(`Syncing invoice items...`, 'INFO');
      for (const invId of invoiceIdsToFetch) {
        try {
          const itemConstraints = [{
            key: 'Invoice',
            constraint: 'equals',
            value: invId
          }];
          const items = await fetchBubbleRecordsWithConstraints('invoice_new_item', itemConstraints);

          for (const item of items) {
            const vals = {
              invoice_id: item.Invoice,
              description: item.Description,
              qty: item.Qty,
              unit_price: item["Unit Price"],
              total_price: item["Total Price"],
              item_type: item["Item Type"],
              sort_order: item["Sort Order"],
              created_at: new Date(item["Created Date"])
            };
            await db.insert(invoice_new_items).values({ bubble_id: item._id, ...vals })
              .onConflictDoUpdate({ target: invoice_new_items.bubble_id, set: vals });
            results.syncedItems++;
          }
        } catch (err) {
          results.errors.push(`Items for invoice ${invId}: ${err}`);
        }
      }
    }

    // ============================================================================
    // STEP 3: Fetch and Sync SEDAs by ID (only newer ones)
    // ============================================================================
    if (sedaIdsToFetch.length > 0) {
      logSyncActivity(`Step 3: Fetching ${sedaIdsToFetch.length} newer SEDAs from Bubble...`, 'INFO');

      // Fetch SEDAs in batches
      const batchSize = 100;
      for (let i = 0; i < sedaIdsToFetch.length; i += batchSize) {
        const batch = sedaIdsToFetch.slice(i, i + batchSize);
        logSyncActivity(`Fetching SEDA batch ${Math.floor(i / batchSize) + 1}...`, 'INFO');

        try {
          const batchSedas = await Promise.all(
            batch.map(id => fetchBubbleRecordByTypeName('seda_registration', id))
          );

          for (const seda of batchSedas) {
            try {
              // Collect customer from SEDA
              if (seda["Linked Customer"]) customerIds.add(seda["Linked Customer"]);

              const bubbleModifiedDate = new Date(seda["Modified Date"]);
              const vals = {
                reg_status: seda["Reg Status"],
                state: seda.State,
                city: seda.City,
                agent: seda.Agent,
                project_price: seda["Project Price"],
                linked_customer: seda["Linked Customer"],
                customer_signature: seda["Customer Signature"],
                ic_copy_front: seda["IC Copy Front"],
                ic_copy_back: seda["IC Copy Back"],
                tnb_bill_1: seda["TNB Bill 1"],
                tnb_bill_2: seda["TNB Bill 2"],
                tnb_bill_3: seda["TNB Bill 3"],
                nem_cert: seda["NEM Cert"],
                mykad_pdf: seda["Mykad PDF"],
                property_ownership_prove: seda["Property Ownership Prove"],
                check_tnb_bill_and_meter_image: seda["Check TNB Bill and Meter Image"],
                roof_images: seda["Roof Images"],
                site_images: seda["Site Images"],
                drawing_pdf_system: seda["Drawing PDF System"],
                drawing_system_actual: seda["Drawing System Actual"],
                drawing_engineering_seda_pdf: seda["Drawing Engineering Seda PDF"],
                modified_date: bubbleModifiedDate,
                updated_at: bubbleModifiedDate,
                last_synced_at: new Date()
              };

              await db.insert(sedaRegistration).values({ bubble_id: seda._id, ...vals })
                .onConflictDoUpdate({ target: sedaRegistration.bubble_id, set: vals });
              results.syncedSedas++;

            } catch (err) {
              results.errors.push(`SEDA ${seda._id}: ${err}`);
            }
          }
        } catch (err) {
          logSyncActivity(`Error in SEDA batch ${Math.floor(i / batchSize) + 1}: ${err}`, 'ERROR');
        }
      }
    }

    // ============================================================================
    // STEP 4: Sync Related Data (customers, agents, payments)
    // ============================================================================
    logSyncActivity(`Step 4: Syncing related data...`, 'INFO');

    // Customers
    for (const customerId of customerIds) {
      try {
        const customer = await fetchBubbleRecordByTypeName('Customer_Profile', customerId);
        const vals = {
          name: customer.Name || customer.name || "",
          email: customer.Email || customer.email || null,
          phone: customer.Contact || customer.Whatsapp || customer.phone || null,
          address: customer.Address || customer.address || null,
          city: customer.City || customer.city || null,
          state: customer.State || customer.state || null,
          postcode: customer.Postcode || customer.postcode || null,
          ic_number: customer["IC Number"] || customer.ic_number || null,
          updated_at: new Date(customer["Modified Date"]),
          last_synced_at: new Date()
        };
        await db.insert(customers).values({ customer_id: customerId, ...vals })
          .onConflictDoUpdate({ target: customers.customer_id, set: vals });
        results.syncedCustomers++;
      } catch (err) {
        results.errors.push(`Customer ${customerId}: ${err}`);
      }
    }

    // Agents
    for (const agentId of agentIds) {
      try {
        const agent = await fetchBubbleRecordByTypeName('agent', agentId);
        const vals = {
          name: agent.Name,
          email: agent.email,
          contact: agent.Contact,
          agent_type: agent["Agent Type"],
          address: agent.Address,
          bankin_account: agent.bankin_account,
          banker: agent.banker,
          updated_at: new Date(agent["Modified Date"]),
          last_synced_at: new Date()
        };
        await db.insert(agents).values({ bubble_id: agentId, ...vals })
          .onConflictDoUpdate({ target: agents.bubble_id, set: vals });
        results.syncedAgents++;
      } catch (err) {
        results.errors.push(`Agent ${agentId}: ${err}`);
      }
    }

    // Users linked to agents
    for (const agentId of agentIds) {
      try {
        const userConstraints = [{
          key: 'Linked Agent Profile',
          constraint: 'equals',
          value: agentId
        }];
        const bubbleUsers = await fetchBubbleRecordsWithConstraints('user', userConstraints);

        if (!bubbleUsers || bubbleUsers.length === 0) continue;

        for (const user of bubbleUsers) {
          const vals = {
            email: user.authentication?.email?.email,
            linked_agent_profile: user["Linked Agent Profile"],
            agent_code: user.agent_code,
            dealership: user.Dealership,
            profile_picture: user["Profile Picture"],
            user_signed_up: user.user_signed_up,
            access_level: user["Access Level"] || [],
            updated_at: new Date(user["Modified Date"]),
            last_synced_at: new Date()
          };
          await db.insert(users).values({ bubble_id: user._id, ...vals })
            .onConflictDoUpdate({ target: users.bubble_id, set: vals });
          results.syncedUsers++;
        }
      } catch (err) {
        if (!String(err).includes('Not Found')) {
          results.errors.push(`User for agent ${agentId}: ${err}`);
        }
      }
    }

    // Payments
    for (const paymentId of paymentIds) {
      try {
        const payment = await fetchBubbleRecordByTypeName('payment', paymentId);
        const vals = {
          amount: payment.Amount?.toString(),
          payment_date: payment["Payment Date"] ? new Date(payment["Payment Date"]) : null,
          payment_method: payment["Payment Method"],
          remark: payment.Remark,
          linked_agent: payment["Linked Agent"],
          linked_customer: payment["Linked Customer"],
          linked_invoice: payment["Linked Invoice"],
          created_by: payment["Created By"],
          created_date: payment["Created Date"] ? new Date(payment["Created Date"]) : null,
          modified_date: new Date(payment["Modified Date"]),
          last_synced_at: new Date()
        };
        await db.insert(payments).values({ bubble_id: paymentId, ...vals })
          .onConflictDoUpdate({ target: payments.bubble_id, set: vals });
        results.syncedPayments++;
      } catch (err) {
        // Try submitted_payments
        try {
          const submittedPayment = await fetchBubbleRecordByTypeName('submit_payment', paymentId);
          const vals = {
            amount: submittedPayment.Amount?.toString(),
            payment_date: submittedPayment["Payment Date"] ? new Date(submittedPayment["Payment Date"]) : null,
            payment_method: submittedPayment["Payment Method"],
            remark: submittedPayment.Remark,
            linked_agent: submittedPayment["Linked Agent"],
            linked_customer: submittedPayment["Linked Customer"],
            linked_invoice: submittedPayment["Linked Invoice"],
            created_by: submittedPayment["Created By"],
            created_date: submittedPayment["Created Date"] ? new Date(submittedPayment["Created Date"]) : null,
            modified_date: new Date(submittedPayment["Modified Date"]),
            status: submittedPayment.Status || 'pending',
            last_synced_at: new Date()
          };
          await db.insert(submitted_payments).values({ bubble_id: paymentId, ...vals })
            .onConflictDoUpdate({ target: submitted_payments.bubble_id, set: vals });
          results.syncedPayments++;
        } catch (err2) {
          results.errors.push(`Payment ${paymentId}: ${err}`);
        }
      }
    }

    logSyncActivity(`Optimized Fast Sync Complete!`, 'INFO');
    logSyncActivity(`Invoices: ${results.syncedInvoices} synced, ${results.skippedInvoices} skipped`, 'INFO');
    logSyncActivity(`SEDAs: ${results.syncedSedas} synced, ${results.skippedSedas} skipped`, 'INFO');
    logSyncActivity(`Related: ${results.syncedCustomers} customers, ${results.syncedAgents} agents, ${results.syncedPayments} payments, ${results.syncedItems} items`, 'INFO');

    if (results.errors.length > 0) {
      logSyncActivity(`Errors encountered: ${results.errors.length}`, 'ERROR');
      results.errors.slice(0, 5).forEach(e => logSyncActivity(e, 'ERROR'));
    }

    return { success: true, results };
  } catch (error) {
    logSyncActivity(`Optimized Fast Sync Error: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
