-- 047: User profile, billing hints, skills, social links, notification preferences (JSONB)
-- Apply: npm run db:migrate

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS avatar_public_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS professional_title VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS bio TEXT NULL,
  ADD COLUMN IF NOT EXISTS skills TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS website_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS github_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS behance_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS billing_name VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS billing_country VARCHAR(2) NULL,
  ADD COLUMN IF NOT EXISTS billing_city VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS billing_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS preferred_withdrawal_method VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS payout_notes_hint TEXT NULL,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.notification_preferences IS 'User notification toggles: orders, claims, courses, payments, offers, delivery, general';

COMMIT;
