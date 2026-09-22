-- ============================================================================
-- referral.linked_agent: repoint raw-integer user.id refs to user.bubble_id
-- Date: 2026-09-14
-- Status: NOT APPLIED — prepared for review. Run only after re-checking the
--         counts below against current prod, and only with approval.
--
-- WHY
--   The referral page resolves the assigned agent through
--   src/lib/agent-identity.ts, which historically matched `user.bubble_id` only.
--   Since 2026-07-22 whatever creates referral leads in Bubble has been writing
--   the integer `user.id` into `referral.linked_agent` instead of a bubble_id, so
--   every recent lead rendered as "Unassigned" / "unknown agent".
--
--   Verified read-only against prod_main on 2026-09-14:
--     referral rows                      407
--     linked_agent blank                 167   (genuinely unassigned)
--     linked_agent = user.bubble_id      160   (resolves fine, untouched here)
--     linked_agent = raw integer          80   (all 80 match a user.id, 0 ambiguous,
--                                               0 also matching any user.bubble_id)
--     most recent page of 50 leads         0   resolved a name -> the reported bug
--
--   The application now resolves BOTH keyspaces on read and normalises on write,
--   so this backfill is cleanup, not the fix. Read the header of
--   src/lib/agent-identity.ts before changing either side.
--
-- NOT IN SCOPE
--   The Bubble workflow that writes the integer. Until that is changed, new rows
--   keep arriving in the integer keyspace and this script has to be re-runnable —
--   the same lesson as migrations/2026-07-28-repoint-linked-agent-again.sql.
--   `agent.id` is deliberately never used as a resolution source: 15 of the 18
--   distinct integers here also exist as an agent.id and mostly name a DIFFERENT
--   person, which is exactly how the earlier identity work went wrong.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS referral_linked_agent_identity_backup_20260914 (
  backup_id        bigserial PRIMARY KEY,
  backed_up_at     timestamptz NOT NULL DEFAULT now(),
  referral_id      integer NOT NULL,
  referral_bubble_id text,
  old_linked_agent text,
  new_linked_agent text NOT NULL,
  resolved_name    text
);

-- ---------------------------------------------------------------------------
-- 1. Back up exactly the rows this script will change. The join is on the
--    integer keyspace only, and rows that already resolve as a bubble_id are
--    excluded, so the 160 good rows can never be touched by the UPDATE below.
-- ---------------------------------------------------------------------------
INSERT INTO referral_linked_agent_identity_backup_20260914
  (referral_id, referral_bubble_id, old_linked_agent, new_linked_agent, resolved_name)
SELECT
  r.id,
  r.bubble_id,
  r.linked_agent,
  u.bubble_id,
  u.name
FROM referral r
JOIN "user" u ON CAST(u.id AS TEXT) = btrim(r.linked_agent)
WHERE r.linked_agent ~ '^[0-9]+$'
  AND NOT EXISTS (SELECT 1 FROM "user" u2 WHERE u2.bubble_id = btrim(r.linked_agent))
  AND u.bubble_id IS NOT NULL AND btrim(u.bubble_id) <> '';

-- ---------------------------------------------------------------------------
-- 2. Apply. updated_at is deliberately NOT bumped: this is a keyspace
--    correction, not a user edit, and the "Updated" column plus Bubble's
--    incremental sync both key off that timestamp.
-- ---------------------------------------------------------------------------
UPDATE referral r
SET linked_agent = b.new_linked_agent
FROM referral_linked_agent_identity_backup_20260914 b
WHERE b.referral_id = r.id
  AND r.linked_agent = b.old_linked_agent;

-- ---------------------------------------------------------------------------
-- 3. Post-conditions. Any failure aborts the whole transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM referral r
  JOIN referral_linked_agent_identity_backup_20260914 b ON b.referral_id = r.id
  WHERE r.linked_agent <> b.new_linked_agent;
  IF bad <> 0 THEN RAISE EXCEPTION 'referral: % rows did not land on the intended bubble_id', bad; END IF;

  SELECT count(*) INTO bad
  FROM referral r
  WHERE r.linked_agent ~ '^[0-9]+$'
    AND NOT EXISTS (SELECT 1 FROM "user" u2 WHERE u2.bubble_id = btrim(r.linked_agent));
  IF bad <> 0 THEN RAISE EXCEPTION 'referral.linked_agent: % raw integers remain', bad; END IF;
END $$;

COMMIT;

-- ============================================================================
-- Re-run these BEFORE applying (counts will have moved if new leads arrived)
-- and AFTER (the first must be 0, the second must equal the number repointed):
--   SELECT count(*) FROM referral WHERE linked_agent ~ '^[0-9]+$';
--   SELECT count(*) FROM referral r WHERE btrim(coalesce(r.linked_agent,'')) <> ''
--     AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.bubble_id = r.linked_agent);
--
-- Spot check that the page now resolves every assigned lead:
--   SELECT count(*) FILTER (WHERE linked_agent IS NOT NULL AND btrim(linked_agent) <> '') AS assigned,
--          count(*) FILTER (WHERE linked_agent IS NOT NULL AND btrim(linked_agent) <> ''
--            AND (SELECT u.name FROM "user" u WHERE u.bubble_id = r.linked_agent) IS NOT NULL) AS named
--   FROM referral r;
--
-- Rollback:
--   UPDATE referral r SET linked_agent = b.old_linked_agent
--     FROM referral_linked_agent_identity_backup_20260914 b
--     WHERE b.referral_id = r.id AND r.linked_agent = b.new_linked_agent;
-- ============================================================================
