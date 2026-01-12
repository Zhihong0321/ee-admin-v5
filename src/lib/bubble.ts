import { db } from "@/lib/db";
import { users, agents } from "@/db/schema";
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

