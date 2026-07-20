import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

/**
 * Write a Bubble Agent record's profile fields onto the corresponding `user` row.
 *
 * The `agent` table is retired (migration 2026-07-20b) and is no longer written by
 * any sync path. A Bubble agent maps to a user either through the normal back-link
 * (`user.linked_agent_profile`) or, for the 34 agents that never had a login and
 * were promoted to users reusing their own bubble_id, through `user.bubble_id`.
 *
 * Deliberately does NOT touch `user.email`: that comes from the Bubble auth record,
 * and the agent record's email is frequently a stale or personal address.
 *
 * Returns the number of user rows updated (0 means no user matched this agent —
 * expected for agents that exist in Bubble but were never imported here).
 */
export type AgentProfileFields = {
  name?: string | null;
  contact?: string | null;
  agent_type?: string | null;
  address?: string | null;
  bankin_account?: string | null;
  banker?: string | null;
  ic_front?: string | null;
  ic_back?: string | null;
  updated_at?: Date;
  last_synced_at?: Date;
};

export async function writeAgentProfileToUser(
  agentBubbleId: string,
  vals: AgentProfileFields & Record<string, unknown>,
): Promise<number> {
  if (!agentBubbleId) return 0;

  // Only forward columns that exist on `user`; sync callers pass wider objects.
  const { name, contact, agent_type, address, bankin_account, banker, ic_front, ic_back,
          updated_at, last_synced_at } = vals as AgentProfileFields;

  const updated = await db
    .update(users)
    .set({
      name, contact, agent_type, address, bankin_account, banker, ic_front, ic_back,
      updated_at: updated_at ?? new Date(),
      last_synced_at: last_synced_at ?? new Date(),
    })
    .where(or(eq(users.linked_agent_profile, agentBubbleId), eq(users.bubble_id, agentBubbleId)))
    .returning({ id: users.id });

  return updated.length;
}
