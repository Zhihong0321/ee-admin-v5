ALTER TABLE IF EXISTS invoice
ADD COLUMN IF NOT EXISTS referral_commission_paid_amount numeric(12, 2) NOT NULL DEFAULT 0;
