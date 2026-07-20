import { sql, type SQL } from "drizzle-orm";

/**
 * Identity resolution for Admin OS.
 *
 * The `agent` table is RETIRED (2026-07-20). Nothing here reads it. Every identity
 * reference in the app — invoice.linked_agent, payment.linked_agent,
 * submitted_payment.linked_agent, referral.linked_agent, customer.created_by —
 * now holds a `user.bubble_id` and resolves against `user` alone.
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
 */

/** SQL expression resolving a bubble_id reference to the person's display name. */
export function resolvedIdentityName(ref: SQL): SQL<string | null> {
  return sql<string | null>`(SELECT u.name FROM "user" u WHERE u.bubble_id = ${ref})`;
}

/** SQL expression resolving a bubble_id reference to the person's contact number. */
export function resolvedIdentityContact(ref: SQL): SQL<string | null> {
  return sql<string | null>`(SELECT u.contact FROM "user" u WHERE u.bubble_id = ${ref})`;
}

/**
 * Legacy raw-integer resolution, for the one column that still holds them:
 * `customer.created_by` retains 4 test-fixture rows ('1001') that match nothing.
 * Real values are all bubble_ids. Kept so those rows degrade to NULL rather than
 * throwing, and so the intent is documented rather than looking like an oversight.
 */
export function resolvedIdentityNameLegacy(ref: SQL): SQL<string | null> {
  return sql<string | null>`COALESCE(
    (SELECT u.name FROM "user" u WHERE u.bubble_id = ${ref}),
    (SELECT u2.name FROM "user" u2 WHERE CAST(u2.id AS TEXT) = ${ref})
  )`;
}
