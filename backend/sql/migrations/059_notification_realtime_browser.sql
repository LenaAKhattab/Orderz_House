-- 059_notification_realtime_browser
-- Browser notification permission state + one-time prompt tracking.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS browser_notification_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notification_prompt_answered_at TIMESTAMPTZ NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_browser_notification_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_browser_notification_status_check
  CHECK (browser_notification_status IN ('pending', 'accepted', 'rejected'));

COMMENT ON COLUMN users.browser_notification_status IS 'pending | accepted | rejected — website push permission choice';
COMMENT ON COLUMN users.notification_prompt_answered_at IS 'When user answered the in-app browser notification prompt (once)';

INSERT INTO schema_migrations (version)
VALUES ('059_notification_realtime_browser')
ON CONFLICT (version) DO NOTHING;

COMMIT;
