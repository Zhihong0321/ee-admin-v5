-- ============================================================================
-- MIGRATION: Allow native product/package records without Bubble IDs
-- ============================================================================
--
-- REASON:
-- New catalog records are now created natively in this system and may not have
-- a corresponding Bubble record. `bubble_id` should remain unique when present,
-- but it should no longer be required for `product` and `package`.
--
-- DATE: 2026-04-13
-- ============================================================================

BEGIN;

ALTER TABLE product
  ALTER COLUMN bubble_id DROP NOT NULL;

ALTER TABLE package
  ALTER COLUMN bubble_id DROP NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- SELECT table_name, column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('product', 'package')
--   AND column_name = 'bubble_id';
