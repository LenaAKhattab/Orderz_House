-- 092: Direct legacy 3-plan URL becomes /plans/flf (stored lowercase; routing is case-insensitive).
-- Same plan_page row and plans 1–3 — no duplication, no deletes.

BEGIN;

UPDATE plan_pages
SET
  slug = 'flf',
  title = 'باقات أوردرز هاوس للعمل الحر',
  subtitle = 'اختر الباقة المناسبة لنشاطك، قارن المزايا، وابدأ أو رقِّ اشتراكك من مكان واحد.',
  title_en = 'Orderz House freelance plans',
  subtitle_en = 'Choose the right plan for your work, compare features, and start or upgrade your subscription in one place.',
  is_public = TRUE,
  is_active = TRUE,
  updated_at = NOW()
WHERE LOWER(slug) = 'client-offer'
  AND page_type = 'special';

INSERT INTO schema_migrations (version) VALUES ('092_rename_client_offer_to_flf')
ON CONFLICT (version) DO NOTHING;

COMMIT;
