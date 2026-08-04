-- 123: Public Arabic copy for freelancers_monthly_paid_15 — renew phrasing, no freeze marketing.

UPDATE plans
SET
  description = NULL,
  description_en = NULL,
  price_intro_text = 'يُجدَّد الاشتراك تلقائيًا شهريًا باستخدام البطاقة المسجلة',
  price_intro_text_en = 'Subscription renews automatically each month using your saved card',
  billing_text = 'شهريًا',
  billing_text_en = 'Monthly',
  label = 'شهريًا',
  label_en = 'Monthly',
  button_text = 'اختر الباقة',
  button_text_en = 'Choose Plan',
  title = 'الاشتراك الشهري المدفوع',
  title_en = 'Paid Monthly Subscription',
  updated_at = NOW()
WHERE name = 'freelancers_monthly_paid_15'
  AND deleted_at IS NULL;

DELETE FROM plan_features pf
USING plans p
WHERE pf.plan_id = p.id
  AND p.name = 'freelancers_monthly_paid_15';

INSERT INTO plan_features (plan_id, feature_text, feature_text_en, sort_order, is_included)
SELECT p.id, f.feature_text, f.feature_text_en, f.sort_order, TRUE
FROM plans p
CROSS JOIN (
  VALUES
    (0, 'اشتراك شهري متجدد تلقائياً', 'Automatically renewing monthly subscription'),
    (1, 'يُجدَّد الاشتراك تلقائيًا شهريًا باستخدام البطاقة المسجلة', 'Subscription renews automatically each month using your saved card'),
    (2, '15 دينار أردني شهرياً', '15 JOD per month')
) AS f(sort_order, feature_text, feature_text_en)
WHERE p.name = 'freelancers_monthly_paid_15'
  AND p.deleted_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('123_monthly_plan_public_copy_no_freeze_marketing')
ON CONFLICT (version) DO NOTHING;
