-- 129_footer_contact_working_hours_settings
-- Additive footer contact + working-hours fields (reuses existing app-download columns).

BEGIN;

ALTER TABLE platform_ui_settings
  ADD COLUMN IF NOT EXISTS footer_contact_phone TEXT NOT NULL DEFAULT '+971 522857808',
  ADD COLUMN IF NOT EXISTS footer_contact_email TEXT NOT NULL DEFAULT 'info@orderzhouse.com',
  ADD COLUMN IF NOT EXISTS footer_contact_whatsapp TEXT NOT NULL DEFAULT '+971 522857808',
  ADD COLUMN IF NOT EXISTS footer_contact_location TEXT NOT NULL DEFAULT 'الإمارات العربية المتحدة، دبي',
  ADD COLUMN IF NOT EXISTS footer_working_hours_title TEXT NOT NULL DEFAULT 'ساعات العمل',
  ADD COLUMN IF NOT EXISTS footer_working_hours_text TEXT NOT NULL DEFAULT 'نعمل على مدار الساعة لخدمتك';

UPDATE platform_ui_settings
SET
  footer_contact_phone = COALESCE(NULLIF(TRIM(footer_contact_phone), ''), '+971 522857808'),
  footer_contact_email = COALESCE(NULLIF(TRIM(footer_contact_email), ''), 'info@orderzhouse.com'),
  footer_contact_whatsapp = COALESCE(NULLIF(TRIM(footer_contact_whatsapp), ''), '+971 522857808'),
  footer_contact_location = COALESCE(NULLIF(TRIM(footer_contact_location), ''), 'الإمارات العربية المتحدة، دبي'),
  footer_working_hours_title = COALESCE(NULLIF(TRIM(footer_working_hours_title), ''), 'ساعات العمل'),
  footer_working_hours_text = COALESCE(NULLIF(TRIM(footer_working_hours_text), ''), 'نعمل على مدار الساعة لخدمتك')
WHERE id = 1;

INSERT INTO schema_migrations (version)
VALUES ('129_footer_contact_working_hours_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
