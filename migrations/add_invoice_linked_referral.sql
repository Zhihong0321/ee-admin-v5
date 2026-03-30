ALTER TABLE IF EXISTS invoice
ADD COLUMN IF NOT EXISTS linked_referral text;
