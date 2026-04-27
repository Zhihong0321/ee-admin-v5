ALTER TABLE IF EXISTS "user"
  ADD COLUMN IF NOT EXISTS outsource_role text,
  ADD COLUMN IF NOT EXISTS outsource_parent_user_id integer,
  ADD COLUMN IF NOT EXISTS outsource_notes text;

CREATE INDEX IF NOT EXISTS idx_user_outsource_role
  ON "user" (outsource_role);

CREATE INDEX IF NOT EXISTS idx_user_outsource_parent_user_id
  ON "user" (outsource_parent_user_id);
