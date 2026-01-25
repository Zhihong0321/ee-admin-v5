/**
 * ============================================================================
 * PROFILE SYNC OPERATIONS
 * ============================================================================
 *
 * Sync operations for user and agent profiles.
 * These are lighter-weight syncs that don't include invoices or payments.
 *
 * File: src/lib/bubble/sync-profiles.ts
 */

import { db } from "@/lib/db";
import { users, agents } from "@/db/schema";
import { BUBBLE_BASE_URL, BUBBLE_API_HEADERS } from "./client";

/**
 * ============================================================================
 * FUNCTION: syncProfilesFromBubble
 * ============================================================================
 *
 * INTENT (What & Why):
 * Sync only user and agent profiles from Bubble. Use this when you need to
 * update user/agent data without syncing invoices or other related data.
 *
 * INPUTS:
 * None (syncs all agents and users)
 *
 * OUTPUTS:
 * @returns {
 *   success: boolean,
 *   results: { syncedUsers: number, syncedAgents: number, errors: string[] },
 *   error?: string
 * }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Sync all agents
 * 2. Sync all users
 * 3. Return results
 *
 * EDGE CASES:
 * - No agents/users in Bubble → Returns success with count: 0
 * - API error → Returns success: false with error
 *
 * SIDE EFFECTS:
 * - Writes to agents and users tables
 * - No impact on invoices, customers, payments
 *
 * DEPENDENCIES:
 * - Requires: db, BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: Quick profile sync operations
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
 * ============================================================================
 * FUNCTION: syncSingleProfileFromBubble
 * ============================================================================
 *
 * INTENT (What & Why):
 * Sync a single user or agent profile by ID. Useful for quick updates
 * when only one profile has changed.
 *
 * INPUTS:
 * @param bubbleId - Bubble ID of the profile to sync
 * @param type - 'user' | 'agent': Which type of profile to sync
 *
 * OUTPUTS:
 * @returns { success: boolean, error?: string }
 *
 * EXECUTION ORDER (Step-by-step):
 * 1. Determine Bubble typeName based on type parameter
 * 2. Fetch single record from Bubble API
 * 3. Map fields to PostgreSQL schema
 * 4. Upsert to database
 * 5. Return success or error
 *
 * EDGE CASES:
 * - Invalid bubbleId → Throws error
 * - Record not found (404) → Throws error
 *
 * SIDE EFFECTS:
 * - Writes to users or agents table (single record)
 *
 * DEPENDENCIES:
 * - Requires: db, BUBBLE_BASE_URL, BUBBLE_API_HEADERS
 * - Used by: Individual profile sync operations
 */
export async function syncSingleProfileFromBubble(bubbleId: string, type: 'user' | 'agent') {
  try {
    const typeName = type === 'user' ? 'user' : 'agent';
    const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}/${bubbleId}`, { headers: BUBBLE_API_HEADERS });

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
 * ============================================================================
 * SHARED HELPER: syncTable
 * ============================================================================
 *
 * Generic sync function (duplicated from sync-complete.ts for module independence).
 * Fetches all records from Bubble and upserts to PostgreSQL.
 */
async function syncTable(typeName: string, table: any, conflictCol: any, mapFn: (b: any) => any, results: any) {
  let cursor = 0;
  let remaining = 1;

  while (remaining > 0) {
    try {
      const res = await fetch(`${BUBBLE_BASE_URL}/${typeName}?limit=100&cursor=${cursor}`, { headers: BUBBLE_API_HEADERS });
      if (!res.ok) break;
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
      console.error(`Error syncing ${typeName}:`, err);
      break;
    }
  }
}
