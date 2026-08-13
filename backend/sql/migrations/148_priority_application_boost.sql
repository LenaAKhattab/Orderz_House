-- 148: Phase B4 — Priority Application Boost (ADDITIVE ONLY).
-- Replaces the ACTIVE product model of Token-based Priority auctions with a binary
-- application boost that consumes 1 Priority Use from the Freelancer membership cycle.
--
-- Product rules:
--   NORMAL_APPLICATION_BID_COST = 1 (unchanged; Bid Credits)
--   PRIORITY_BOOST_ADDITIONAL_BID_COST = 0
--   PRIORITY_BOOST_WORK_TOKEN_COST = 0
--   PRIORITY_BOOST_USE_COST = 1
--   No automatic assignment. No variable Token/Bid stake. No highest-token ranking.
--
-- Does NOT enable priority_application_boost_enabled or bid_credits_enabled.
-- Does NOT DROP priority_bid_auctions / priority_auction_bids (LEGACY_DEFERRED).
-- Does NOT backfill historical auctions into boosts.
-- Does NOT mutate Work Token ledgers / Fair / Elite / Articles.
-- Apply ONLY after explicit review. Do not auto-apply.

BEGIN;

-- =========================================================
-- Feature flag (independent of legacy priority_bidding_enabled)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS priority_application_boost_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN marketplace_economy_settings.priority_application_boost_enabled IS
  'Phase B4: Priority Application Boost engine. Default OFF. Independent of legacy priority_bidding_enabled (Token auction, DEPRECATED).';

COMMENT ON COLUMN marketplace_economy_settings.priority_bidding_enabled IS
  'LEGACY_DEPRECATED Phase 6 Token Priority auction engine. Keep FALSE. Active product uses priority_application_boost_enabled.';

-- =========================================================
-- Per-application Priority boost audit (side table; not Bid Credit economics)
-- =========================================================
CREATE TABLE IF NOT EXISTS order_freelancer_priority_application_boosts (
  id BIGSERIAL PRIMARY KEY,

  bid_id BIGINT NOT NULL REFERENCES order_freelancer_bids(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  membership_id BIGINT NOT NULL
    REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,
  cycle_id BIGINT NOT NULL
    REFERENCES marketplace_membership_cycles(id) ON DELETE RESTRICT,

  usage_consume_id BIGINT NULL
    REFERENCES marketplace_membership_cycle_usage(id) ON DELETE RESTRICT,

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'returned')),

  boost_source VARCHAR(40) NOT NULL DEFAULT 'submit'
    CHECK (boost_source IN ('submit', 'upgrade')),

  -- Locked product costs (binary boost; no variable stake).
  priority_use_cost INTEGER NOT NULL DEFAULT 1
    CONSTRAINT order_freelancer_priority_application_boosts_use_cost_chk
      CHECK (priority_use_cost = 1),
  additional_bid_credit_cost INTEGER NOT NULL DEFAULT 0
    CONSTRAINT order_freelancer_priority_application_boosts_extra_bid_chk
      CHECK (additional_bid_credit_cost = 0),
  work_token_cost INTEGER NOT NULL DEFAULT 0
    CONSTRAINT order_freelancer_priority_application_boosts_wt_cost_chk
      CHECK (work_token_cost = 0),

  idempotency_key VARCHAR(200) NOT NULL,
  boosted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMPTZ NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT order_freelancer_priority_application_boosts_order_fl_uidx
    UNIQUE (order_id, freelancer_user_id),
  CONSTRAINT order_freelancer_priority_application_boosts_bid_uidx
    UNIQUE (bid_id),
  CONSTRAINT order_freelancer_priority_application_boosts_idem_uidx
    UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS order_freelancer_priority_application_boosts_order_idx
  ON order_freelancer_priority_application_boosts (order_id, status, boosted_at);

CREATE INDEX IF NOT EXISTS order_freelancer_priority_application_boosts_cycle_idx
  ON order_freelancer_priority_application_boosts (cycle_id, status);

COMMENT ON TABLE order_freelancer_priority_application_boosts IS
  'Phase B4: Binary Priority Application Boost audit. One row per Order+Freelancer application. Consumes 1 Priority Use; 0 extra Bid Credits; 0 Work Tokens. No auto-assignment.';

COMMENT ON COLUMN order_freelancer_priority_application_boosts.idempotency_key IS
  'Deterministic: priority_application_boost:order:{orderId}:freelancer:{freelancerUserId}';

INSERT INTO schema_migrations (version)
VALUES ('148_priority_application_boost')
ON CONFLICT (version) DO NOTHING;

COMMIT;
