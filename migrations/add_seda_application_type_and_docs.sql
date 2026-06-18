ALTER TABLE seda_registration
  ADD COLUMN IF NOT EXISTS application_type text,
  ADD COLUMN IF NOT EXISTS tnb_bills_12_months text[],
  ADD COLUMN IF NOT EXISTS tnb_bills_12_months_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS tnb_bills_12_months_note text,
  ADD COLUMN IF NOT EXISTS ssm_form_9 text,
  ADD COLUMN IF NOT EXISTS ssm_form_49 text,
  ADD COLUMN IF NOT EXISTS director_ic_front text,
  ADD COLUMN IF NOT EXISTS director_ic_back text,
  ADD COLUMN IF NOT EXISTS commercial_docs_completed boolean;

COMMENT ON COLUMN seda_registration.application_type IS
  'SEDA registration category: residential, commercial, or selco.';

COMMENT ON COLUMN seda_registration.tnb_bills_12_months IS
  'Optional URLs for up to 12 months of TNB bills.';

COMMENT ON COLUMN seda_registration.ssm_form_9 IS
  'Commercial-only SSM Form 9 document URL.';

COMMENT ON COLUMN seda_registration.ssm_form_49 IS
  'Commercial-only SSM Form 49 document URL.';

COMMENT ON COLUMN seda_registration.director_ic_front IS
  'Commercial-only director IC front document URL.';

COMMENT ON COLUMN seda_registration.director_ic_back IS
  'Commercial-only director IC back document URL.';
