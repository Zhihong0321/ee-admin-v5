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

const agentBubbleIdCache = new Map<string, string | null>();

/**
 * Resolve a raw Bubble "Linked Agent" reference to the user.bubble_id that
 * invoice/payment/submitted_payment.linked_agent must hold.
 *
 * Bubble links these records to its own Agent data type, so every sync pulls a
 * value in agent-identity space (`agent.bubble_id`), not `user.bubble_id`. The
 * 2026-07-20b migration repointed all existing rows once, but every subsequent
 * sync writes the raw agent id straight back in — this is what undoes that
 * migration on every re-sync. Route every write through this first.
 *
 * Resolution order — DELIBERATELY prefers the back-linked user over a
 * self-promoted one, not the reverse:
 *   1. A DISTINCT user with `linked_agent_profile = raw` (bubble_id <> raw) —
 *      an agent with a real login. Checked first because the 2026-07-20b
 *      migration's orphan test only looked at `agent.linked_user_login`
 *      (Bubble's own field), which was stale/empty for 17 of the 34 agents it
 *      promoted — those 17 already had a real, distinct, logged-in user whose
 *      `linked_agent_profile` correctly pointed at them. Promoting anyway
 *      created a second "ghost" user row with `bubble_id = agent.bubble_id`,
 *      same display name, no login. Resolving to bubble_id first (as an
 *      earlier version of this function did) picks that ghost every time —
 *      silently fragmenting the real user's invoices/payments onto a second,
 *      loginless identity. Never reorder these two checks without re-reading
 *      migrations/2026-07-20b-retire-agent-table-user-only.sql.
 *   2. `user.bubble_id = raw` — a true promoted orphan (no distinct back-link
 *      exists), where the promoted row IS the canonical user.
 *   3. Unresolvable (agent not yet imported as a user) — return the raw value
 *      unchanged so nothing is dropped; it will show as an orphan until that
 *      agent is promoted, same as today.
 *
 * Cached per raw id for the lifetime of the process/request, so bulk syncs
 * don't re-query per row for repeat agents.
 */
export async function resolveAgentBubbleId(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  if (agentBubbleIdCache.has(raw)) return agentBubbleIdCache.get(raw)!;

  const candidates = await db.query.users.findMany({
    where: or(eq(users.linked_agent_profile, raw), eq(users.bubble_id, raw)),
    columns: { bubble_id: true },
  });

  const viaProfile = candidates.find(u => u.bubble_id !== raw);
  const viaPromotedSelf = candidates.find(u => u.bubble_id === raw);
  const resolved = viaProfile?.bubble_id ?? viaPromotedSelf?.bubble_id ?? raw;
  agentBubbleIdCache.set(raw, resolved);
  return resolved;
}

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
