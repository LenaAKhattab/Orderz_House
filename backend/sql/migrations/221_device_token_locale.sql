-- 221_device_token_locale
-- Language of the app install that owns a push token ('ar' | 'en'), so FCM lock-screen text can be sent
-- in the language the user chose in the Android app. NULL = unknown → Arabic (previous behaviour).
--
-- Additive only. Rollback is an ops step outside this file: remove the locale column and clear
-- schema_migrations row 221_device_token_locale.

BEGIN;

ALTER TABLE user_device_tokens
  ADD COLUMN IF NOT EXISTS locale VARCHAR(5) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_device_tokens_locale_chk'
  ) THEN
    ALTER TABLE user_device_tokens
      ADD CONSTRAINT user_device_tokens_locale_chk CHECK (locale IS NULL OR locale IN ('ar', 'en'));
  END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('221_device_token_locale')
ON CONFLICT (version) DO NOTHING;

COMMIT;
