-- Adds a per-invoice customer segment: 'residential' | 'commercial' | 'factory'.
-- NULL = not yet classified (left blank on purpose; no CHECK constraint so no write is ever rejected).
-- Backfill rule: invoices with package_type = 'Residential' get 'residential'.
-- All other rows stay NULL until classified.
-- Applied to prod_main on 2026-11-18: 2,750 rows backfilled (2,731 not deleted).

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS customer_segment text;

UPDATE invoice
SET customer_segment = 'residential'
WHERE package_type = 'Residential'
  AND customer_segment IS NULL;
