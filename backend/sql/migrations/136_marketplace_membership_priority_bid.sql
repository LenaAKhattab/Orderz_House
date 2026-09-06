-- 136: Marketplace Membership plan Priority Bid capability fields — ADDITIVE ONLY.
-- Extends marketplace_membership_plans (migration 134 already applied; DO NOT modify 134).
-- Configuration/catalog only. Does NOT create auctions, wallets, or cycles.
-- Does NOT change monthly_price_jod for any tier.
-- Do NOT apply to Production from agent tasks; review then migrate explicitly.

BEGIN;

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS priority_bid_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_membership_plans
  ADD COLUMN IF NOT EXISTS priority_bid_uses_per_cycle INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketplace_membership_plans_priority_bid_uses_nonneg'
  ) THEN
    ALTER TABLE marketplace_membership_plans
      ADD CONSTRAINT marketplace_membership_plans_priority_bid_uses_nonneg
      CHECK (priority_bid_uses_per_cycle >= 0 AND priority_bid_uses_per_cycle <= 1000);
  END IF;
END $$;

COMMENT ON COLUMN marketplace_membership_plans.priority_bid_enabled IS
  'Tier capability: this marketplace plan may use Priority Bid auctions (global engine must also be enabled). Distinct from Elite Direct Orders.';
COMMENT ON COLUMN marketplace_membership_plans.priority_bid_uses_per_cycle IS
  'Max confirmed Priority Bid participations per marketplace membership cycle. Use is consumed on successful reservation+bid record, not on page open. Loss does not return the use by default.';

-- Initial Priority Bid capability seed.
-- Durable guard: only when 136 is NOT yet recorded in schema_migrations (first apply).
-- Extra safety: only rows still at ADD COLUMN defaults (enabled=false AND uses=0).
-- Admin may later intentionally set enabled=false/uses=0; after 136 is recorded, rerun must not reseed.
-- Prices intentionally untouched.
-- Order: seed FIRST, then INSERT schema_migrations (below) so first-run seed is not skipped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE version = '136_marketplace_membership_priority_bid'
  ) THEN
    UPDATE marketplace_membership_plans
    SET
      priority_bid_enabled = TRUE,
      priority_bid_uses_per_cycle = 1,
      updated_at = NOW()
    WHERE tier_code = 'pay_as_you_work'
      AND priority_bid_enabled = FALSE
      AND priority_bid_uses_per_cycle = 0;

    UPDATE marketplace_membership_plans
    SET
      priority_bid_enabled = TRUE,
      priority_bid_uses_per_cycle = 2,
      updated_at = NOW()
    WHERE tier_code = 'active'
      AND priority_bid_enabled = FALSE
      AND priority_bid_uses_per_cycle = 0;

    UPDATE marketplace_membership_plans
    SET
      priority_bid_enabled = TRUE,
      priority_bid_uses_per_cycle = 3,
      updated_at = NOW()
    WHERE tier_code = 'pro'
      AND priority_bid_enabled = FALSE
      AND priority_bid_uses_per_cycle = 0;

    UPDATE marketplace_membership_plans
    SET
      priority_bid_enabled = TRUE,
      priority_bid_uses_per_cycle = 4,
      updated_at = NOW()
    WHERE tier_code = 'elite'
      AND priority_bid_enabled = FALSE
      AND priority_bid_uses_per_cycle = 0;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('136_marketplace_membership_priority_bid')
ON CONFLICT (version) DO NOTHING;

COMMIT;
