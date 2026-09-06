-- 124: Arabic label for freelancers_monthly_paid_15 (badge must not stay English "Monthly").

UPDATE plans
SET
  label = 'شهريًا',
  label_en = 'Monthly',
  updated_at = NOW()
WHERE name = 'freelancers_monthly_paid_15'
  AND deleted_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('124_monthly_plan_arabic_label')
ON CONFLICT (version) DO NOTHING;
