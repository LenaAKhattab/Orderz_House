-- 128_footer_app_download_settings
-- Super Admin editable footer app-download title + store URLs (additive).

BEGIN;

ALTER TABLE platform_ui_settings
  ADD COLUMN IF NOT EXISTS footer_app_download_title_ar TEXT NOT NULL DEFAULT 'تحميل التطبيق',
  ADD COLUMN IF NOT EXISTS footer_app_download_title_en TEXT NOT NULL DEFAULT 'Download the app',
  ADD COLUMN IF NOT EXISTS footer_google_play_url TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.orderzhouse.app',
  ADD COLUMN IF NOT EXISTS footer_app_store_url TEXT NOT NULL DEFAULT 'https://apps.apple.com/ae/app/orderzhouse/id6762045683';

UPDATE platform_ui_settings
SET
  footer_app_download_title_ar = COALESCE(NULLIF(TRIM(footer_app_download_title_ar), ''), 'تحميل التطبيق'),
  footer_app_download_title_en = COALESCE(NULLIF(TRIM(footer_app_download_title_en), ''), 'Download the app'),
  footer_google_play_url = COALESCE(
    NULLIF(TRIM(footer_google_play_url), ''),
    'https://play.google.com/store/apps/details?id=com.orderzhouse.app'
  ),
  footer_app_store_url = COALESCE(
    NULLIF(TRIM(footer_app_store_url), ''),
    'https://apps.apple.com/ae/app/orderzhouse/id6762045683'
  )
WHERE id = 1;

INSERT INTO schema_migrations (version)
VALUES ('128_footer_app_download_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
