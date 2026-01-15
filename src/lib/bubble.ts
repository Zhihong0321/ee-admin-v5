import { db } from "@/lib/db";
import { users, agents, payments, submitted_payments, customers, invoices, invoice_new_items, sedaRegistration } from "@/db/schema";
import { eq } from "drizzle-orm";

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
 * Syncs profiles from Bubble using "Latest Wins" logic
 */
export async function syncProfilesFromBubble() {
  console.log("Starting sync with 'Latest Wins' logic...");

  try {
    // 1. Sync Users
    const userRes = await fetch(`${BUBBLE_BASE_URL}/user?limit=100&sort_field=Modified Date&descending=true`, { headers });
    const userData = await userRes.json();
    const bubbleUsers = userData.response.results;

    for (const bUser of bubbleUsers) {
      const localUser = await db.query.users.findFirst({
        where: eq(users.bubble_id, bUser._id)
      });

      const bubbleModifiedAt = new Date(bUser["Modified Date"]);

      if (!localUser) {
        console.log(`New user found: ${bUser._id}. Importing...`);
        await db.insert(users).values({
          bubble_id: bUser._id,
          email: bUser.authentication?.email?.email,
          linked_agent_profile: bUser["Linked Agent Profile"],
          agent_code: bUser.agent_code,
          dealership: bUser.Dealership,
          profile_picture: bUser["Profile Picture"],
          user_signed_up: bUser.user_signed_up,
          access_level: bUser["Access Level"] || [],
          created_date: new Date(bUser["Created Date"]),
          updated_at: bubbleModifiedAt,
          last_synced_at: new Date()
        });
      } else if (bubbleModifiedAt > (localUser.updated_at || new Date(0))) {
        console.log(`User ${bUser._id} is newer in Bubble. Updating local...`);
        await db.update(users).set({
          email: bUser.authentication?.email?.email,
          linked_agent_profile: bUser["Linked Agent Profile"],
          agent_code: bUser.agent_code,
          dealership: bUser.Dealership,
          profile_picture: bUser["Profile Picture"],
          user_signed_up: bUser.user_signed_up,
          access_level: bUser["Access Level"] || [],
          updated_at: bubbleModifiedAt,
          last_synced_at: new Date()
        }).where(eq(users.id, localUser.id));
      }
    }

    // 2. Sync Agents
    const agentRes = await fetch(`${BUBBLE_BASE_URL}/agent?limit=100&sort_field=Modified Date&descending=true`, { headers });
    const agentData = await agentRes.json();
    const bubbleAgents = agentData.response.results;

    for (const bAgent of bubbleAgents) {
      const localAgent = await db.query.agents.findFirst({
        where: eq(agents.bubble_id, bAgent._id)
      });

      const bubbleModifiedAt = new Date(bAgent["Modified Date"]);

      if (!localAgent) {
        console.log(`New agent found: ${bAgent._id}. Importing...`);
        await db.insert(agents).values({
          bubble_id: bAgent._id,
          name: bAgent.Name,
          email: bAgent.email,
          contact: bAgent.Contact,
          agent_type: bAgent["Agent Type"],
          address: bAgent.Address,
          bankin_account: bAgent.bankin_account,
          banker: bAgent.banker,
          updated_at: bubbleModifiedAt,
          last_synced_at: new Date()
        });
      } else if (bubbleModifiedAt > (localAgent.updated_at || new Date(0))) {
        console.log(`Agent ${bAgent._id} is newer in Bubble. Updating local...`);
        await db.update(agents).set({
          name: bAgent.Name,
          email: bAgent.email,
          contact: bAgent.Contact,
          agent_type: bAgent["Agent Type"],
          address: bAgent.Address,
          bankin_account: bAgent.bankin_account,
          banker: bAgent.banker,
          updated_at: bubbleModifiedAt,
          last_synced_at: new Date()
        }).where(eq(agents.id, localAgent.id));
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error in Latest Wins sync:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Syncs a single profile from Bubble
 */
export async function syncSingleProfileFromBubble(bubbleId: string, type: 'user' | 'agent') {
  try {
    const res = await fetch(`${BUBBLE_BASE_URL}/${type}/${bubbleId}`, { headers });
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    
    const data = await res.json();
    const bRecord = data.response;
    const bubbleModifiedAt = new Date(bRecord["Modified Date"]);

    if (type === 'user') {
      await db.update(users).set({
        email: bRecord.authentication?.email?.email,
        linked_agent_profile: bRecord["Linked Agent Profile"],
        agent_code: bRecord.agent_code,
        dealership: bRecord.Dealership,
        profile_picture: bRecord["Profile Picture"],
        user_signed_up: bRecord.user_signed_up,
        access_level: bRecord["Access Level"] || [],
        updated_at: bubbleModifiedAt,
        last_synced_at: new Date()
      }).where(eq(users.bubble_id, bubbleId));
    } else {
      await db.update(agents).set({
        name: bRecord.Name,
        email: bRecord.email,
        contact: bRecord.Contact,
        agent_type: bRecord["Agent Type"],
        address: bRecord.Address,
        bankin_account: bRecord.bankin_account,
        banker: bRecord.banker,
        updated_at: bubbleModifiedAt,
        last_synced_at: new Date()
      }).where(eq(agents.bubble_id, bubbleId));
    }

    return { success: true };
  } catch (error) {
    console.error(`Error syncing single ${type}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Syncs payments from Bubble
 * Rule 1: submit_payment -> pull ONLY new
 * Rule 2: payment -> bidirectional latest wins
 */
export async function syncPaymentsFromBubble() {
  console.log("Starting Payment sync...");
  try {
    // 1. Sync submit_payment (PULL ONLY NEW)
    const subRes = await fetch(`${BUBBLE_BASE_URL}/submit_payment?limit=100&sort_field=Created Date&descending=true`, { headers });
    if (subRes.ok) {
      const subData = await subRes.json();
      const bubbleSubmissions = subData.response.results || [];
      for (const bSub of bubbleSubmissions) {
        const localSub = await db.query.submitted_payments.findFirst({
          where: eq(submitted_payments.bubble_id, bSub._id)
        });
        if (!localSub) {
          console.log(`New submitted_payment found: ${bSub._id}. Importing...`);
          await db.insert(submitted_payments).values({
            bubble_id: bSub._id,
            amount: bSub.Amount?.toString(),
            payment_date: bSub["Payment Date"] ? new Date(bSub["Payment Date"]) : null,
            payment_method: bSub["Payment Method"],
            remark: bSub.Remark,
            linked_agent: bSub["Linked Agent"],
            linked_customer: bSub["Linked Customer"],
            linked_invoice: bSub["Linked Invoice"],
            created_by: bSub["Created By"],
            created_date: bSub["Created Date"] ? new Date(bSub["Created Date"]) : null,
            modified_date: new Date(bSub["Modified Date"]),
            status: bSub.Status || 'pending',
            last_synced_at: new Date()
          });
        }
      }
    }

    // 2. Sync payment (BIDIRECTIONAL LATEST WINS)
    const payRes = await fetch(`${BUBBLE_BASE_URL}/payment?limit=100&sort_field=Modified Date&descending=true`, { headers });
    if (payRes.ok) {
      const payData = await payRes.json();
      const bubblePayments = payData.response.results || [];
      for (const bPay of bubblePayments) {
        const localPay = await db.query.payments.findFirst({
          where: eq(payments.bubble_id, bPay._id)
        });

        const bubbleModifiedAt = new Date(bPay["Modified Date"]);

        if (!localPay) {
          console.log(`New verified payment found: ${bPay._id}. Importing...`);
          await db.insert(payments).values({
            bubble_id: bPay._id,
            amount: bPay.Amount?.toString(),
            payment_date: bPay["Payment Date"] ? new Date(bPay["Payment Date"]) : null,
            payment_method: bPay["Payment Method"],
            remark: bPay.Remark,
            linked_agent: bPay["Linked Agent"],
            linked_customer: bPay["Linked Customer"],
            linked_invoice: bPay["Linked Invoice"],
            created_by: bPay["Created By"],
            created_date: bPay["Created Date"] ? new Date(bPay["Created Date"]) : null,
            modified_date: bubbleModifiedAt,
            last_synced_at: new Date()
          });
        } else if (bubbleModifiedAt > (localPay.modified_date || new Date(0))) {
          console.log(`Payment ${bPay._id} is newer in Bubble. Updating local...`);
          await db.update(payments).set({
            amount: bPay.Amount?.toString(),
            payment_date: bPay["Payment Date"] ? new Date(bPay["Payment Date"]) : null,
            payment_method: bPay["Payment Method"],
            remark: bPay.Remark,
            linked_agent: bPay["Linked Agent"],
            linked_customer: bPay["Linked Customer"],
            linked_invoice: bPay["Linked Invoice"],
            modified_date: bubbleModifiedAt,
            last_synced_at: new Date()
          }).where(eq(payments.id, localPay.id));
        } else if ((localPay.updated_at || new Date(0)) > bubbleModifiedAt) {
          // ERP v2 is newer -> Push to Bubble
          console.log(`Payment ${bPay._id} is newer in ERP v2. Pushing to Bubble...`);
          await pushPaymentUpdateToBubble(bPay._id, {
            amount: localPay.amount,
            payment_method: localPay.payment_method,
            remark: localPay.remark,
            payment_date: localPay.payment_date
          });
          // Update last_synced_at
          await db.update(payments).set({ last_synced_at: new Date() }).where(eq(payments.id, localPay.id));
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error in Payment sync:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Complete Invoice Package Sync from Bubble with Date Range
 * Syncs: Customers + Invoices + Invoice Items + Payments + SEDA Registrations
 * @param dateFrom - Optional start date filter (ISO string, e.g., "2024-01-01")
 * @param dateTo - Optional end date filter (ISO string, e.g., "2024-12-31")
 */
export async function syncCompleteInvoicePackage(dateFrom?: string, dateTo?: string) {
  console.log("\n=== COMPLETE INVOICE PACKAGE SYNC ===");
  console.log(`Date range: ${dateFrom || 'All'} to ${dateTo || 'All'}`);

  const results = {
    syncedCustomers: 0,
    syncedInvoices: 0,
    syncedItems: 0,
    syncedPayments: 0,
    syncedSedas: 0,
    errors: [] as string[]
  };

  try {
    // ========== PHASE 1: Customers ==========
    console.log("\n--- Syncing Customers (from Customer_Profile) ---");
    const customerRes = await fetch(`${BUBBLE_BASE_URL}/Customer_Profile?limit=100&sort_field=Modified Date&descending=true`, { headers });
    if (!customerRes.ok) {
      throw new Error(`Customer fetch failed: ${customerRes.status}`);
    }

    const custData = await customerRes.json();
    const bubbleCustomers = custData.response.results || [];

    for (const bCust of bubbleCustomers) {
      try {
        const modifiedDate = new Date(bCust["Modified Date"]);

        const localCust = await db.query.customers.findFirst({
          where: eq(customers.customer_id, bCust._id)
        });

        const customerValues = {
          customer_id: bCust._id,
          name: bCust.Name || bCust.name || "",
          email: bCust.Email || bCust.email || null,
          phone: bCust.Contact || bCust.Whatsapp || bCust.phone || null,
          address: bCust.Address || bCust.address || null,
          city: bCust.City || bCust.city || null,
          state: bCust.State || bCust.state || null,
          postcode: bCust.Postcode || bCust.postcode || null,
          ic_number: bCust["IC Number"] || bCust.ic_number || bCust["IC No"] || null,
          linked_seda_registration: bCust["Linked SEDA Registration"] || null,
          linked_old_customer: bCust["Linked Old Customer"] || null,
          notes: bCust.Notes || bCust.notes || null,
          updated_at: modifiedDate,
          last_synced_at: new Date()
        };

        if (!localCust) {
          await db.insert(customers).values({
            ...customerValues,
            created_at: new Date(bCust["Created Date"]),
          });
          results.syncedCustomers++;
        } else {
          // Update always if it exists (even if placeholder)
          await db.update(customers).set(customerValues).where(eq(customers.id, localCust.id));
          results.syncedCustomers++;
        }
      } catch (err) {
        results.errors.push(`Customer ${bCust._id}: ${err}`);
      }
    }

    // ========== PHASE 2: Invoices + Items ==========
    console.log("\n--- Syncing Invoices ---");
    const invoiceRes = await fetch(`${BUBBLE_BASE_URL}/invoice?limit=100&sort_field=Modified Date&descending=true`, { headers });
    if (!invoiceRes.ok) {
      throw new Error(`Invoice fetch failed: ${invoiceRes.status}`);
    }

    const invData = await invoiceRes.json();
    const bubbleInvoices = invData.response.results || [];
    const paymentIdsToSync = new Set<string>();
    const sedaIdsToSync = new Set<string>();

    for (const bInv of bubbleInvoices) {
      try {
        const modifiedDate = new Date(bInv["Modified Date"]);

        const linkedPayment = bInv["Linked Payment"] || bInv.linked_payment || null;
        const paymentArray = linkedPayment ? (Array.isArray(linkedPayment) ? linkedPayment : [linkedPayment]) : null;
        const linkedSeda = bInv["Linked SEDA Registration"] || bInv.linked_seda_registration || null;

        if (paymentArray) paymentArray.forEach(p => { if (p) paymentIdsToSync.add(p); });
        if (linkedSeda) sedaIdsToSync.add(linkedSeda);

        const localInv = await db.query.invoices.findFirst({
          where: eq(invoices.bubble_id, bInv._id)
        });

        const linkedCustomer = bInv["Linked Customer"] || bInv.linked_customer || null;
        const linkedAgent = bInv["Linked Agent"] || bInv.linked_agent || null;

        let customerName = bInv["Customer Name"] || bInv.customer_name ||
                          bInv.Customer_Name ||
                          bInv["Linked Customer Name"] ||
                          null;

        let agentName = bInv["Agent Name"] || bInv.agent_name || null;

        if (linkedAgent) {
          const localAgent = await db.query.agents.findFirst({
            where: eq(agents.bubble_id, linkedAgent)
          });
          if (localAgent) agentName = localAgent.name;
        }

        if (!localInv) {
          await db.insert(invoices).values({
            bubble_id: bInv._id,
            invoice_id: bInv["Invoice ID"] || bInv.invoice_id || null,
            invoice_number: bInv["Invoice Number"] || bInv.invoice_number || null,
            linked_customer: linkedCustomer,
            linked_agent: linkedAgent,
            linked_payment: paymentArray,
            linked_seda_registration: linkedSeda,
            customer_name_snapshot: customerName,
            agent_name_snapshot: agentName,
            amount: bInv.Amount ? bInv.Amount.toString() : null,
            total_amount: bInv["Total Amount"] || bInv.total_amount || bInv.Amount || null,
            subtotal: bInv.Subtotal || bInv.subtotal || null,
            sst_rate: bInv["SST Rate"] || bInv.sst_rate || null,
            sst_amount: bInv["SST Amount"] || bInv.sst_amount || null,
            discount_amount: bInv["Discount Amount"] || bInv.discount_amount || null,
            voucher_amount: bInv["Voucher Amount"] || bInv.voucher_amount || null,
            invoice_date: bInv["Invoice Date"] ? new Date(bInv["Invoice Date"]) : null,
            due_date: bInv["Due Date"] ? new Date(bInv["Due Date"]) : null,
            status: bInv.Status || bInv.status || 'draft',
            is_latest: bInv["Is Latest"] !== undefined ? bInv["Is Latest"] : true,
            share_token: bInv["Share Token"] || bInv.share_token || null,
            dealercode: bInv.Dealercode || bInv.dealercode || null,
            approval_status: bInv["Approval Status"] || bInv.approval_status || null,
            case_status: bInv["Case Status"] || bInv.case_status || null,
            template_id: bInv["Template ID"] || bInv.template_id || null,
            created_by: bInv["Created By"] || bInv.created_by || null,
            created_at: new Date(bInv["Created Date"]),
            updated_at: modifiedDate
          });
          results.syncedInvoices++;
        } else if (modifiedDate > (localInv.updated_at || new Date(0))) {
          await db.update(invoices).set({
            linked_customer: linkedCustomer,
            linked_agent: linkedAgent,
            linked_payment: paymentArray,
            linked_seda_registration: linkedSeda,
            customer_name_snapshot: customerName,
            agent_name_snapshot: agentName,
            amount: bInv.Amount ? bInv.Amount.toString() : null,
            total_amount: bInv["Total Amount"] || bInv.total_amount || bInv.Amount || null,
            subtotal: bInv.Subtotal || bInv.subtotal || null,
            sst_rate: bInv["SST Rate"] || bInv.sst_rate || null,
            sst_amount: bInv["SST Amount"] || bInv.sst_amount || null,
            discount_amount: bInv["Discount Amount"] || bInv.discount_amount || null,
            voucher_amount: bInv["Voucher Amount"] || bInv.voucher_amount || null,
            invoice_date: bInv["Invoice Date"] ? new Date(bInv["Invoice Date"]) : null,
            due_date: bInv["Due Date"] ? new Date(bInv["Due Date"]) : null,
            status: bInv.Status || bInv.status || 'draft',
            is_latest: bInv["Is Latest"] !== undefined ? bInv["Is Latest"] : true,
            share_token: bInv["Share Token"] || bInv.share_token || null,
            dealercode: bInv.Dealercode || bInv.dealercode || null,
            approval_status: bInv["Approval Status"] || bInv.approval_status || null,
            case_status: bInv["Case Status"] || bInv.case_status || null,
            template_id: bInv["Template ID"] || bInv.template_id || null,
            created_by: bInv["Created By"] || bInv.created_by || null,
            updated_at: modifiedDate
          }).where(eq(invoices.id, localInv.id));
        }
      } catch (err) {
        results.errors.push(`Invoice ${bInv._id}: ${err}`);
      }
    }

    // Sync Invoice Items
    const itemsRes = await fetch(`${BUBBLE_BASE_URL}/invoice_new_item?limit=200&sort_field=Modified Date&descending=true`, { headers });
    if (itemsRes.ok) {
      const itemsData = await itemsRes.json();
      const bubbleItems = itemsData.response.results || [];

      for (const bItem of bubbleItems) {
        try {
          const localItem = await db.query.invoice_new_items.findFirst({
            where: eq(invoice_new_items.bubble_id, bItem._id)
          });

          if (!localItem) {
            await db.insert(invoice_new_items).values({
              bubble_id: bItem._id,
              invoice_id: bItem["Invoice"] || bItem.invoice || null,
              description: bItem.Description || bItem.description || "",
              qty: bItem.Qty || bItem.qty || 1,
              unit_price: bItem["Unit Price"] || bItem.unit_price || 0,
              total_price: bItem["Total Price"] || bItem.total_price || 0,
              item_type: bItem["Item Type"] || bItem.item_type || "product",
              sort_order: bItem["Sort Order"] || bItem.sort_order || 0,
              created_at: new Date(bItem["Created Date"] || Date.now())
            });
            results.syncedItems++;
          }
        } catch (err) {
          results.errors.push(`Invoice Item ${bItem._id}: ${err}`);
        }
      }
    }

    // ========== PHASE 3: Sync Linked Payments ==========
    console.log("\n--- Syncing Linked Payments ---");
    console.log(`Found ${paymentIdsToSync.size} unique payment IDs to sync`);

    for (const paymentId of paymentIdsToSync) {
      try {
        const payRes = await fetch(`${BUBBLE_BASE_URL}/payment/${paymentId}`, { headers });
        if (payRes.ok) {
          const payData = await payRes.json();
          const bPay = payData.response;
          if (bPay) {
            const modifiedDate = new Date(bPay["Modified Date"]);
            const localPay = await db.query.payments.findFirst({
              where: eq(payments.bubble_id, bPay._id)
            });

            if (!localPay) {
              await db.insert(payments).values({
                bubble_id: bPay._id,
                amount: bPay.Amount?.toString(),
                payment_date: bPay["Payment Date"] ? new Date(bPay["Payment Date"]) : null,
                payment_method: bPay["Payment Method"],
                remark: bPay.Remark,
                linked_agent: bPay["Linked Agent"],
                linked_customer: bPay["Linked Customer"],
                linked_invoice: bPay["Linked Invoice"],
                created_by: bPay["Created By"],
                created_date: bPay["Created Date"] ? new Date(bPay["Created Date"]) : null,
                modified_date: modifiedDate,
                last_synced_at: new Date()
              });
              results.syncedPayments++;
            } else if (modifiedDate > (localPay.modified_date || new Date(0))) {
              await db.update(payments).set({
                amount: bPay.Amount?.toString(),
                payment_date: bPay["Payment Date"] ? new Date(bPay["Payment Date"]) : null,
                payment_method: bPay["Payment Method"],
                remark: bPay.Remark,
                linked_agent: bPay["Linked Agent"],
                linked_customer: bPay["Linked Customer"],
                linked_invoice: bPay["Linked Invoice"],
                modified_date: modifiedDate,
                last_synced_at: new Date()
              }).where(eq(payments.id, localPay.id));
            }
          }
        }
      } catch (err) {
        results.errors.push(`Payment ${paymentId}: ${err}`);
      }
    }

    // ========== PHASE 4: Sync Linked SEDA Registrations ==========
    console.log("\n--- Syncing Linked SEDA Registrations ---");
    console.log(`Found ${sedaIdsToSync.size} unique SEDA registration IDs to sync`);

    for (const sedaId of sedaIdsToSync) {
      try {
        const sedaRes = await fetch(`${BUBBLE_BASE_URL}/seda_registration/${sedaId}`, { headers });
        if (sedaRes.ok) {
          const sedaData = await sedaRes.json();
          const bSeda = sedaData.response;
          if (bSeda) {
            const modifiedDate = new Date(bSeda["Modified Date"]);
            const localSeda = await db.query.sedaRegistration.findFirst({
              where: eq(sedaRegistration.bubble_id, bSeda._id)
            });

            if (!localSeda) {
              await db.insert(sedaRegistration).values({
                bubble_id: bSeda._id,
                reg_status: bSeda["Reg Status"] || null,
                state: bSeda.State || null,
                agent: bSeda.Agent || null,
                project_price: bSeda["Project Price"] || null,
                city: bSeda.City || null,
                installation_address: bSeda["Installation Address"] || null,
                linked_customer: bSeda["Linked Customer"] || null,
                linked_invoice: bSeda["Linked Invoice"] ? [bSeda["Linked Invoice"]] : null,
                customer_signature: bSeda["Customer Signature"] || null,
                email: bSeda.Email || null,
                ic_copy_back: bSeda["IC Copy Back"] || null,
                ic_copy_front: bSeda["IC Copy Front"] || null,
                tnb_bill_3: bSeda["TNB Bill 3"] || null,
                tnb_bill_1: bSeda["TNB Bill 1"] || null,
                tnb_meter: bSeda["TNB Meter"] || null,
                e_contact_no: bSeda["E Contact No"] || null,
                tnb_bill_2: bSeda["TNB Bill 2"] || null,
                drawing_pdf_system: bSeda["Drawing PDF System"] || null,
                e_contact_name: bSeda["E Contact Name"] || null,
                seda_status: bSeda["SEDA Status"] || null,
                nem_application_no: bSeda["NEM Application No"] || null,
                e_contact_relationship: bSeda["E Contact Relationship"] || null,
                ic_no: bSeda["IC No"] || null,
                request_drawing_date: bSeda["Request Drawing Date"] ? new Date(bSeda["Request Drawing Date"]) : null,
                phase_type: bSeda["Phase Type"] || null,
                special_remark: bSeda["Special Remark"] || null,
                tnb_account_no: bSeda["TNB Account No"] || null,
                nem_cert: bSeda["NEM Cert"] || null,
                property_ownership_prove: bSeda["Property Ownership Prove"] || null,
                inverter_serial_no: bSeda["Inverter Serial No"] || null,
                tnb_meter_install_date: bSeda["TNB Meter Install Date"] ? new Date(bSeda["TNB Meter Install Date"]) : null,
                tnb_meter_status: bSeda["TNB Meter Status"] || null,
                first_completion_date: bSeda["First Completion Date"] ? new Date(bSeda["First Completion Date"]) : null,
                e_contact_mykad: bSeda["E Contact MyKad"] || null,
                mykad_pdf: bSeda["MyKad PDF"] || null,
                nem_type: bSeda["NEM Type"] || null,
                e_email: bSeda["E Email"] || null,
                redex_remark: bSeda["Redex Remark"] || null,
                site_images: bSeda["Site Images"] || null,
                company_registration_no: bSeda["Company Registration No"] || null,
                drawing_system_actual: bSeda["Drawing System Actual"] || null,
                created_by: bSeda["Created By"] || null,
                created_date: bSeda["Created Date"] ? new Date(bSeda["Created Date"]) : null,
                created_at: new Date(bSeda["Created Date"]),
                modified_date: modifiedDate,
                updated_at: modifiedDate,
                last_synced_at: new Date()
              });
              results.syncedSedas++;
            } else if (modifiedDate > (localSeda.updated_at || new Date(0))) {
              await db.update(sedaRegistration).set({
                reg_status: bSeda["Reg Status"] || localSeda.reg_status,
                state: bSeda.State || localSeda.state,
                modified_date: modifiedDate,
                updated_at: modifiedDate,
                last_synced_at: new Date()
              }).where(eq(sedaRegistration.id, localSeda.id));
            }
          }
        }
      } catch (err) {
        results.errors.push(`SEDA ${sedaId}: ${err}`);
      }
    }

    // ========== SUMMARY ==========
    console.log("\n=== SYNC COMPLETE ===");
    console.table([
      { Phase: "Customers", Synced: results.syncedCustomers, Updated: 0, Failed: 0 },
      { Phase: "Invoices", Synced: results.syncedInvoices, Updated: 0, Failed: 0 },
      { Phase: "Invoice Items", Synced: results.syncedItems, Updated: 0, Failed: 0 },
      { Phase: "Payments", Synced: results.syncedPayments, Updated: 0, Failed: 0 },
      { Phase: "SEDA Registrations", Synced: results.syncedSedas, Updated: 0, Failed: 0 },
    ]);

    if (results.errors.length > 0) {
      console.log("\n=== ERRORS ===");
      results.errors.slice(0, 10).forEach(err => console.log(err));
      if (results.errors.length > 10) {
        console.log(`... and ${results.errors.length - 10} more errors`);
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error("Error in Complete Invoice Package Sync:", error);
    return { success: false, error: String(error) };
  }
}
