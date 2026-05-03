-- 040_production_training_hardening
-- Automation observability, run logs, and performance indexes for training/fake orders.

BEGIN;

ALTER TABLE fake_order_settings
  ADD COLUMN IF NOT EXISTS last_automation_run_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_automation_status VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS last_automation_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_automation_round_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS last_automation_generated_count INT NULL,
  ADD COLUMN IF NOT EXISTS last_automation_next_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS fake_order_automation_logs (
  id BIGSERIAL PRIMARY KEY,
  run_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_finished_at TIMESTAMPTZ NULL,
  status VARCHAR(40) NOT NULL,
  error_message TEXT NULL,
  round_id BIGINT NULL,
  generated_count INT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'automation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fake_order_automation_logs_created ON fake_order_automation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fake_order_automation_logs_status ON fake_order_automation_logs (status);

CREATE INDEX IF NOT EXISTS idx_fake_orders_pool_list
  ON fake_orders (fake_status, is_published, is_open_for_pool, created_at DESC, id DESC)
  WHERE fake_status = 'active' AND is_published = TRUE AND is_open_for_pool = TRUE;

CREATE INDEX IF NOT EXISTS idx_fake_order_round_items_pool_window
  ON fake_order_round_items (round_id, status, visible_until, visible_from)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_fake_order_rounds_list_admin
  ON fake_order_rounds (status, id DESC);

CREATE INDEX IF NOT EXISTS idx_fake_order_applications_order_round
  ON fake_order_applications (fake_order_id, round_id);

CREATE INDEX IF NOT EXISTS idx_fake_order_applications_freelancer
  ON fake_order_applications (freelancer_user_id);

CREATE INDEX IF NOT EXISTS idx_fake_order_templates_active_category
  ON fake_order_templates (is_active, category_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fake_order_settings_plans_plan
  ON fake_order_settings_plans (plan_id);

INSERT INTO schema_migrations (version)
SELECT '040_production_training_hardening'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '040_production_training_hardening'
);

COMMIT;
