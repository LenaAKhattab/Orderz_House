-- 058_content_ads_last_clicked
-- Track last public click time for admin analytics (optional column).

BEGIN;

ALTER TABLE content_ads
  ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ NULL;

INSERT INTO schema_migrations (version)
VALUES ('058_content_ads_last_clicked')
ON CONFLICT (version) DO NOTHING;

COMMIT;
