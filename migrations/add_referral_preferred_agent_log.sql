ALTER TABLE IF EXISTS referral
ADD COLUMN IF NOT EXISTS preferred_agent_log text;
