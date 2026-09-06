-- 130_footer_visibility_settings
-- Additive section + element visibility flags for public footer CMS.
-- Defaults TRUE so existing production footers stay visible after rollout.
-- Visibility never clears stored content values.

BEGIN;

ALTER TABLE platform_ui_settings
  ADD COLUMN IF NOT EXISTS footer_contact_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_contact_phone_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_contact_email_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_contact_whatsapp_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_contact_location_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_working_hours_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_working_hours_title_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_working_hours_text_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_app_download_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_app_download_title_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_google_play_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_app_store_visible BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE platform_ui_settings
SET
  footer_contact_visible = COALESCE(footer_contact_visible, TRUE),
  footer_contact_phone_visible = COALESCE(footer_contact_phone_visible, TRUE),
  footer_contact_email_visible = COALESCE(footer_contact_email_visible, TRUE),
  footer_contact_whatsapp_visible = COALESCE(footer_contact_whatsapp_visible, TRUE),
  footer_contact_location_visible = COALESCE(footer_contact_location_visible, TRUE),
  footer_working_hours_visible = COALESCE(footer_working_hours_visible, TRUE),
  footer_working_hours_title_visible = COALESCE(footer_working_hours_title_visible, TRUE),
  footer_working_hours_text_visible = COALESCE(footer_working_hours_text_visible, TRUE),
  footer_app_download_visible = COALESCE(footer_app_download_visible, TRUE),
  footer_app_download_title_visible = COALESCE(footer_app_download_title_visible, TRUE),
  footer_google_play_visible = COALESCE(footer_google_play_visible, TRUE),
  footer_app_store_visible = COALESCE(footer_app_store_visible, TRUE)
WHERE id = 1;

INSERT INTO schema_migrations (version)
VALUES ('130_footer_visibility_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
