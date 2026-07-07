-- Migration 108: financial_user role + financial_people account metadata
BEGIN;

ALTER TABLE financial_people
  ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMPTZ NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('super_admin', 'admin', 'client', 'freelancer', 'financial_user')
);

INSERT INTO roles (name, display_name, description, is_system)
VALUES (
  'financial_user',
  'مستخدم مالي',
  'موظف/شخص مالي — يطلع على بونصاته فقط.',
  TRUE
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('108_financial_user_role')
ON CONFLICT (version) DO NOTHING;
