-- 089: Main /plans shows the 5-tier public set; legacy canonical 1–3 move to /plans/client-offer.
-- Idempotent — no plan duplication, no deletes.

BEGIN;

-- Direct / manual client URL for the original 3 canonical subscription products.
INSERT INTO plan_pages (title, subtitle, slug, page_type, is_public, is_active, title_en, subtitle_en)
SELECT
  'عرض خاص للعملاء',
  'باقات الاشتراك الأساسية — رابط مباشر للعملاء',
  'client-offer',
  'special',
  TRUE,
  TRUE,
  'Client offer',
  'Core subscription packages — direct client link'
WHERE NOT EXISTS (
  SELECT 1 FROM plan_pages WHERE LOWER(slug) = 'client-offer' AND page_type = 'special'
);

UPDATE plan_pages
SET
  title = 'عرض خاص للعملاء',
  subtitle = 'باقات الاشتراك الأساسية — رابط مباشر للعملاء',
  title_en = 'Client offer',
  subtitle_en = 'Core subscription packages — direct client link',
  is_public = TRUE,
  is_active = TRUE,
  updated_at = NOW()
WHERE LOWER(slug) = 'client-offer'
  AND page_type = 'special';

-- Legacy canonical plans (ids 1–3) → client-offer page only (not on main /plans).
UPDATE plans p
SET
  plan_page_id = cp.id,
  updated_at = NOW()
FROM plan_pages cp
WHERE cp.page_type = 'special'
  AND LOWER(cp.slug) = 'client-offer'
  AND p.id = ANY(ARRAY[1::bigint, 2::bigint, 3::bigint])
  AND p.deleted_at IS NULL
  AND p.name IN ('orderzhouse_free', 'orderzhouse_50_jod', 'orderzhouse_platinum');

-- Main public 5-plan set → default /plans page.
UPDATE plans p
SET
  plan_page_id = dp.id,
  updated_at = NOW()
FROM plan_pages dp
WHERE dp.page_type = 'default'
  AND p.deleted_at IS NULL
  AND p.name IN (
    'freelancers_free',
    'freelancers_1_month',
    'freelancers_1_year',
    'freelancers_2_year',
    'freelancers_platinum'
  );

-- Default page hero copy matches the main public pricing page.
UPDATE plan_pages
SET
  title = 'اختر باقتك',
  subtitle = 'أفضل الباقات للمستقلين',
  title_en = 'Choose Your Plan',
  subtitle_en = 'Best plans for freelancers',
  is_active = TRUE,
  is_public = TRUE,
  updated_at = NOW()
WHERE page_type = 'default';

-- Retire /plans/freelancers to avoid duplicate public URLs (redirect handled in frontend).
UPDATE plan_pages
SET
  is_active = FALSE,
  is_public = FALSE,
  updated_at = NOW()
WHERE LOWER(slug) = 'freelancers'
  AND page_type = 'special';

INSERT INTO schema_migrations (version) VALUES ('089_remap_main_plans_and_client_offer')
ON CONFLICT (version) DO NOTHING;

COMMIT;
