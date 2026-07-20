-- ============================================================================
-- Normalize agent identity references to user.bubble_id  (Admin OS)
-- Date: 2026-07-20
--
-- WHY
--   `agent.id` and `user.id` are two independent integer sequences in the same
--   database. 142 of 199 agent ids also exist as a user id, almost always
--   belonging to a DIFFERENT person. Any column storing a raw integer id, joined
--   against the wrong table, silently displays the wrong human being.
--
--   Canonical rule: `user.bubble_id` is the business identity. Raw integer ids are
--   row keys only. The `agent` table is retained as a historical back-link and is
--   NOT authoritative for identity. Nothing is dropped or deleted by this script.
--
-- SCOPE (verified against production before writing this file)
--   1. customer.created_by  — 492 raw-integer rows. This column is user-semantic:
--      all 63 of its bubble_id values match user.bubble_id and ZERO match
--      agent.bubble_id, and for 377/438 independently checkable rows the integer
--      equals the real owner's user.id (vs 94 for agent.id, all of which are rows
--      where the two ids happen to coincide). It was being joined against
--      agent.id, misattributing ~331 customers. This is an explicit, evidence-
--      backed correction, approved before execution.
--   2. referral.linked_agent — 1 remaining raw-integer row, written by this app
--      AFTER the referral normalization run at 2026-07-20 05:07 (see
--      referral_agent_identity_backup_20260720). Here a raw integer means
--      agent.id, so it resolves via the agent table and PRESERVES the currently
--      displayed name. Note the trap: this value is '12'; user.id=12 is a
--      different person, so it must NOT be resolved as a user id.
--
--   The other 160 referral rows are already normalized — not touched.
--   invoice/payment/submitted_payment.linked_agent hold agent bubble_ids with
--   zero raw integers — out of scope, no collision risk.
--
-- NOT MIGRATED (intentional)
--   4 customer rows with created_by='1001' — January test fixtures referencing
--   neither table. They render blank before and after, so there is nothing to
--   preserve or correct.
--
-- Every value below is DERIVED IN SQL from the live tables rather than pasted in,
-- so there is no opportunity for a stale copy-paste to write wrong data.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Audit/backup table: old -> new -> reason, written BEFORE any mutation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_created_by_identity_backup_20260720 (
  backup_id        bigserial PRIMARY KEY,
  backed_up_at     timestamptz NOT NULL DEFAULT now(),
  customer_id      text,
  customer_row_id  integer,
  old_created_by   text,
  new_created_by   text,
  old_display_name text,
  new_display_name text,
  resolution_reason text
);

INSERT INTO customer_created_by_identity_backup_20260720
  (customer_id, customer_row_id, old_created_by, new_created_by,
   old_display_name, new_display_name, resolution_reason)
SELECT
  c.customer_id,
  c.id,
  c.created_by,
  u.bubble_id,
  a.name,   -- what the old agent.id join displayed
  u.name,   -- what the corrected user join displays
  'user.id -> user.bubble_id (column confirmed user-semantic)'
FROM customer c
JOIN "user" u ON CAST(u.id AS TEXT) = c.created_by
LEFT JOIN agent a ON CAST(a.id AS TEXT) = c.created_by
WHERE c.created_by ~ '^[0-9]+$'
  AND u.bubble_id IS NOT NULL AND u.bubble_id <> '';

-- Orphan safety net: an integer that matches ONLY an agent (no user row) must be
-- encoded as that agent's own bubble_id, never resolved to an unrelated user.
-- Production currently yields zero such rows; kept so a re-run stays correct.
INSERT INTO customer_created_by_identity_backup_20260720
  (customer_id, customer_row_id, old_created_by, new_created_by,
   old_display_name, new_display_name, resolution_reason)
SELECT
  c.customer_id, c.id, c.created_by, a.bubble_id, a.name, a.name,
  'orphan agent: no user row for this id; encoded as agent.bubble_id (preserves display, no misattribution)'
FROM customer c
JOIN agent a ON CAST(a.id AS TEXT) = c.created_by
WHERE c.created_by ~ '^[0-9]+$'
  AND a.bubble_id IS NOT NULL AND a.bubble_id <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "user" u
    WHERE CAST(u.id AS TEXT) = c.created_by
      AND u.bubble_id IS NOT NULL AND u.bubble_id <> ''
  );

-- Referral: append to the audit table the earlier run already created.
INSERT INTO referral_agent_identity_backup_20260720
  (referral_bubble_id, old_linked_agent, new_linked_agent, resolution_reason)
SELECT
  r.bubble_id,
  r.linked_agent,
  a.linked_user_login,
  'agent-table match (preserves current display); raw agent.id written by Admin OS after the initial run'
FROM referral r
JOIN agent a ON CAST(a.id AS TEXT) = r.linked_agent
JOIN "user" u ON u.bubble_id = a.linked_user_login
WHERE r.linked_agent ~ '^[0-9]+$';

-- ---------------------------------------------------------------------------
-- 2. Apply, driven entirely off the audit rows just written.
-- ---------------------------------------------------------------------------
UPDATE customer c
SET created_by = b.new_created_by,
    updated_at = now()
FROM customer_created_by_identity_backup_20260720 b
WHERE b.customer_row_id = c.id
  AND b.new_created_by IS NOT NULL
  AND c.created_by = b.old_created_by;   -- no-op if already migrated

UPDATE referral r
SET linked_agent = a.linked_user_login,
    updated_at = now()
FROM agent a, "user" u
WHERE CAST(a.id AS TEXT) = r.linked_agent
  AND u.bubble_id = a.linked_user_login
  AND r.linked_agent ~ '^[0-9]+$';

-- ---------------------------------------------------------------------------
-- 3. Post-conditions. Any failure here aborts the whole transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  leftover_customer int;
  leftover_referral int;
BEGIN
  -- Only the 4 known test fixtures (created_by='1001') may remain integers.
  SELECT count(*) INTO leftover_customer
  FROM customer WHERE created_by ~ '^[0-9]+$' AND created_by <> '1001';
  IF leftover_customer <> 0 THEN
    RAISE EXCEPTION 'customer.created_by: % unexpected raw integers remain', leftover_customer;
  END IF;

  SELECT count(*) INTO leftover_referral
  FROM referral WHERE linked_agent ~ '^[0-9]+$';
  IF leftover_referral <> 0 THEN
    RAISE EXCEPTION 'referral.linked_agent: % raw integers remain', leftover_referral;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Rollback (if ever needed):
--   UPDATE customer c SET created_by = b.old_created_by
--   FROM customer_created_by_identity_backup_20260720 b
--   WHERE b.customer_row_id = c.id AND c.created_by = b.new_created_by;
--
--   UPDATE referral r SET linked_agent = b.old_linked_agent
--   FROM referral_agent_identity_backup_20260720 b
--   WHERE b.referral_bubble_id = r.bubble_id AND r.linked_agent = b.new_linked_agent;
-- ============================================================================
