import { db } from "@/lib/db";
import { users, agents, payments, submitted_payments } from "@/db/schema";
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
