-- 028_fake_training_bidding_orders
-- Separate training/fake bidding rounds + templates + plan visibility.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_fake BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fake_round_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS fake_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS fake_status VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS show_fake_badge BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fake_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_fake_status_check CHECK (
    fake_status IS NULL OR fake_status IN ('active', 'expired', 'stopped')
  );

CREATE TABLE IF NOT EXISTS fake_order_rounds (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  min_orders INT NOT NULL CHECK (min_orders >= 1),
  max_orders INT NOT NULL CHECK (max_orders >= min_orders),
  generated_count INT NOT NULL DEFAULT 0 CHECK (generated_count >= 0),
  duration_hours INT NOT NULL CHECK (duration_hours >= 1 AND duration_hours <= 720),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'expired', 'stopped')),
  show_fake_badge_to_freelancers BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fake_order_round_plans (
  id BIGSERIAL PRIMARY KEY,
  fake_round_id BIGINT NOT NULL REFERENCES fake_order_rounds(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fake_round_id, plan_id)
);

CREATE TABLE IF NOT EXISTS fake_order_templates (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id BIGINT NULL REFERENCES subcategories(id) ON DELETE RESTRICT,
  sub_subcategory_id BIGINT NULL REFERENCES sub_subcategories(id) ON DELETE RESTRICT,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_budget NUMERIC(12,2) NOT NULL CHECK (min_budget > 0),
  max_budget NUMERIC(12,2) NOT NULL CHECK (max_budget >= min_budget),
  currency VARCHAR(3) NOT NULL DEFAULT 'JOD',
  min_duration INT NOT NULL CHECK (min_duration >= 1),
  max_duration INT NOT NULL CHECK (max_duration >= min_duration),
  duration_unit VARCHAR(10) NOT NULL DEFAULT 'days' CHECK (duration_unit IN ('days','hours','minutes')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_fake_round;
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_fake_round
  FOREIGN KEY (fake_round_id)
  REFERENCES fake_order_rounds(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_is_fake ON orders(is_fake, fake_status, fake_expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_fake_round_id ON orders(fake_round_id);
CREATE INDEX IF NOT EXISTS idx_fake_rounds_status_expires ON fake_order_rounds(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_fake_round_plans_round ON fake_order_round_plans(fake_round_id);
CREATE INDEX IF NOT EXISTS idx_fake_round_plans_plan ON fake_order_round_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_fake_templates_active ON fake_order_templates(is_active, id);

INSERT INTO schema_migrations (version)
VALUES ('028_fake_training_bidding_orders')
ON CONFLICT (version) DO NOTHING;

COMMIT;
