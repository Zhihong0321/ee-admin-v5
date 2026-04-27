CREATE TABLE IF NOT EXISTS department (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE IF EXISTS department
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'department' AND column_name = 'department_name'
  ) THEN
    EXECUTE 'UPDATE department
      SET name = COALESCE(NULLIF(name, ''''), department_name, bubble_id, ''Department #'' || id::text)
      WHERE name IS NULL OR name = ''''';
  ELSE
    EXECUTE 'UPDATE department
      SET name = COALESCE(NULLIF(name, ''''), ''Department #'' || id::text)
      WHERE name IS NULL OR name = ''''';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'department' AND column_name = 'created_date'
  ) THEN
    EXECUTE 'UPDATE department
      SET created_at = COALESCE(created_at, created_date, now())
      WHERE created_at IS NULL';
  ELSE
    EXECUTE 'UPDATE department
      SET created_at = COALESCE(created_at, now())
      WHERE created_at IS NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'department' AND column_name = 'modified_date'
  ) THEN
    EXECUTE 'UPDATE department
      SET updated_at = COALESCE(updated_at, modified_date, created_at, now())
      WHERE updated_at IS NULL';
  ELSE
    EXECUTE 'UPDATE department
      SET updated_at = COALESCE(updated_at, created_at, now())
      WHERE updated_at IS NULL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS department_member (
  id serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES department(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_department_member_unique_user
  ON department_member (department_id, user_id);

CREATE INDEX IF NOT EXISTS idx_department_member_department_id
  ON department_member (department_id);

CREATE INDEX IF NOT EXISTS idx_department_member_user_id
  ON department_member (user_id);

CREATE INDEX IF NOT EXISTS idx_department_member_role
  ON department_member (role);
