-- 031_fake_round_visibility_and_tracking
-- Add "show to all freelancers" option and interaction tracking for fake rounds.

ALTER TABLE fake_order_settings
  ADD COLUMN IF NOT EXISTS show_to_all_freelancers BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE fake_order_rounds
  ADD COLUMN IF NOT EXISTS show_to_all_freelancers BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS fake_order_interactions (
  id BIGSERIAL PRIMARY KEY,
  fake_round_id BIGINT NOT NULL REFERENCES fake_order_rounds(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL DEFAULT 'taken',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fake_round_id, order_id, freelancer_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_fake_order_interactions_round ON fake_order_interactions(fake_round_id);
CREATE INDEX IF NOT EXISTS idx_fake_order_interactions_order ON fake_order_interactions(order_id);
CREATE INDEX IF NOT EXISTS idx_fake_order_interactions_freelancer ON fake_order_interactions(freelancer_id);

INSERT INTO schema_migrations (version)
SELECT '031_fake_round_visibility_and_tracking'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '031_fake_round_visibility_and_tracking'
);
