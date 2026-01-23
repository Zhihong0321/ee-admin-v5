-- Migration: Add percent_of_total_amount back to invoice table
-- Date: 2026-01-23
-- Reason: This field exists in Bubble and needs to be synced

-- Start transaction for safety
BEGIN;

-- Add percent_of_total_amount column back
-- It's a calculated field: (total_paid / total_amount) * 100
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS percent_of_total_amount numeric DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN invoice.percent_of_total_amount IS 'Payment percentage: (sum of all linked payments / total_amount) * 100. Synced from Bubble.';

-- Commit the changes
COMMIT;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'invoice'
  AND column_name = 'percent_of_total_amount';
