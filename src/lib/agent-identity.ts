import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

/**
 * Identity resolution for Admin OS.
 *
 * The `agent` table is RETIRED (2026-07-20). Nothing here reads it. Every identity
 * reference in the app — invoice.linked_agent, payment.linked_agent,
 * submitted_payment.linked_agent, referral.linked_agent, customer.created_by —
 * is meant to hold a `user.bubble_id` and resolve against `user` alone.
 *
 * How we got here:
 *   - `agent.id` and `user.id` were two independent integer sequences; 142 of 199
 *     agent ids also existed as a user id, usually a different person, so any raw-id
 *     join displayed the wrong human.
 *   - The 34 agents that never had a login were promoted to real user rows, reusing
 *     their own bubble_id so existing references kept resolving.
 *   - Agent-only profile data (contact, bank, IC, address, agent_type) was
 *     gap-filled onto the matching user row before the reads were removed.
 * See migrations/2026-07-20-normalize-agent-identity-to-user.sql and -20b-.
 *
 * `user.bubble_id` is the business identity. `user.id` is a row key and must never
 * be used as identity. If you find yourself adding an `agent` join, don't — the
 * data you want is on `user`.
 *
 * CAVEAT — the rule is not yet true in the data. `referral.linked_agent` is written
 * by Bubble, and since 2026-07-22 that write has been storing the integer `user.id`
 * instead of a `bubble_id`. Verified read-only against prod_main on 2026-09-14:
 * 80 live referral rows hold a raw integer, all 80 match a `user.id`, and none match
 * any `user.bubble_id` — so a bubble_id-only read rendered every recent lead as
 * "Unassigned". Read identity with the helpers below and write it with
 * `resolveUserRefToBubbleId`, so the column converges back on the canonical keyspace.
 */

/**
 * Resolve a reference that may hold EITHER keyspace: canonical `user.bubble_id`
 * first, then a raw integer `user.id`.
 *
 * The retired `agent.id` space is deliberately NOT a third candidate. In the integer
 * referral rows, 15 of the 18 distinct values also exist as an `agent.id`, and for
 * most of them that row names a DIFFERENT person (e.g. `12` is user "CHAN WING ON"
 * but agent.id 12 is "TEOH TEIK KIEN"; `14`/`16` are swapped outright). Resolving an
 * integer as an agent id would confidently display the wrong human.
 *
 * There is intentionally no bubble_id-only alternative to reach for: it silently
 * blanks every row an integer-keyed writer touched, which is the bug these helpers
 * exist to prevent. Each probe below is a unique-index lookup
 * (`user_bubble_id_key` / `user_pkey`).
 */

/** Normalise a text identity column/param before lookup (Bubble often pads with spaces). */
function trimmedIdentityRef(ref: SQL): SQL<string> {
  return sql<string>`btrim(${ref}::text)`;
}

/** Resolve a reference to the person's display name, from either keyspace. */
export function resolvedIdentityNameLoose(ref: SQL): SQL<string | null> {
  const key = trimmedIdentityRef(ref);
  return sql<string | null>`COALESCE(
    (SELECT u.name FROM "user" u WHERE u.bubble_id = ${key}),
    (SELECT u2.name FROM "user" u2 WHERE CAST(u2.id AS TEXT) = ${key})
  )`;
}

/** Resolve a reference to the person's contact number, from either keyspace. */
export function resolvedIdentityContactLoose(ref: SQL): SQL<string | null> {
  const key = trimmedIdentityRef(ref);
  return sql<string | null>`COALESCE(
    (SELECT u.contact FROM "user" u WHERE u.bubble_id = ${key}),
    (SELECT u2.contact FROM "user" u2 WHERE CAST(u2.id AS TEXT) = ${key})
  )`;
}

/**
 * The canonical `user.bubble_id` a reference points at, from either keyspace.
 * NULL when the reference resolves to no user at all — callers that want to keep
 * showing the unresolvable value can fall back to the raw column themselves.
 */
export function resolvedIdentityBubbleIdLoose(ref: SQL): SQL<string | null> {
  const key = trimmedIdentityRef(ref);
  return sql<string | null>`COALESCE(
    (SELECT u.bubble_id FROM "user" u WHERE u.bubble_id = ${key}),
    (SELECT u2.bubble_id FROM "user" u2 WHERE CAST(u2.id AS TEXT) = ${key})
  )`;
}

/** Bubble_id-only read — sufficient when the column is known to hold canonical ids. */
export function resolvedIdentityName(ref: SQL): SQL<string | null> {
  const key = trimmedIdentityRef(ref);
  return sql<string | null>`(SELECT u.name FROM "user" u WHERE u.bubble_id = ${key})`;
}

export function resolvedIdentityContact(ref: SQL): SQL<string | null> {
  const key = trimmedIdentityRef(ref);
  return sql<string | null>`(SELECT u.contact FROM "user" u WHERE u.bubble_id = ${key})`;
}

/** @deprecated alias — same as {@link resolvedIdentityNameLoose}. */
export const resolvedIdentityNameLegacy = resolvedIdentityNameLoose;

/**
 * Write-side normaliser: fold a reference in either keyspace down to the canonical
 * `user.bubble_id`, so an integer written elsewhere stops propagating the moment an
 * admin touches the row. Returns the trimmed input unchanged when no user matches —
 * dropping an assignment we cannot resolve would be worse than keeping it visible.
 */
export async function resolveUserRefToBubbleId(
  ref: string | number | null | undefined,
): Promise<string | null> {
  const value = String(ref ?? "").trim();
  if (!value) return null;

  const viaBubbleId = await db.query.users.findFirst({
    where: eq(users.bubble_id, value),
    columns: { bubble_id: true },
  });
  if (viaBubbleId?.bubble_id) return viaBubbleId.bubble_id;

  if (/^\d+$/.test(value)) {
    const viaIntegerId = await db.query.users.findFirst({
      where: eq(users.id, Number(value)),
      columns: { bubble_id: true },
    });
    if (viaIntegerId?.bubble_id) return viaIntegerId.bubble_id;
  }

  return value;
}
