-- Fresh database: full users schema for authentication.
-- If upgrading from an older `users` table, back up data and migrate or drop the table before re-running.

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  account_id CHAR(10) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  father_name VARCHAR(80) NOT NULL,
  family_name VARCHAR(80) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('super_admin', 'admin', 'client', 'freelancer')),
  country VARCHAR(2) NOT NULL CHECK (char_length(country) = 2),
  phone VARCHAR(30) NOT NULL,
  whatsapp VARCHAR(30) NOT NULL,
  gender VARCHAR(24) NOT NULL CHECK (gender IN ('ذكر', 'أنثى')),
  terms_accepted BOOLEAN NOT NULL,
  freelancer_categories TEXT[] NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
