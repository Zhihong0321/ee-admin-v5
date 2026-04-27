CREATE TABLE IF NOT EXISTS department (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

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
