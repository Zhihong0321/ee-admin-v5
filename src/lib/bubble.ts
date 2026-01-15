import { db } from "@/lib/db";
import { users, agents, payments, submitted_payments, customers, invoices, invoice_new_items, sedaRegistration } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { syncFilesByCategory } from "@/app/manage-company/storage-actions";
import { logSyncActivity } from "./logger";

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

/**
 * Complete Data & File Sync Engine with Pagination and Upsert logic
 */
export async function syncCompleteInvoicePackage(dateFrom?: string, dateTo?: string, triggerFileSync = false) {
  logSyncActivity(`Sync Engine: Starting sync (DateFrom: ${dateFrom || 'ALL'}, FileSync: ${triggerFileSync})`, 'INFO');
  
  const results = {
    syncedCustomers: 0, syncedInvoices: 0, syncedItems: 0,
    syncedPayments: 0, syncedSubmittedPayments: 0, syncedSedas: 0, syncedUsers: 0, syncedAgents: 0,
    syncedTemplates: 0,
    errors: [] as string[]
  };

  // Helper to build date constraints for Bubble API
  const getConstraints = (from?: string) => {
    if (!from) return '';
    const constraint = [{ key: "Modified Date", constraint_type: "greater than", value: new Date(from).toISOString() }];
    return `&constraints=${JSON.stringify(constraint)}`;
  };

  const dateConstraints = getConstraints(dateFrom);

  const syncTable = async (typeName: string, table: any, conflictCol: any, mapFn: (b: any) => any) => {
    let cursor = 0;
    let remaining = 1;
    logSyncActivity(`Sync Engine: Syncing ${typeName}...`, 'INFO');

    while (remaining > 0) {
      try {
        const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}${dateConstraints}`, { headers });
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
        
        if (typeName === 'invoice') results.syncedInvoices += records.length;
        if (typeName === 'agent') results.syncedAgents += records.length;
        if (typeName === 'user') results.syncedUsers += records.length;
        if (typeName === 'Customer_Profile') results.syncedCustomers += records.length;
        if (typeName === 'seda_registration') results.syncedSedas += records.length;
        if (typeName === 'payment') results.syncedPayments += records.length;
        if (typeName === 'submit_payment') results.syncedSubmittedPayments += records.length;
        if (typeName === 'invoice_new_item') results.syncedItems += records.length;
        if (typeName === 'invoice_template') results.syncedTemplates += records.length;

      } catch (err) {
        logSyncActivity(`Sync Engine: ${typeName} batch error: ${String(err)}`, 'ERROR');
        break;
      }
    }
  };

  try {
    // 1. Sync Agents
    await syncTable('agent', agents, agents.bubble_id, (b) => ({
      name: b.Name, email: b.email, contact: b.Contact, agent_type: b["Agent Type"],
      address: b.Address, bankin_account: b.bankin_account, banker: b.banker,
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }));

    // 2. Sync Users
    await syncTable('user', users, users.bubble_id, (b) => ({
      email: b.authentication?.email?.email, linked_agent_profile: b["Linked Agent Profile"],
      agent_code: b.agent_code, dealership: b.Dealership, profile_picture: b["Profile Picture"],
      user_signed_up: b.user_signed_up, access_level: b["Access Level"] || [],
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }));

    // 3. Sync Customers
    await syncTable('Customer_Profile', customers, customers.customer_id, (b) => ({
      name: b.Name || b.name || "", email: b.Email || b.email || null,
      phone: b.Contact || b.Whatsapp || b.phone || null, address: b.Address || b.address || null,
      city: b.City || b.city || null, state: b.State || b.state || null,
      postcode: b.Postcode || b.postcode || null, ic_number: b["IC Number"] || b.ic_number || b["IC No"] || null,
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }));

    // 4. Sync Invoices
    await syncTable('invoice', invoices, invoices.bubble_id, (b) => ({
      invoice_id: b["Invoice ID"] || b.invoice_id || null,
      invoice_number: b["Invoice Number"] || b.invoice_number || null,
      linked_customer: b["Linked Customer"] || b.linked_customer || null,
      linked_agent: b["Linked Agent"] || b.linked_agent || null,
      linked_payment: b["Linked Payment"] || b.linked_payment || null,
      linked_seda_registration: b["Linked SEDA Registration"] || b.linked_seda_registration || null,
      amount: b.Amount ? b.Amount.toString() : null,
      total_amount: b["Total Amount"] || b.total_amount || b.Amount || null,
      status: b.Status || b.status || 'draft',
      updated_at: new Date(b["Modified Date"]),
    }));

    // 5. Sync Invoice Items
    await syncTable('invoice_new_item', invoice_new_items, invoice_new_items.bubble_id, (b) => ({
      invoice_id: b.Invoice, description: b.Description, qty: b.Qty,
      unit_price: b["Unit Price"], total_price: b["Total Price"],
      item_type: b["Item Type"], sort_order: b["Sort Order"],
      created_at: new Date(b["Created Date"])
    }));

    // 6. Sync SEDA
    await syncTable('seda_registration', sedaRegistration, sedaRegistration.bubble_id, (b) => ({
      reg_status: b["Reg Status"], state: b.State, city: b.City, agent: b.Agent,
      project_price: b["Project Price"], linked_customer: b["Linked Customer"],
      customer_signature: b["Customer Signature"], ic_copy_front: b["IC Copy Front"],
      ic_copy_back: b["IC Copy Back"], tnb_bill_1: b["TNB Bill 1"],
      tnb_bill_2: b["TNB Bill 2"], tnb_bill_3: b["TNB Bill 3"],
      updated_at: new Date(b["Modified Date"]), last_synced_at: new Date()
    }));

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
    }));

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
    }));

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
    }));

    if (triggerFileSync) {
      logSyncActivity('Sync Engine: Auto-triggering file sync categories...', 'INFO');
      const categories: any[] = ['signatures', 'ic_copies', 'bills', 'user_profiles', 'roof_site_images', 'payments'];
      for (const cat of categories) {
        const fileRes = await syncFilesByCategory(cat, 100);
        logSyncActivity(`Sync Engine: File category ${cat} finished. Success: ${fileRes.results?.success}, Fail: ${fileRes.results?.failed}`, 'INFO');
      }
    }

    logSyncActivity('Sync Engine: All tables finished.', 'INFO');
    return { success: true, results };
  } catch (error) {
    logSyncActivity(`Sync Engine Error: ${String(error)}`, 'ERROR');
    return { success: false, error: String(error) };
  }
}
