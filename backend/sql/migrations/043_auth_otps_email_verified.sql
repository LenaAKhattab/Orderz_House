-- 043: Email verification + OTP flows (register / forgot password)
-- Apply: npm run db:migrate

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE users SET email_verified = TRUE WHERE email_verified IS NOT TRUE;

COMMENT ON COLUMN users.email_verified IS 'FALSE until public signup verifies email via OTP.';

CREATE TABLE IF NOT EXISTS auth_otps (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('register', 'forgot_password')),
  otp_hash TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  reset_token_hash TEXT NULL,
  reset_token_expires_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,
  attempts_count INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_email_purpose
  ON auth_otps (lower(email), purpose);

CREATE INDEX IF NOT EXISTS idx_auth_otps_user_id
  ON auth_otps (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_otps_active_register
  ON auth_otps (lower(email))
  WHERE purpose = 'register' AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_otps_forgot_reset
  ON auth_otps (lower(email))
  WHERE purpose = 'forgot_password' AND consumed_at IS NULL;

COMMIT;
