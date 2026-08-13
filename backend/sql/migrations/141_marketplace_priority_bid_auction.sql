-- 141: Marketplace Priority Bid Auction engine (Phase 6) — ADDITIVE ONLY.
-- Persistent auctions + Priority Bid rows. Uses Work Token RESERVE/RELEASE/CONSUME
-- and Priority Bid cycle usage accounting (Phases 3–4).
--
-- Does NOT enable priority_bidding_enabled or work_tokens_enabled.
-- Does NOT create auctions for historical/open Orders (no backfill).
-- Does NOT move Tokens, create Wallets, or consume Priority Bid uses.
-- Does NOT implement Fair Distribution / Elite / Stripe Token purchase / bulk distribution.
--
-- Approved automatic creation trigger (prospective only, engines ON):
-- when a REAL priced-bidding Order becomes open_for_bids + published + open_for_pool
-- (canonical Freelancer visibility). One auction lifetime per order_id.

BEGIN;

-- =========================================================
-- priority_bid_auctions
-- =========================================================
CREATE TABLE IF NOT EXISTS priority_bid_auctions (
  id BIGSERIAL PRIMARY KEY,

  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,

  status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'resolving', 'resolved', 'cancelled')),

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,

  -- Snapshotted economy settings at auction creation (immutable for this auction)
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 1 AND duration_minutes <= 10080),
  minimum_bid_tokens INTEGER NOT NULL CHECK (minimum_bid_tokens >= 1),
  maximum_bid_tokens INTEGER NULL CHECK (maximum_bid_tokens IS NULL OR maximum_bid_tokens >= 1),
  allow_increase BOOLEAN NOT NULL DEFAULT TRUE,
  allow_decrease BOOLEAN NOT NULL DEFAULT FALSE,
  allow_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
  return_use_on_cancel BOOLEAN NOT NULL DEFAULT TRUE,
  auto_assignment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assignment_strategy VARCHAR(40) NOT NULL DEFAULT 'HIGHEST_TOKEN_ONLY',

  -- automatic_priced_bidding_open | super_admin_manual | system
  creation_source VARCHAR(48) NOT NULL DEFAULT 'super_admin_manual',

  winner_auction_bid_id BIGINT NULL,
  winner_freelancer_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  resolution_reason VARCHAR(80) NULL,
  resolution_detail_json JSONB NULL,

  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Phase 6 model: exactly one Priority Auction lifetime per Order
  CONSTRAINT priority_bid_auctions_order_uidx UNIQUE (order_id),

  CONSTRAINT priority_bid_auctions_ends_after_starts_chk CHECK (ends_at > starts_at),
  CONSTRAINT priority_bid_auctions_max_ge_min_chk
    CHECK (maximum_bid_tokens IS NULL OR maximum_bid_tokens >= minimum_bid_tokens)
);

CREATE INDEX IF NOT EXISTS priority_bid_auctions_due_resolve_idx
  ON priority_bid_auctions (ends_at, id)
  WHERE status IN ('scheduled', 'active');

CREATE INDEX IF NOT EXISTS priority_bid_auctions_status_idx
  ON priority_bid_auctions (status);

COMMENT ON TABLE priority_bid_auctions IS
  'Phase 6: Priority Bid Token auction per REAL priced-bidding order (one auction lifetime per order_id). Timestamps persisted; resolution via worker/cron, not in-memory timers.';

-- =========================================================
-- priority_auction_bids
-- =========================================================
CREATE TABLE IF NOT EXISTS priority_auction_bids (
  id BIGSERIAL PRIMARY KEY,

  auction_id BIGINT NOT NULL REFERENCES priority_bid_auctions(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  membership_id BIGINT NULL REFERENCES freelancer_marketplace_memberships(id) ON DELETE SET NULL,
  cycle_id BIGINT NULL REFERENCES marketplace_membership_cycles(id) ON DELETE SET NULL,

  bid_tokens INTEGER NOT NULL CHECK (bid_tokens >= 1),
  reservation_id BIGINT NULL REFERENCES work_token_reservations(id) ON DELETE SET NULL,
  usage_consume_id BIGINT NULL REFERENCES marketplace_membership_cycle_usage(id) ON DELETE SET NULL,

  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'active',
      'won',
      'lost',
      'cancelled',
      'skipped_ineligible',
      'released'
    )),

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  won_at TIMESTAMPTZ NULL,
  lost_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,

  skip_reason VARCHAR(80) NULL,
  last_increase_at TIMESTAMPTZ NULL,

  CONSTRAINT priority_auction_bids_auction_freelancer_uidx UNIQUE (auction_id, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS priority_auction_bids_auction_rank_idx
  ON priority_auction_bids (auction_id, bid_tokens DESC, submitted_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS priority_auction_bids_freelancer_idx
  ON priority_auction_bids (freelancer_user_id);

CREATE INDEX IF NOT EXISTS priority_auction_bids_order_idx
  ON priority_auction_bids (order_id);

COMMENT ON TABLE priority_auction_bids IS
  'Phase 6: one Priority Bid per Freelancer per auction. Tokens are RESERVED while active; losers RELEASE 100%; winner CONSUMES reserved Tokens. Separate from normal application economics.';

-- FK for winner_auction_bid_id (added after bids table exists)
ALTER TABLE priority_bid_auctions
  DROP CONSTRAINT IF EXISTS priority_bid_auctions_winner_bid_fkey;

ALTER TABLE priority_bid_auctions
  ADD CONSTRAINT priority_bid_auctions_winner_bid_fkey
  FOREIGN KEY (winner_auction_bid_id) REFERENCES priority_auction_bids(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (version)
VALUES ('141_marketplace_priority_bid_auction')
ON CONFLICT (version) DO NOTHING;

COMMIT;
