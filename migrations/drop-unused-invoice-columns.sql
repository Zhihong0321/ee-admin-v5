-- Migration: Drop unused/confusing columns from invoice table
-- Date: 2026-01-19
-- Reason: These columns are not synced from Bubble and are confusing developers

-- Start transaction for safety
BEGIN;

-- Drop derived ID columns (not synced - derived from linked_customer/linked_agent)
ALTER TABLE invoice DROP COLUMN IF EXISTS customer_id;
ALTER TABLE invoice DROP COLUMN IF EXISTS agent_id;

-- Drop snapshot columns (not synced - computed fields)
ALTER TABLE invoice DROP COLUMN IF EXISTS customer_name_snapshot;
ALTER TABLE invoice DROP COLUMN IF EXISTS customer_address_snapshot;
ALTER TABLE invoice DROP COLUMN IF EXISTS customer_phone_snapshot;
ALTER TABLE invoice DROP COLUMN IF EXISTS customer_email_snapshot;
ALTER TABLE invoice DROP COLUMN IF EXISTS agent_name_snapshot;

-- Drop financial columns (not synced - not in Bubble)
ALTER TABLE invoice DROP COLUMN IF EXISTS subtotal;
ALTER TABLE invoice DROP COLUMN IF EXISTS sst_rate;
ALTER TABLE invoice DROP COLUMN IF EXISTS sst_amount;
ALTER TABLE invoice DROP COLUMN IF EXISTS discount_amount;
ALTER TABLE invoice DROP COLUMN IF EXISTS voucher_amount;
ALTER TABLE invoice DROP COLUMN IF EXISTS percent_of_total_amount;
ALTER TABLE invoice DROP COLUMN IF EXISTS due_date;

-- Commit the changes
COMMIT;

-- Verify the changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'invoice'
ORDER BY ordinal_position;
