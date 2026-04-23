-- Seed 3 example plans (idempotent).
-- Run: (from backend/) npm run db:run -- sql/subscriptions_seed_examples.sql

BEGIN;

INSERT INTO plans (
  name,
  title,
  description,
  duration_days,
  price_cents,
  requires_company_visit,
  is_active,
  is_visible,
  sort_order
)
VALUES
  (
    'freelancer_starter',
    'باقة البداية',
    'مناسبة للمستقلين الجدد. مدة 30 يوم. بدون زيارة الشركة.',
    30,
    0,
    FALSE,
    TRUE,
    TRUE,
    10
  ),
  (
    'freelancer_pro_visit',
    'باقة برو (زيارة الشركة)',
    'باقة احترافية لمدة 90 يوم مع شرط زيارة الشركة لتفعيلها حسب سياسة الشركة.',
    90,
    29900,
    TRUE,
    TRUE,
    TRUE,
    20
  ),
  (
    'freelancer_enterprise',
    'باقة المؤسسات',
    'باقة طويلة لمدة 365 يوم للمشاريع الكبيرة. قابلة للإخفاء من العرض العام عند الحاجة.',
    365,
    99900,
    FALSE,
    TRUE,
    TRUE,
    30
  )
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  duration_days = EXCLUDED.duration_days,
  price_cents = EXCLUDED.price_cents,
  requires_company_visit = EXCLUDED.requires_company_visit,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

COMMIT;

