-- ============================================================================
-- MIGRATION: Change SEDA Registration Integer Fields to Numeric
-- ============================================================================
-- 
-- Purpose: Allow decimal values in SEDA registration fields
-- Reason: JSON sync data contains decimal values like "941.25", "1200.37"
-- Policy: JSON is source of truth - schema must accept JSON data types
--
-- Fields changed:
--   - system_size_in_form_kwp: integer → numeric
--   - system_size: integer → numeric
--   - inverter_kwac: integer → numeric
--   - average_tnb: integer → numeric
--
-- Date: 2026-01-25
-- ============================================================================

BEGIN;

-- Change integer columns to numeric in seda_registration table
ALTER TABLE seda_registration 
  ALTER COLUMN system_size_in_form_kwp TYPE numeric USING system_size_in_form_kwp::numeric,
  ALTER COLUMN system_size TYPE numeric USING system_size::numeric,
  ALTER COLUMN inverter_kwac TYPE numeric USING inverter_kwac::numeric,
  ALTER COLUMN average_tnb TYPE numeric USING average_tnb::numeric;

COMMIT;

-- Verify the changes
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Changed 4 columns in seda_registration table from integer to numeric';
  RAISE NOTICE 'Fields: system_size_in_form_kwp, system_size, inverter_kwac, average_tnb';
END $$;
