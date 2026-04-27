ALTER TABLE IF EXISTS "user"
  ADD COLUMN IF NOT EXISTS offer_letter text,
  ADD COLUMN IF NOT EXISTS employment_letter text;
