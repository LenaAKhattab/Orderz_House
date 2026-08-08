-- 131_footer_contact_center_settings
-- Additive Contact Center (مركز التواصل) block for public footer CMS.
-- Defaults keep the block visible with Arabic copy; visibility never clears stored content.

BEGIN;

ALTER TABLE platform_ui_settings
  ADD COLUMN IF NOT EXISTS footer_contact_center_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_contact_center_helper_text TEXT NOT NULL DEFAULT 'للاقتراحات والشكاوى اضغط هنا',
  ADD COLUMN IF NOT EXISTS footer_contact_center_helper_text_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_contact_center_button_text TEXT NOT NULL DEFAULT 'مركز التواصل',
  ADD COLUMN IF NOT EXISTS footer_contact_center_button_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS footer_contact_center_url TEXT NOT NULL DEFAULT '/login';

UPDATE platform_ui_settings
SET
  footer_contact_center_visible = COALESCE(footer_contact_center_visible, TRUE),
  footer_contact_center_helper_text = COALESCE(NULLIF(TRIM(footer_contact_center_helper_text), ''), 'للاقتراحات والشكاوى اضغط هنا'),
  footer_contact_center_helper_text_visible = COALESCE(footer_contact_center_helper_text_visible, TRUE),
  footer_contact_center_button_text = COALESCE(NULLIF(TRIM(footer_contact_center_button_text), ''), 'مركز التواصل'),
  footer_contact_center_button_visible = COALESCE(footer_contact_center_button_visible, TRUE),
  footer_contact_center_url = COALESCE(NULLIF(TRIM(footer_contact_center_url), ''), '/login')
WHERE id = 1;

INSERT INTO schema_migrations (version)
VALUES ('131_footer_contact_center_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
