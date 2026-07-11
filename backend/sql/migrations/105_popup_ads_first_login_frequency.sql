-- 105_popup_ads_first_login_frequency
-- Allow first-login-only popup ad frequency.

BEGIN;

ALTER TABLE popup_ads DROP CONSTRAINT IF EXISTS popup_ads_frequency_chk;

ALTER TABLE popup_ads ADD CONSTRAINT popup_ads_frequency_chk CHECK (
  frequency IN ('every_visit', 'session', 'day', 'first_login_only')
);

INSERT INTO schema_migrations (version)
VALUES ('105_popup_ads_first_login_frequency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
