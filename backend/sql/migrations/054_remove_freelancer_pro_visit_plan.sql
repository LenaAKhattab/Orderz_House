-- Retire default "باقة برو (زيارة الشركة)" plan (name freelancer_pro_visit, sort_order 20).
-- Soft-delete so existing freelancer_subscriptions.plan_id FK rows stay valid.

BEGIN;

UPDATE plans
SET
  deleted_at = NOW(),
  is_active = FALSE,
  is_visible = FALSE,
  updated_at = NOW()
WHERE name = 'freelancer_pro_visit'
  AND deleted_at IS NULL;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('054_remove_freelancer_pro_visit_plan')
ON CONFLICT (version) DO NOTHING;
