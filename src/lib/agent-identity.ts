import { sql, type SQL } from "drizzle-orm";

/**
 * Shared agent/user identity resolution.
 *
 * Background: `agent.id` and `user.id` are two independent integer sequences in the
 * same database, so they collide (142 of 199 agent ids also exist as a user id, and
 * usually belong to a completely different person). Any join that matches a raw id
 * against `agent.id` will silently display the wrong person.
 *
 * Canonical identity rule: `user.bubble_id` is the business identity. Raw integer ids
 * are row keys only and must never be treated as identity.
 *
 * Resolution order is user-first, with the `agent` table kept only as a historical
 * back-link fallback:
 *   1. user.bubble_id   — the canonical form, what all new writes use
 *   2. agent.bubble_id  — orphan agents (34 of them) that never had a login account
 *   3. raw integer      — legacy data; see `rawIntMeans` below
 *
 * `rawIntMeans` must be set per column, because legacy raw integers do NOT mean the
 * same thing everywhere:
 *   - "agent": this app historically wrote `String(agent.id)` (referral.linked_agent)
 *   - "user":  the value was always a user row key (customer.created_by)
 * Getting this backwards misattributes rows to a stranger, so it is explicit rather
 * than guessed.
 */
export type RawIntMeans = "user" | "agent";

/**
 * SQL expression resolving `ref` (a text column holding an identity reference) to a
 * display name. Returns NULL when nothing matches.
 */
export function resolvedIdentityName(ref: SQL, rawIntMeans: RawIntMeans): SQL<string | null> {
  // `user.name` is the live name; `agent.name` is Bubble-import data and goes stale
  // (and for some agents holds an email address rather than a name). So whenever a
  // tier resolves through the agent table, hop to that agent's linked user account
  // and use its name, falling back to agent.name only for orphan agents that never
  // had a login.
  const agentNameViaUser = (agentAlias: string) => sql`COALESCE(
    (SELECT ux.name FROM "user" ux
      WHERE ux.bubble_id = ${sql.raw(agentAlias)}.linked_user_login
        AND ux.name IS NOT NULL AND ux.name <> ''),
    ${sql.raw(agentAlias)}.name
  )`;

  const rawIntLookup = rawIntMeans === "user"
    ? sql`(SELECT u2.name FROM "user" u2 WHERE CAST(u2.id AS TEXT) = ${ref})`
    : sql`(SELECT ${agentNameViaUser("a2")} FROM agent a2 WHERE CAST(a2.id AS TEXT) = ${ref})`;

  return sql<string | null>`COALESCE(
    (SELECT u1.name FROM "user" u1 WHERE u1.bubble_id = ${ref}),
    (SELECT ${agentNameViaUser("a1")} FROM agent a1 WHERE a1.bubble_id = ${ref}),
    ${rawIntLookup}
  )`;
}

/**
 * Same as `resolvedIdentityName` but also yields the contact/email columns, for the
 * places that render more than a name.
 */
export function resolvedIdentityContact(ref: SQL, rawIntMeans: RawIntMeans): SQL<string | null> {
  const rawIntLookup = rawIntMeans === "user"
    ? sql`(SELECT NULL::text WHERE FALSE)`
    : sql`(SELECT a2.contact FROM agent a2 WHERE CAST(a2.id AS TEXT) = ${ref})`;

  return sql<string | null>`COALESCE(
    (SELECT a1.contact FROM agent a1 WHERE a1.bubble_id = ${ref}),
    (SELECT a3.contact FROM agent a3
       WHERE a3.bubble_id = (SELECT u1.linked_agent_profile FROM "user" u1 WHERE u1.bubble_id = ${ref})),
    ${rawIntLookup}
  )`;
}

/**
 * The identity value that new writes must persist. Always `user.bubble_id` when the
 * person has a login; falls back to `agent.bubble_id` for the orphan agents that have
 * no user account. Never a raw integer id.
 */
export function assignableIdentityValue(row: {
  user_bubble_id: string | null;
  agent_bubble_id: string | null;
}): string | null {
  return row.user_bubble_id || row.agent_bubble_id || null;
}
