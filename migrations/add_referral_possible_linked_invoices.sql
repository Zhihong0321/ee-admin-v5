-- Scan cache for each referral lead. NULL = never scanned.
-- Array items: invoiceId, invoiceNumber, bubbleId, matchType ("phone" | "name").
-- The confirmed invoice stays in referral.linked_invoice.
ALTER TABLE referral
  ADD COLUMN IF NOT EXISTS possible_linked_invoices jsonb;

COMMENT ON COLUMN referral.possible_linked_invoices IS
  'Scan cache. NULL = never scanned. JSON array of up to 5 candidate invoices (invoiceId, invoiceNumber, bubbleId, matchType phone|name). Confirmed link stays in linked_invoice.';
