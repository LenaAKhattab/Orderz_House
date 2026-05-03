-- 037_fake_round_items_and_applications
-- Round item visibility windows, freelancer applications, automation columns on settings.

BEGIN;

CREATE TABLE IF NOT EXISTS fake_order_round_items (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES fake_order_rounds(id) ON DELETE CASCADE,
  fake_order_id BIGINT NOT NULL REFERENCES fake_orders(id) ON DELETE CASCADE,
  visible_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visible_until TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, fake_order_id)
);

CREATE INDEX IF NOT EXISTS idx_fake_order_round_items_round ON fake_order_round_items(round_id);
CREATE INDEX IF NOT EXISTS idx_fake_order_round_items_order ON fake_order_round_items(fake_order_id);
CREATE INDEX IF NOT EXISTS idx_fake_order_round_items_visible ON fake_order_round_items(status, visible_until);

CREATE TABLE IF NOT EXISTS fake_order_applications (
  id BIGSERIAL PRIMARY KEY,
  fake_order_id BIGINT NOT NULL REFERENCES fake_orders(id) ON DELETE CASCADE,
  round_id BIGINT NOT NULL REFERENCES fake_order_rounds(id) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  proposal_message TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fake_order_id, round_id, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_fake_order_applications_order ON fake_order_applications(fake_order_id);
CREATE INDEX IF NOT EXISTS idx_fake_order_applications_round ON fake_order_applications(round_id);
CREATE INDEX IF NOT EXISTS idx_fake_order_applications_freelancer ON fake_order_applications(freelancer_user_id);

ALTER TABLE fake_order_settings
  ADD COLUMN IF NOT EXISTS training_orders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS automation_interval_value INT NULL,
  ADD COLUMN IF NOT EXISTS automation_interval_unit VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS show_to_all_visitors BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS next_automation_run_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS optional_round_name VARCHAR(200) NULL;

ALTER TABLE fake_order_settings
  DROP CONSTRAINT IF EXISTS fake_order_settings_automation_interval_unit_check;

ALTER TABLE fake_order_settings
  ADD CONSTRAINT fake_order_settings_automation_interval_unit_check
  CHECK (automation_interval_unit IS NULL OR automation_interval_unit IN ('minutes', 'hours', 'days'));

INSERT INTO schema_migrations (version)
SELECT '037_fake_round_items_and_applications'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '037_fake_round_items_and_applications'
);

COMMIT;
