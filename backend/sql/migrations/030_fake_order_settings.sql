-- 030_fake_order_settings
-- Global settings for fake/training rounds.

BEGIN;

CREATE TABLE IF NOT EXISTS fake_order_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_orders INT NOT NULL CHECK (min_orders >= 1),
  max_orders INT NOT NULL CHECK (max_orders >= min_orders),
  duration_hours INT NOT NULL CHECK (duration_hours >= 1 AND duration_hours <= 720),
  show_fake_badge_to_freelancers BOOLEAN NOT NULL DEFAULT FALSE,
  expiry_behavior VARCHAR(20) NOT NULL DEFAULT 'expire' CHECK (expiry_behavior IN ('expire', 'stop')),
  updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fake_order_settings_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id)
);

INSERT INTO fake_order_settings (id, min_orders, max_orders, duration_hours, show_fake_badge_to_freelancers, expiry_behavior)
VALUES (1, 40, 90, 12, FALSE, 'expire')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('030_fake_order_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
