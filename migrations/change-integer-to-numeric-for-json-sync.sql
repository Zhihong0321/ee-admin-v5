-- ============================================================================
-- MIGRATION: Change integer columns to numeric for JSON sync compatibility
-- ============================================================================
--
-- REASON: JSON sync should treat JSON as source of truth. If JSON contains
-- decimal values (e.g., "1.2"), the database should accept them. Previous
-- schema used integer type which rejected decimal values.
--
-- AFFECTED TABLES:
-- 1. payment table: payment_index, epp_month, bank_charges
-- 2. submitted_payment table: payment_index, epp_month, bank_charges  
-- 3. invoice_item table: qty, epp, sort
--
-- DATE: 2026-01-25
-- ============================================================================

BEGIN;

-- ============================================================================
-- PAYMENT TABLE
-- ============================================================================
ALTER TABLE payment 
  ALTER COLUMN payment_index TYPE numeric USING payment_index::numeric,
  ALTER COLUMN epp_month TYPE numeric USING epp_month::numeric,
  ALTER COLUMN bank_charges TYPE numeric USING bank_charges::numeric;

-- ============================================================================
-- SUBMITTED_PAYMENT TABLE
-- ============================================================================
ALTER TABLE submitted_payment 
  ALTER COLUMN payment_index TYPE numeric USING payment_index::numeric,
  ALTER COLUMN epp_month TYPE numeric USING epp_month::numeric,
  ALTER COLUMN bank_charges TYPE numeric USING bank_charges::numeric;

-- ============================================================================
-- INVOICE_ITEM TABLE
-- ============================================================================
ALTER TABLE invoice_item 
  ALTER COLUMN qty TYPE numeric USING qty::numeric,
  ALTER COLUMN epp TYPE numeric USING epp::numeric,
  ALTER COLUMN sort TYPE numeric USING sort::numeric;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
-- To verify the column types have been changed:
-- 
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('payment', 'submitted_payment', 'invoice_item')
--   AND column_name IN ('payment_index', 'epp_month', 'bank_charges', 'qty', 'epp', 'sort')
-- ORDER BY table_name, column_name;
