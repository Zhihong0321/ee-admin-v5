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
 * Fetch records from Bubble API with constraints (for date filtering)
 */
async function fetchBubbleRecordsWithConstraints(typeName: string, constraints: any[] = []): Promise<any[]> {
  const allRecords: any[] = [];
  let cursor = 0;

  // Build constraints query param
  const constraintsParam = encodeURIComponent(JSON.stringify(constraints));
  console.log(`[Bubble API] Fetching ${typeName} with constraints:`, JSON.stringify(constraints));

  while (true) {
    try {
      const url = `${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}&constraints=${constraintsParam}`;
      console.log(`[Bubble API] URL: ${url}`);
      const res = await fetch(url, { headers });

      if (!res.ok) {
        console.error(`[Bubble API] Failed response:`, res.status, res.statusText);
        throw new Error(`Failed to fetch ${typeName} with constraints: ${res.statusText}`);
      }

      const data = await res.json();
      console.log(`[Bubble API] Response structure:`, JSON.stringify(data).substring(0, 500));

      const records = data.response.results || [];
      const remaining = data.response.remaining || 0;

      console.log(`[Bubble API] Batch: ${records.length} records, ${remaining} remaining`);

      allRecords.push(...records);

      if (remaining === 0 || records.length === 0) {
        break;
      }

      cursor += records.length;
    } catch (err) {
      console.error(`Error fetching ${typeName} batch:`, err);
      break;
    }
  }

  console.log(`[Bubble API] Total records fetched: ${allRecords.length}`);
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

    // First, test API without constraints to verify it works
    logSyncActivity(`Testing Bubble API connection without constraints...`, 'INFO');
    const testFetch = await fetch(`${BUBBLE_BASE_URL}/invoice?limit=1`, { headers });
    if (testFetch.ok) {
      const testData = await testFetch.json();
      logSyncActivity(`API Test: Found ${testData.response?.results?.length || 0} records (no constraints)`, 'INFO');
      if (testData.response?.results?.length > 0) {
        logSyncActivity(`Sample invoice: ${JSON.stringify(testData.response.results[0]).substring(0, 200)}`, 'INFO');
      }
    } else {
      logSyncActivity(`API Test FAILED: ${testFetch.status} ${testFetch.statusText}`, 'ERROR');
    }

    // Build Bubble constraints for date range filtering
    // Use 'Modified Date' to catch both new AND recently modified invoices
    const fromDate = new Date(dateFrom);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    // Filter by Modified Date to catch recently updated records
    const constraints = [
      {
        key: 'Modified Date',
        constraint: 'greater than or equal to',
        value: fromDate.toISOString()
      },
      {
        key: 'Modified Date',
        constraint: 'less than or equal to',
        value: toDate.toISOString()
      }
    ];

    const bubbleInvoices = await fetchBubbleRecordsWithConstraints('invoice', constraints);

    logSyncActivity(`Found ${bubbleInvoices.length} invoices in date range`, 'INFO');

    // FALLBACK: If constraints returned 0, try fetching all and filter locally
    if (bubbleInvoices.length === 0) {
      logSyncActivity(`Constraints returned 0 results. Trying fallback: fetch all and filter locally...`, 'INFO');

      const allInvoices = await fetchBubbleRecordsWithConstraints('invoice', []);
      logSyncActivity(`Fetched ${allInvoices.length} total invoices from Bubble`, 'INFO');

      const filtered = allInvoices.filter(inv => {
        const modifiedDate = new Date(inv["Modified Date"]);
        return modifiedDate >= fromDate && modifiedDate <= toDate;
      });

      logSyncActivity(`After local filtering: ${filtered.length} invoices match date range`, 'INFO');
      bubbleInvoices.push(...filtered);
    }

    if (bubbleInvoices.length === 0) {
      logSyncActivity(`No invoices found in the specified date range`, 'INFO');
      return { success: true, results };
    }

    // Track all unique IDs we need to fetch
    const customerIds = new Set<string>();
    const agentIds = new Set<string>();
    const paymentIds = new Set<string>();
    const submittedPaymentIds = new Set<string>();
    const sedaIds = new Set<string>();
    const userIds = new Set<string>();

    // Step 2: Collect all related IDs from invoices
    logSyncActivity(`Step 2: Collecting related IDs from invoices...`, 'INFO');

    for (const inv of bubbleInvoices) {
      if (inv["Linked Customer"]) customerIds.add(inv["Linked Customer"]);
      if (inv["Linked Agent"]) agentIds.add(inv["Linked Agent"]);
      if (inv["Linked Payment"]) {
        (inv["Linked Payment"] as string[]).forEach(p => paymentIds.add(p));
      }
      if (inv["Linked SEDA Registration"]) sedaIds.add(inv["Linked SEDA Registration"]);
    }

    logSyncActivity(`Collected: ${customerIds.size} customers, ${agentIds.size} agents, ${paymentIds.size} payments, ${sedaIds.size} SEDA`, 'INFO');

    // Step 3: Fetch and sync all related data
    logSyncActivity(`Step 3: Fetching and syncing related data...`, 'INFO');

    // 3a. Fetch and sync Customers
    for (const customerId of customerIds) {
      try {
        const customer = await fetchBubbleRecordByTypeName('Customer_Profile', customerId);

        // Check if record exists and compare timestamps
        const existingRecord = await db.query.customers.findFirst({
          where: eq(customers.customer_id, customerId)
        });

        const bubbleModifiedDate = new Date(customer["Modified Date"]);
        const shouldUpdate = !existingRecord ||
          !existingRecord.last_synced_at ||
          bubbleModifiedDate > new Date(existingRecord.last_synced_at);

        const vals = {
          name: customer.Name || customer.name || "",
          email: customer.Email || customer.email || null,
          phone: customer.Contact || customer.Whatsapp || customer.phone || null,
          address: customer.Address || customer.address || null,
          city: customer.City || customer.city || null,
          state: customer.State || customer.state || null,
          postcode: customer.Postcode || customer.postcode || null,
          ic_number: customer["IC Number"] || customer.ic_number || customer["IC No"] || null,
          updated_at: bubbleModifiedDate,
          last_synced_at: new Date()
        };

        if (shouldUpdate) {
          await db.insert(customers).values({ customer_id: customerId, ...vals })
            .onConflictDoUpdate({ target: customers.customer_id, set: vals });
        }
        results.syncedCustomers++;
      } catch (err) {
        results.errors.push(`Customer ${customerId}: ${err}`);
      }
    }

    // 3b. Fetch and sync Agents
    for (const agentId of agentIds) {
      try {
        const agent = await fetchBubbleRecordByTypeName('agent', agentId);

        // Check if record exists and compare timestamps
        const existingRecord = await db.query.agents.findFirst({
          where: eq(agents.bubble_id, agentId)
        });

        const bubbleModifiedDate = new Date(agent["Modified Date"]);
        const shouldUpdate = !existingRecord ||
          !existingRecord.last_synced_at ||
          bubbleModifiedDate > new Date(existingRecord.last_synced_at);

        const vals = {
          name: agent.Name,
          email: agent.email,
          contact: agent.Contact,
          agent_type: agent["Agent Type"],
          address: agent.Address,
          bankin_account: agent.bankin_account,
          banker: agent.banker,
          updated_at: bubbleModifiedDate,
          last_synced_at: new Date()
        };

        if (shouldUpdate) {
          await db.insert(agents).values({ bubble_id: agentId, ...vals })
            .onConflictDoUpdate({ target: agents.bubble_id, set: vals });
        }
        results.syncedAgents++;
      } catch (err) {
        results.errors.push(`Agent ${agentId}: ${err}`);
      }
    }

    // 3c. Fetch and sync Users (linked to agents)
    for (const agentId of agentIds) {
      try {
        // Find user by querying for users with this agent profile
        const userConstraints = [{
          key: 'Linked Agent Profile',
          constraint: 'equals',
          value: agentId
        }];
        const bubbleUsers = await fetchBubbleRecordsWithConstraints('user', userConstraints);

        for (const user of bubbleUsers) {
          // Check if record exists and compare timestamps
          const existingRecord = await db.query.users.findFirst({
            where: eq(users.bubble_id, user._id)
          });

          const bubbleModifiedDate = new Date(user["Modified Date"]);
          const shouldUpdate = !existingRecord ||
            !existingRecord.last_synced_at ||
            bubbleModifiedDate > new Date(existingRecord.last_synced_at);

          const vals = {
            email: user.authentication?.email?.email,
            linked_agent_profile: user["Linked Agent Profile"],
            agent_code: user.agent_code,
            dealership: user.Dealership,
            profile_picture: user["Profile Picture"],
            user_signed_up: user.user_signed_up,
            access_level: user["Access Level"] || [],
            updated_at: bubbleModifiedDate,
            last_synced_at: new Date()
          };

          if (shouldUpdate) {
            await db.insert(users).values({ bubble_id: user._id, ...vals })
              .onConflictDoUpdate({ target: users.bubble_id, set: vals });
          }
          results.syncedUsers++;
          userIds.add(user._id);
        }
      } catch (err) {
        results.errors.push(`User for agent ${agentId}: ${err}`);
      }
    }

    // 3d. Fetch and sync Payments
    for (const paymentId of paymentIds) {
      try {
        const payment = await fetchBubbleRecordByTypeName('payment', paymentId);

        // Check if record exists and compare timestamps
        const existingRecord = await db.query.payments.findFirst({
          where: eq(payments.bubble_id, paymentId)
        });

        const bubbleModifiedDate = new Date(payment["Modified Date"]);
        const shouldUpdate = !existingRecord ||
          !existingRecord.last_synced_at ||
          bubbleModifiedDate > new Date(existingRecord.last_synced_at);

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
          modified_date: bubbleModifiedDate,
          last_synced_at: new Date()
        };

        if (shouldUpdate) {
          await db.insert(payments).values({ bubble_id: paymentId, ...vals })
            .onConflictDoUpdate({ target: payments.bubble_id, set: vals });
        }
        results.syncedPayments++;
      } catch (err) {
        // Payment might be in submit_payment table instead
        try {
          const submittedPayment = await fetchBubbleRecordByTypeName('submit_payment', paymentId);

          // Check if record exists and compare timestamps
          const existingRecord = await db.query.submitted_payments.findFirst({
            where: eq(submitted_payments.bubble_id, paymentId)
          });

          const bubbleModifiedDate = new Date(submittedPayment["Modified Date"]);
          const shouldUpdate = !existingRecord ||
            !existingRecord.last_synced_at ||
            bubbleModifiedDate > new Date(existingRecord.last_synced_at);

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
            modified_date: bubbleModifiedDate,
            status: submittedPayment.Status || 'pending',
            last_synced_at: new Date()
          };

          if (shouldUpdate) {
            await db.insert(submitted_payments).values({ bubble_id: paymentId, ...vals })
              .onConflictDoUpdate({ target: submitted_payments.bubble_id, set: vals });
          }
          results.syncedSubmittedPayments++;
        } catch (err2) {
          results.errors.push(`Payment ${paymentId} (tried both tables): ${err2}`);
        }
      }
    }

    // 3e. Fetch and sync SEDA registrations
    for (const sedaId of sedaIds) {
      try {
        const seda = await fetchBubbleRecordByTypeName('seda_registration', sedaId);

        // Check if record exists and compare timestamps
        const existingRecord = await db.query.sedaRegistration.findFirst({
          where: eq(sedaRegistration.bubble_id, sedaId)
        });

        const bubbleModifiedDate = new Date(seda["Modified Date"]);
        const shouldUpdate = !existingRecord ||
          !existingRecord.last_synced_at ||
          bubbleModifiedDate > new Date(existingRecord.last_synced_at);

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
          updated_at: bubbleModifiedDate,
          last_synced_at: new Date()
        };

        if (shouldUpdate) {
          await db.insert(sedaRegistration).values({ bubble_id: sedaId, ...vals })
            .onConflictDoUpdate({ target: sedaRegistration.bubble_id, set: vals });
        }
        results.syncedSedas++;
      } catch (err) {
        results.errors.push(`SEDA ${sedaId}: ${err}`);
      }
    }

    // Step 4: Sync the invoices themselves
    logSyncActivity(`Step 4: Syncing invoices...`, 'INFO');

    for (const inv of bubbleInvoices) {
      try {
        // Check if record exists and compare timestamps
        const existingRecord = await db.query.invoices.findFirst({
          where: eq(invoices.bubble_id, inv._id)
        });

        const bubbleModifiedDate = new Date(inv["Modified Date"]);
        // For invoices, compare with updated_at since we don't have last_synced_at
        const shouldUpdate = !existingRecord ||
          !existingRecord.updated_at ||
          bubbleModifiedDate > new Date(existingRecord.updated_at);

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

        if (shouldUpdate) {
          await db.insert(invoices).values({ bubble_id: inv._id, ...vals })
            .onConflictDoUpdate({ target: invoices.bubble_id, set: vals });
        }
        results.syncedInvoices++;
      } catch (err) {
        results.errors.push(`Invoice ${inv._id}: ${err}`);
      }
    }

    // Step 5: Sync invoice items for each invoice
    logSyncActivity(`Step 5: Syncing invoice items...`, 'INFO');

    for (const inv of bubbleInvoices) {
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