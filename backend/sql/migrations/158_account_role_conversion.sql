-- 158: one-time account role conversion flag (freelancer ↔ client)
-- Additive only. Does not flip roles or delete data.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_converted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN users.role_converted_at IS
  'Set once when the user self-converts between freelancer and client; blocks further conversions.';
