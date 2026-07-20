-- ============================================================================
-- Retire the agent table as a source of truth: Admin OS reads `user` only
-- Date: 2026-07-20  (follows 2026-07-20-normalize-agent-identity-to-user.sql)
--
-- GOAL
--   No application code reads the `agent` table. Every identity reference in the
--   app resolves against `user`. The agent table is FROZEN in place as historical
--   data — nothing is dropped, deleted, or truncated by this script.
--
-- THREE STEPS
--   1. Promote the 34 orphan agents (no login account) to real `user` rows.
--      Each new user REUSES THE AGENT'S OWN bubble_id. That is safe — verified
--      zero collisions between agent.bubble_id and user.bubble_id — and it means
--      the 496 rows already pointing at those agents resolve to the new user with
--      NO row rewrite at all. Fewer writes, less risk.
--   2. Backfill user columns from the linked agent, GAP-FILL ONLY (never
--      overwrite a value the user row already has), so nothing disappears from
--      the UI once the app stops reading agent.
--   3. Repoint invoice/payment/submitted_payment.linked_agent from the agent's
--      bubble_id to the linked user's bubble_id. Rows pointing at a promoted
--      orphan are already correct and are left alone.
--
-- VERIFIED BEFORE WRITING (read-only against production):
--   - agent.bubble_id vs user.bubble_id collisions ........... 0
--   - orphan agents lacking a bubble_id ...................... 0
--   - orphans that are somehow already users ................. 0
--   - references matching no agent row ....................... 0
--   - post-promotion unmappable references ................... 0 of 12,586
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS agent_retirement_backup_20260720 (
  backup_id     bigserial PRIMARY KEY,
  backed_up_at  timestamptz NOT NULL DEFAULT now(),
  table_name    text,
  row_id        integer,
  column_name   text,
  old_value     text,
  new_value     text,
  reason        text
);

-- ---------------------------------------------------------------------------
-- STEP 1: promote orphan agents to user rows (bubble_id reused deliberately)
-- ---------------------------------------------------------------------------
INSERT INTO agent_retirement_backup_20260720
  (table_name, row_id, column_name, old_value, new_value, reason)
SELECT 'user', a.id, 'bubble_id', NULL, a.bubble_id,
       'promoted orphan agent to user (no login account existed); bubble_id reused so existing references resolve unchanged'
FROM agent a
WHERE (a.linked_user_login IS NULL OR a.linked_user_login = '')
  AND a.bubble_id IS NOT NULL AND a.bubble_id <> ''
  AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.bubble_id = a.bubble_id);

INSERT INTO "user"
  (bubble_id, name, email, contact, address, bankin_account, banker,
   ic_front, ic_back, agent_type, linked_agent_profile, created_at, updated_at)
SELECT
  a.bubble_id, a.name, a.email, a.contact, a.address, a.bankin_account, a.banker,
  a.ic_front, a.ic_back, a.agent_type,
  a.bubble_id,          -- keep the back-link to the historical agent row
  now(), now()
FROM agent a
WHERE (a.linked_user_login IS NULL OR a.linked_user_login = '')
  AND a.bubble_id IS NOT NULL AND a.bubble_id <> ''
  AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.bubble_id = a.bubble_id);

-- ---------------------------------------------------------------------------
-- STEP 2: gap-fill user columns from the linked agent (never overwrite)
-- ---------------------------------------------------------------------------
INSERT INTO agent_retirement_backup_20260720
  (table_name, row_id, column_name, old_value, new_value, reason)
SELECT 'user', u.id, col.name, NULL, col.val, 'gap-filled from linked agent before agent reads were removed'
FROM "user" u
JOIN agent a ON a.bubble_id = u.linked_agent_profile
CROSS JOIN LATERAL (VALUES
  ('name',           u.name,           a.name),
  ('contact',        u.contact,        a.contact),
  ('address',        u.address,        a.address),
  ('bankin_account', u.bankin_account, a.bankin_account),
  ('banker',         u.banker,         a.banker),
  ('ic_front',       u.ic_front,       a.ic_front),
  ('ic_back',        u.ic_back,        a.ic_back),
  ('agent_type',     u.agent_type,     a.agent_type)
) AS col(name, cur, val)
WHERE (col.cur IS NULL OR col.cur = '') AND col.val IS NOT NULL AND col.val <> '';

UPDATE "user" u
SET name           = COALESCE(NULLIF(u.name, ''),           a.name),
    contact        = COALESCE(NULLIF(u.contact, ''),        a.contact),
    address        = COALESCE(NULLIF(u.address, ''),        a.address),
    bankin_account = COALESCE(NULLIF(u.bankin_account, ''), a.bankin_account),
    banker         = COALESCE(NULLIF(u.banker, ''),         a.banker),
    ic_front       = COALESCE(NULLIF(u.ic_front, ''),       a.ic_front),
    ic_back        = COALESCE(NULLIF(u.ic_back, ''),        a.ic_back),
    agent_type     = COALESCE(NULLIF(u.agent_type, ''),     a.agent_type),
    updated_at     = now()
FROM agent a
WHERE a.bubble_id = u.linked_agent_profile;

-- ---------------------------------------------------------------------------
-- STEP 3: repoint references from agent.bubble_id to user.bubble_id
-- ---------------------------------------------------------------------------
INSERT INTO agent_retirement_backup_20260720
  (table_name, row_id, column_name, old_value, new_value, reason)
SELECT 'invoice', i.id, 'linked_agent', i.linked_agent, a.linked_user_login,
       'agent.bubble_id -> linked user.bubble_id'
FROM invoice i JOIN agent a ON a.bubble_id = i.linked_agent
WHERE a.linked_user_login IS NOT NULL AND a.linked_user_login <> '';

UPDATE invoice i SET linked_agent = a.linked_user_login, updated_at = now()
FROM agent a
WHERE a.bubble_id = i.linked_agent
  AND a.linked_user_login IS NOT NULL AND a.linked_user_login <> '';

INSERT INTO agent_retirement_backup_20260720
  (table_name, row_id, column_name, old_value, new_value, reason)
SELECT 'payment', p.id, 'linked_agent', p.linked_agent, a.linked_user_login,
       'agent.bubble_id -> linked user.bubble_id'
FROM payment p JOIN agent a ON a.bubble_id = p.linked_agent
WHERE a.linked_user_login IS NOT NULL AND a.linked_user_login <> '';

UPDATE payment p SET linked_agent = a.linked_user_login, updated_at = now()
FROM agent a
WHERE a.bubble_id = p.linked_agent
  AND a.linked_user_login IS NOT NULL AND a.linked_user_login <> '';

INSERT INTO agent_retirement_backup_20260720
  (table_name, row_id, column_name, old_value, new_value, reason)
SELECT 'submitted_payment', s.id, 'linked_agent', s.linked_agent, a.linked_user_login,
       'agent.bubble_id -> linked user.bubble_id'
FROM submitted_payment s JOIN agent a ON a.bubble_id = s.linked_agent
WHERE a.linked_user_login IS NOT NULL AND a.linked_user_login <> '';

UPDATE submitted_payment s SET linked_agent = a.linked_user_login, updated_at = now()
FROM agent a
WHERE a.bubble_id = s.linked_agent
  AND a.linked_user_login IS NOT NULL AND a.linked_user_login <> '';

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS: every reference must now resolve against `user` alone.
-- ---------------------------------------------------------------------------
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM invoice i
  WHERE i.linked_agent IS NOT NULL AND i.linked_agent <> ''
    AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.bubble_id = i.linked_agent);
  IF bad <> 0 THEN RAISE EXCEPTION 'invoice: % refs do not resolve to a user', bad; END IF;

  SELECT count(*) INTO bad FROM payment p
  WHERE p.linked_agent IS NOT NULL AND p.linked_agent <> ''
    AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.bubble_id = p.linked_agent);
  IF bad <> 0 THEN RAISE EXCEPTION 'payment: % refs do not resolve to a user', bad; END IF;

  SELECT count(*) INTO bad FROM submitted_payment s
  WHERE s.linked_agent IS NOT NULL AND s.linked_agent <> ''
    AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.bubble_id = s.linked_agent);
  IF bad <> 0 THEN RAISE EXCEPTION 'submitted_payment: % refs do not resolve to a user', bad; END IF;

  SELECT count(*) INTO bad FROM referral r
  WHERE r.linked_agent IS NOT NULL AND r.linked_agent <> ''
    AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.bubble_id = r.linked_agent);
  IF bad <> 0 THEN RAISE EXCEPTION 'referral: % refs do not resolve to a user', bad; END IF;

  SELECT count(*) INTO bad FROM customer c
  WHERE c.created_by ~ '^[0-9]+$' AND c.created_by <> '1001';
  IF bad <> 0 THEN RAISE EXCEPTION 'customer: % raw integer created_by remain', bad; END IF;
END $$;

COMMIT;

-- ============================================================================
-- Rollback:
--   UPDATE invoice i SET linked_agent = b.old_value
--     FROM agent_retirement_backup_20260720 b
--     WHERE b.table_name='invoice' AND b.column_name='linked_agent' AND b.row_id=i.id;
--   (same shape for payment / submitted_payment)
--   DELETE FROM "user" u USING agent_retirement_backup_20260720 b
--     WHERE b.reason LIKE 'promoted orphan%' AND u.bubble_id = b.new_value;
-- ============================================================================
