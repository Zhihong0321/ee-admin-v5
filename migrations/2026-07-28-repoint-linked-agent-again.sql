-- ============================================================================
-- Re-repoint invoice/payment/submitted_payment.linked_agent (2nd pass)
-- Date: 2026-07-28
--
-- WHY #1 — the migration doesn't stick without a code fix
--   2026-07-20b repointed invoice/payment/submitted_payment.linked_agent from
--   agent.bubble_id to the linked user's bubble_id as a ONE-TIME UPDATE. It did
--   not change how Bubble sync WRITES this column: Bubble links these records
--   to its own Agent data type, so every sync pulls a "Linked Agent" value in
--   agent-identity space and writes it straight through. Every re-sync since
--   2026-07-20 has silently undone the migration, row by row, for whichever
--   invoices/payments happened to sync again. Verified read-only against
--   prod_main on 2026-07-28: 409 invoice / 23 payment / 13 submitted_payment
--   rows had drifted back to a raw, unresolvable agent.bubble_id.
--
--   The sync write paths are now fixed in application code — see
--   src/lib/bubble/agent-profile.ts (resolveAgentBubbleId), wired into every
--   sync-*.ts file and payment-operations.ts that writes linked_agent — so
--   this will not recur after that deploy. This migration is the one-time
--   backfill for rows that drifted before the fix landed.
--
-- WHY #2 — a second, independent bug found while preparing this backfill
--   17 of the 34 "orphan" agents that 2026-07-20b promoted to their own user
--   row were NOT orphans. That migration's orphan test checked only
--   agent.linked_user_login (Bubble's own field on the Agent record), which
--   was empty/stale for these 17 even though a real, distinct, logged-in user
--   already existed whose user.linked_agent_profile correctly back-linked to
--   them (via the normal Bubble "Linked Agent Profile" field on the User
--   record — a different, independent field). Promoting them anyway created a
--   second "ghost" user row per agent: same name, bubble_id = agent.bubble_id,
--   no email, never logged in.
--
--   Because migration 2026-07-20b's step 3 only repointed rows where
--   agent.linked_user_login was set, it left every invoice/payment/
--   submitted_payment for these 17 agents pointed at the raw agent.bubble_id —
--   which, once the ghost row existed, "accidentally" resolved to the ghost
--   user on every read (LEFT JOIN "user" ON bubble_id = linked_agent matches
--   the ghost directly). These rows are NOT orphans — they resolve fine, just
--   to the wrong identity — so they don't show up in an orphan count. Verified
--   read-only against prod_main on 2026-07-28: 404 invoice / 58 payment / 46
--   submitted_payment rows are currently attributed to a ghost instead of the
--   real logged-in agent. This has been silently live since 2026-07-20.
--
-- RESOLUTION RULE (matches the corrected resolveAgentBubbleId)
--   For each row's linked_agent value, prefer:
--     1. A DISTINCT user with linked_agent_profile = linked_agent AND
--        bubble_id <> linked_agent (the real, logged-in account) — covers
--        both the plain drifted-orphan case and the ghost-misattribution case.
--     2. Else user.bubble_id = linked_agent (a genuine promoted orphan, no
--        distinct back-link exists — the promoted row IS canonical).
--     3. Else leave untouched (agent not yet imported as a user at all).
--
-- NOT IN SCOPE
--   - referral.linked_agent has 11 orphaned rows that do NOT resolve via
--     agent.bubble_id either — a different, unexamined cause. Not touched here.
--   - The 17 ghost user rows themselves are not deleted or merged by this
--     script (any commission/report logic keyed off their user.id would need
--     separate review). This script only repoints the FK-style linked_agent
--     text columns on invoice/payment/submitted_payment.
--
-- VERIFIED READ-ONLY AGAINST PRODUCTION BEFORE WRITING THIS FILE (2026-07-28):
--   invoice:            409 orphaned + 404 ghost-misattributed = 813 rows to fix
--   payment:             23 orphaned +  58 ghost-misattributed =  81 rows to fix
--   submitted_payment:   13 orphaned +  46 ghost-misattributed =  59 rows to fix
--   Re-run the SELECT counts in the companion verification block below
--   immediately before applying — these numbers will have moved if any sync
--   ran between 2026-07-28 and execution.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS linked_agent_resync_backup_20260728 (
  backup_id     bigserial PRIMARY KEY,
  backed_up_at  timestamptz NOT NULL DEFAULT now(),
  table_name    text,
  row_id        integer,
  old_value     text,
  new_value     text,
  resolution    text
);

-- ---------------------------------------------------------------------------
-- 1. Audit/backup, written BEFORE any mutation. new_value is NULL (and thus
--    excluded from the apply step) for anything unresolvable.
-- ---------------------------------------------------------------------------
INSERT INTO linked_agent_resync_backup_20260728 (table_name, row_id, old_value, new_value, resolution)
SELECT 'invoice', i.id, i.linked_agent,
       COALESCE(real_u.bubble_id, ghost_u.bubble_id),
       CASE WHEN real_u.bubble_id IS NOT NULL THEN 'distinct back-linked user'
            WHEN ghost_u.bubble_id IS NOT NULL THEN 'promoted-orphan user'
            ELSE 'unresolved' END
FROM invoice i
LEFT JOIN "user" real_u ON real_u.linked_agent_profile = i.linked_agent AND real_u.bubble_id <> i.linked_agent
LEFT JOIN "user" ghost_u ON ghost_u.bubble_id = i.linked_agent
WHERE i.linked_agent IS NOT NULL
  AND COALESCE(real_u.bubble_id, ghost_u.bubble_id) IS DISTINCT FROM i.linked_agent;

INSERT INTO linked_agent_resync_backup_20260728 (table_name, row_id, old_value, new_value, resolution)
SELECT 'payment', p.id, p.linked_agent,
       COALESCE(real_u.bubble_id, ghost_u.bubble_id),
       CASE WHEN real_u.bubble_id IS NOT NULL THEN 'distinct back-linked user'
            WHEN ghost_u.bubble_id IS NOT NULL THEN 'promoted-orphan user'
            ELSE 'unresolved' END
FROM payment p
LEFT JOIN "user" real_u ON real_u.linked_agent_profile = p.linked_agent AND real_u.bubble_id <> p.linked_agent
LEFT JOIN "user" ghost_u ON ghost_u.bubble_id = p.linked_agent
WHERE p.linked_agent IS NOT NULL
  AND COALESCE(real_u.bubble_id, ghost_u.bubble_id) IS DISTINCT FROM p.linked_agent;

INSERT INTO linked_agent_resync_backup_20260728 (table_name, row_id, old_value, new_value, resolution)
SELECT 'submitted_payment', s.id, s.linked_agent,
       COALESCE(real_u.bubble_id, ghost_u.bubble_id),
       CASE WHEN real_u.bubble_id IS NOT NULL THEN 'distinct back-linked user'
            WHEN ghost_u.bubble_id IS NOT NULL THEN 'promoted-orphan user'
            ELSE 'unresolved' END
FROM submitted_payment s
LEFT JOIN "user" real_u ON real_u.linked_agent_profile = s.linked_agent AND real_u.bubble_id <> s.linked_agent
LEFT JOIN "user" ghost_u ON ghost_u.bubble_id = s.linked_agent
WHERE s.linked_agent IS NOT NULL
  AND COALESCE(real_u.bubble_id, ghost_u.bubble_id) IS DISTINCT FROM s.linked_agent;

-- ---------------------------------------------------------------------------
-- 2. Apply, driven entirely off the audit rows just written. Rows with no
--    resolution (new_value IS NULL) are skipped, not nulled out.
-- ---------------------------------------------------------------------------
UPDATE invoice i
SET linked_agent = b.new_value, updated_at = now()
FROM linked_agent_resync_backup_20260728 b
WHERE b.table_name = 'invoice' AND b.row_id = i.id
  AND b.new_value IS NOT NULL AND i.linked_agent = b.old_value;

UPDATE payment p
SET linked_agent = b.new_value, updated_at = now()
FROM linked_agent_resync_backup_20260728 b
WHERE b.table_name = 'payment' AND b.row_id = p.id
  AND b.new_value IS NOT NULL AND p.linked_agent = b.old_value;

UPDATE submitted_payment s
SET linked_agent = b.new_value, updated_at = now()
FROM linked_agent_resync_backup_20260728 b
WHERE b.table_name = 'submitted_payment' AND b.row_id = s.id
  AND b.new_value IS NOT NULL AND s.linked_agent = b.old_value;

-- ---------------------------------------------------------------------------
-- 3. Post-conditions. Any failure here aborts the whole transaction.
--    Only asserts that every ROW WE TOUCHED landed on its intended value —
--    does not assert zero orphans remain overall (agents never imported as a
--    user at all are expected to stay unresolved).
-- ---------------------------------------------------------------------------
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM invoice i
  JOIN linked_agent_resync_backup_20260728 b ON b.table_name='invoice' AND b.row_id=i.id
  WHERE b.new_value IS NOT NULL AND i.linked_agent IS DISTINCT FROM b.new_value;
  IF bad <> 0 THEN RAISE EXCEPTION 'invoice: % rows did not land on intended value', bad; END IF;

  SELECT count(*) INTO bad FROM payment p
  JOIN linked_agent_resync_backup_20260728 b ON b.table_name='payment' AND b.row_id=p.id
  WHERE b.new_value IS NOT NULL AND p.linked_agent IS DISTINCT FROM b.new_value;
  IF bad <> 0 THEN RAISE EXCEPTION 'payment: % rows did not land on intended value', bad; END IF;

  SELECT count(*) INTO bad FROM submitted_payment s
  JOIN linked_agent_resync_backup_20260728 b ON b.table_name='submitted_payment' AND b.row_id=s.id
  WHERE b.new_value IS NOT NULL AND s.linked_agent IS DISTINCT FROM b.new_value;
  IF bad <> 0 THEN RAISE EXCEPTION 'submitted_payment: % rows did not land on intended value', bad; END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verification (run before AND after, read-only):
--   SELECT count(*) FROM invoice i WHERE i.linked_agent IS NOT NULL
--     AND EXISTS (SELECT 1 FROM "user" ru WHERE ru.linked_agent_profile = i.linked_agent AND ru.bubble_id <> i.linked_agent);
--   -- should be 0 after apply (no invoice left pointing at a raw id that has
--   -- a distinct real back-linked user it should have resolved to)
--
-- Rollback:
--   UPDATE invoice i SET linked_agent = b.old_value
--     FROM linked_agent_resync_backup_20260728 b
--     WHERE b.table_name='invoice' AND b.row_id=i.id AND i.linked_agent = b.new_value;
--   (same shape for payment / submitted_payment)
-- ============================================================================
