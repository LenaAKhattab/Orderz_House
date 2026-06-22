-- 088: Freelancers pricing page plans (/plans/freelancers).
-- Four new page-specific tiers (Free, 1 month, 1 year, 2 year) plus a Platinum display row
-- that reuses canonical plan id=3 via subscription_plan_id (no duplicate Platinum product).

BEGIN;

ALTER TABLE plan_pages
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS subtitle_en TEXT NULL;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS description_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS label_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS billing_text_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS button_text_en TEXT NULL;

ALTER TABLE plan_features
  ADD COLUMN IF NOT EXISTS feature_text_en TEXT NULL;

INSERT INTO plan_pages (title, subtitle, slug, page_type, is_public, is_active, title_en, subtitle_en)
SELECT
  'اختر باقتك',
  'أفضل الباقات للمستقلين',
  'freelancers',
  'special',
  TRUE,
  TRUE,
  'Choose Your Plan',
  'Best Plans For FreeLancer'
WHERE NOT EXISTS (
  SELECT 1 FROM plan_pages WHERE LOWER(slug) = 'freelancers' AND page_type = 'special'
);

UPDATE plan_pages
SET
  title = 'اختر باقتك',
  subtitle = 'أفضل الباقات للمستقلين',
  title_en = 'Choose Your Plan',
  subtitle_en = 'Best Plans For FreeLancer',
  is_active = TRUE,
  is_public = TRUE,
  updated_at = NOW()
WHERE LOWER(slug) = 'freelancers'
  AND page_type = 'special';

-- 1) Free display — subscription resolves to canonical orderzhouse_free (id=1).
INSERT INTO plans (
  name, title, title_en, description, description_en,
  duration_days, price_jod, stripe_checkout_amount_jod,
  requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
  plan_page_id, subscription_plan_id,
  label, label_en, billing_text, billing_text_en,
  button_text, button_text_en, currency,
  admin_notes
) VALUES (
  'freelancers_free',
  'المجاني', 'Free',
  'مثالي للبداية', 'Perfect for getting started',
  365, 0, NULL,
  FALSE, FALSE, TRUE, TRUE, 10,
  (SELECT id FROM plan_pages WHERE LOWER(slug) = 'freelancers' AND page_type = 'special' LIMIT 1),
  1,
  'Basic', 'Basic',
  'مجاني', 'Free',
  'اختر الباقة', 'Choose Plan',
  'JOD',
  'Freelancers page display plan — subscription resolves to canonical orderzhouse_free (id=1).'
)
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  title_en = EXCLUDED.title_en,
  description = EXCLUDED.description,
  description_en = EXCLUDED.description_en,
  duration_days = EXCLUDED.duration_days,
  price_jod = EXCLUDED.price_jod,
  stripe_checkout_amount_jod = EXCLUDED.stripe_checkout_amount_jod,
  requires_company_visit = EXCLUDED.requires_company_visit,
  self_subscribe_allowed = EXCLUDED.self_subscribe_allowed,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  plan_page_id = EXCLUDED.plan_page_id,
  subscription_plan_id = EXCLUDED.subscription_plan_id,
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  billing_text = EXCLUDED.billing_text,
  billing_text_en = EXCLUDED.billing_text_en,
  button_text = EXCLUDED.button_text,
  button_text_en = EXCLUDED.button_text_en,
  currency = EXCLUDED.currency,
  admin_notes = EXCLUDED.admin_notes,
  deleted_at = NULL,
  updated_at = NOW()
WHERE plans.name = 'freelancers_free';

-- 2) 1 month — page-specific subscription product (20 JOD).
INSERT INTO plans (
  name, title, title_en, description, description_en,
  duration_days, price_jod, stripe_checkout_amount_jod,
  requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
  plan_page_id, subscription_plan_id,
  label, label_en, billing_text, billing_text_en,
  button_text, button_text_en, currency,
  admin_notes
) VALUES (
  'freelancers_1_month',
  'شهر واحد', '1 month',
  'أفضل قيمة للمحترفين', 'Best value for professionals',
  30, 20, NULL,
  FALSE, TRUE, TRUE, TRUE, 20,
  (SELECT id FROM plan_pages WHERE LOWER(slug) = 'freelancers' AND page_type = 'special' LIMIT 1),
  NULL,
  'Advance', 'Advance',
  'شهر واحد', '1 month',
  'اختر الباقة', 'Choose Plan',
  'JOD',
  'Freelancers page subscription tier — Stripe checkout uses price_jod (dynamic price_data).'
)
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  title_en = EXCLUDED.title_en,
  description = EXCLUDED.description,
  description_en = EXCLUDED.description_en,
  duration_days = EXCLUDED.duration_days,
  price_jod = EXCLUDED.price_jod,
  stripe_checkout_amount_jod = EXCLUDED.stripe_checkout_amount_jod,
  requires_company_visit = EXCLUDED.requires_company_visit,
  self_subscribe_allowed = EXCLUDED.self_subscribe_allowed,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  plan_page_id = EXCLUDED.plan_page_id,
  subscription_plan_id = EXCLUDED.subscription_plan_id,
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  billing_text = EXCLUDED.billing_text,
  billing_text_en = EXCLUDED.billing_text_en,
  button_text = EXCLUDED.button_text,
  button_text_en = EXCLUDED.button_text_en,
  currency = EXCLUDED.currency,
  admin_notes = EXCLUDED.admin_notes,
  deleted_at = NULL,
  updated_at = NOW()
WHERE plans.name = 'freelancers_1_month';

-- 3) 1 year — page-specific subscription product (45 JOD), marked popular.
INSERT INTO plans (
  name, title, title_en, description, description_en,
  duration_days, price_jod, stripe_checkout_amount_jod,
  requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
  plan_page_id, subscription_plan_id,
  label, label_en, billing_text, billing_text_en,
  button_text, button_text_en, currency,
  is_popular, offer_label,
  admin_notes
) VALUES (
  'freelancers_1_year',
  'سنة واحدة', '1 Year',
  'الخيار الأكثر شيوعاً', 'Most popular choice',
  365, 45, NULL,
  FALSE, TRUE, TRUE, TRUE, 30,
  (SELECT id FROM plan_pages WHERE LOWER(slug) = 'freelancers' AND page_type = 'special' LIMIT 1),
  NULL,
  'Premium', 'Premium',
  'سنة واحدة', '1 Year',
  'اختر الباقة', 'Choose Plan',
  'JOD',
  TRUE, 'Popular',
  'Freelancers page subscription tier — Stripe checkout uses price_jod (dynamic price_data).'
)
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  title_en = EXCLUDED.title_en,
  description = EXCLUDED.description,
  description_en = EXCLUDED.description_en,
  duration_days = EXCLUDED.duration_days,
  price_jod = EXCLUDED.price_jod,
  stripe_checkout_amount_jod = EXCLUDED.stripe_checkout_amount_jod,
  requires_company_visit = EXCLUDED.requires_company_visit,
  self_subscribe_allowed = EXCLUDED.self_subscribe_allowed,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  plan_page_id = EXCLUDED.plan_page_id,
  subscription_plan_id = EXCLUDED.subscription_plan_id,
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  billing_text = EXCLUDED.billing_text,
  billing_text_en = EXCLUDED.billing_text_en,
  button_text = EXCLUDED.button_text,
  button_text_en = EXCLUDED.button_text_en,
  currency = EXCLUDED.currency,
  is_popular = EXCLUDED.is_popular,
  offer_label = EXCLUDED.offer_label,
  admin_notes = EXCLUDED.admin_notes,
  deleted_at = NULL,
  updated_at = NOW()
WHERE plans.name = 'freelancers_1_year';

-- 4) 2 year — page-specific subscription product (65 JOD).
INSERT INTO plans (
  name, title, title_en, description, description_en,
  duration_days, price_jod, stripe_checkout_amount_jod,
  requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
  plan_page_id, subscription_plan_id,
  label, label_en, billing_text, billing_text_en,
  button_text, button_text_en, currency,
  admin_notes
) VALUES (
  'freelancers_2_year',
  'سنتان', '2 Year',
  'أقصى قيمة للمحترفين الجادين', 'Maximum value for serious professionals',
  730, 65, NULL,
  FALSE, TRUE, TRUE, TRUE, 40,
  (SELECT id FROM plan_pages WHERE LOWER(slug) = 'freelancers' AND page_type = 'special' LIMIT 1),
  NULL,
  'Pro+', 'Pro+',
  'سنتان', '2 Year',
  'اختر الباقة', 'Choose Plan',
  'JOD',
  'Freelancers page subscription tier — Stripe checkout uses price_jod (dynamic price_data).'
)
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  title_en = EXCLUDED.title_en,
  description = EXCLUDED.description,
  description_en = EXCLUDED.description_en,
  duration_days = EXCLUDED.duration_days,
  price_jod = EXCLUDED.price_jod,
  stripe_checkout_amount_jod = EXCLUDED.stripe_checkout_amount_jod,
  requires_company_visit = EXCLUDED.requires_company_visit,
  self_subscribe_allowed = EXCLUDED.self_subscribe_allowed,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  plan_page_id = EXCLUDED.plan_page_id,
  subscription_plan_id = EXCLUDED.subscription_plan_id,
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  billing_text = EXCLUDED.billing_text,
  billing_text_en = EXCLUDED.billing_text_en,
  button_text = EXCLUDED.button_text,
  button_text_en = EXCLUDED.button_text_en,
  currency = EXCLUDED.currency,
  admin_notes = EXCLUDED.admin_notes,
  deleted_at = NULL,
  updated_at = NOW()
WHERE plans.name = 'freelancers_2_year';

-- 5) Platinum display — reuses canonical orderzhouse_platinum (id=3) for checkout/subscription.
INSERT INTO plans (
  name, title, title_en, description, description_en,
  duration_days, price_jod, stripe_checkout_amount_jod,
  requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
  plan_page_id, subscription_plan_id,
  label, label_en, billing_text, billing_text_en,
  button_text, button_text_en, currency,
  payment_notes, installment_plan, is_featured,
  admin_notes
)
SELECT
  'freelancers_platinum',
  p.title, 'Platinum',
  p.description, 'Digital freelance operations diploma — full year on the platform',
  p.duration_days, p.price_jod, p.stripe_checkout_amount_jod,
  p.requires_company_visit, p.self_subscribe_allowed, TRUE, TRUE, 50,
  (SELECT id FROM plan_pages WHERE LOWER(slug) = 'freelancers' AND page_type = 'special' LIMIT 1),
  3,
  'Platinum', 'Platinum',
  'سنة واحدة', '1 Year',
  'اختر الباقة', 'Choose Plan',
  COALESCE(p.currency, 'JOD'),
  p.payment_notes, p.installment_plan, TRUE,
  'Freelancers page display plan — checkout/subscription resolves to canonical orderzhouse_platinum (id=3).'
FROM plans p
WHERE p.id = 3 AND p.name = 'orderzhouse_platinum' AND p.deleted_at IS NULL
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  title_en = EXCLUDED.title_en,
  description = EXCLUDED.description,
  description_en = EXCLUDED.description_en,
  duration_days = EXCLUDED.duration_days,
  price_jod = EXCLUDED.price_jod,
  stripe_checkout_amount_jod = EXCLUDED.stripe_checkout_amount_jod,
  requires_company_visit = EXCLUDED.requires_company_visit,
  self_subscribe_allowed = EXCLUDED.self_subscribe_allowed,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  plan_page_id = EXCLUDED.plan_page_id,
  subscription_plan_id = EXCLUDED.subscription_plan_id,
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  billing_text = EXCLUDED.billing_text,
  billing_text_en = EXCLUDED.billing_text_en,
  button_text = EXCLUDED.button_text,
  button_text_en = EXCLUDED.button_text_en,
  currency = EXCLUDED.currency,
  payment_notes = EXCLUDED.payment_notes,
  installment_plan = EXCLUDED.installment_plan,
  is_featured = EXCLUDED.is_featured,
  admin_notes = EXCLUDED.admin_notes,
  deleted_at = NULL,
  updated_at = NOW()
WHERE plans.name = 'freelancers_platinum';

DELETE FROM plan_features pf
USING plans p
WHERE pf.plan_id = p.id
  AND p.name IN (
    'freelancers_free',
    'freelancers_1_month',
    'freelancers_1_year',
    'freelancers_2_year'
  );

INSERT INTO plan_features (plan_id, feature_text, feature_text_en, sort_order, is_included)
SELECT p.id, f.feature_text, f.feature_text_en, f.sort_order, TRUE
FROM (VALUES
  ('freelancers_free', 'حد الأرباح: 100 بالشهر الواحد', 'Earn Limit: 100 per month', 0),
  ('freelancers_free', 'مثالي للبداية', 'Perfect for getting started', 1),
  ('freelancers_1_month', 'حد الأرباح: غير محدود', 'Earn Limit: Unlimited', 0),
  ('freelancers_1_month', 'أفضل قيمة للمحترفين', 'Best value for professionals', 1),
  ('freelancers_1_year', 'حد الأرباح: غير محدود', 'Earn Limit: Unlimited', 0),
  ('freelancers_1_year', 'الخيار الأكثر شيوعاً', 'Most popular choice', 1),
  ('freelancers_2_year', 'حد الأرباح: غير محدود', 'Earn Limit: Unlimited', 0),
  ('freelancers_2_year', 'أقصى قيمة للمحترفين الجادين', 'Maximum value for serious professionals', 1)
) AS f(plan_name, feature_text, feature_text_en, sort_order)
JOIN plans p ON p.name = f.plan_name AND p.deleted_at IS NULL;

DELETE FROM plan_features pf
USING plans p
WHERE pf.plan_id = p.id
  AND p.name = 'freelancers_platinum';

INSERT INTO plan_features (plan_id, feature_text, feature_text_en, sort_order, is_included)
SELECT fp.id, pf.feature_text, pf.feature_text_en, pf.sort_order, pf.is_included
FROM plans fp
JOIN plans cp ON cp.id = 3 AND cp.name = 'orderzhouse_platinum' AND cp.deleted_at IS NULL
JOIN plan_features pf ON pf.plan_id = cp.id
WHERE fp.name = 'freelancers_platinum' AND fp.deleted_at IS NULL;

INSERT INTO plan_features (plan_id, feature_text, feature_text_en, sort_order, is_included)
SELECT fp.id, elem.value, elem.value, elem.ordinality - 1, TRUE
FROM plans fp
JOIN plans cp ON cp.id = 3 AND cp.name = 'orderzhouse_platinum'
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cp.features, '[]'::jsonb)) WITH ORDINALITY AS elem(value, ordinality)
WHERE fp.name = 'freelancers_platinum'
  AND fp.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM plan_features x WHERE x.plan_id = fp.id);

INSERT INTO schema_migrations (version) VALUES ('088_seed_freelancer_pricing_plans')
ON CONFLICT (version) DO NOTHING;

COMMIT;
