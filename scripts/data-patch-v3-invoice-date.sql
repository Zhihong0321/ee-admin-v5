-- Data Patch v3: Fill invoice_date with created_at date
-- This patch updates all NULL invoice_date fields with the created_at timestamp
-- Issue: Bubble's "Invoice Date" field is undefined for many invoices
-- Solution: Use created_at (from Bubble's "Created Date") as fallback

-- Step 1: Check how many records need patching
SELECT
  COUNT(*) as total_invoices,
  COUNT(invoice_date) as has_invoice_date,
  COUNT(*) - COUNT(invoice_date) as null_invoice_date
FROM invoice;

-- Step 2: Show sample of affected records
SELECT
  bubble_id,
  invoice_id,
  invoice_date,
  created_at,
  modified_date
FROM invoice
WHERE invoice_date IS NULL
LIMIT 10;

-- Step 3: Apply the patch (UNCOMMENT TO RUN)
-- UPDATE invoice
-- SET invoice_date = created_at
-- WHERE invoice_date IS NULL;

-- Step 4: Verify the patch
-- SELECT
--   COUNT(*) as patched_records,
--   MIN(invoice_date) as earliest_date,
--   MAX(invoice_date) as latest_date
-- FROM invoice
-- WHERE invoice_date IS NOT NULL;
