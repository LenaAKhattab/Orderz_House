-- 159: Mini Bid Article minimum required bids / bid-collection rounds (ADDITIVE ONLY).
-- Do NOT APPLY until explicit review. Does not enable engines.
-- Does NOT reuse target_applicant_count (that remains an intake cap on orders/pantry).
-- Does NOT drop marketplace_article_applications unique (article_id, freelancer_user_id).
-- TODO Phase Relist: uniqueness must become (article_id, freelancer_user_id, collection_round_id).
-- Does NOT auto-assign. Does NOT touch Pantry, orders, Stripe, or JOD.

BEGIN;

-- =========================================================
-- Admin settings (Article only)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_min_required_bids INTEGER NOT NULL DEFAULT 10;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_allowed_required_bid_counts INTEGER[] NOT NULL DEFAULT ARRAY[10, 15, 20, 30];

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_default_required_bid_count INTEGER NOT NULL DEFAULT 10;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_auto_close_when_threshold_reached BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_auto_assign_when_threshold_reached BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_refund_policy VARCHAR(40) NOT NULL DEFAULT 'full_on_minimum_not_met';

-- =========================================================
-- Collection rounds (mini_bid_article now; pantry_request reserved)
-- =========================================================
CREATE TABLE IF NOT EXISTS opportunity_bid_collection_rounds (
  id BIGSERIAL PRIMARY KEY,
  opportunity_type VARCHAR(40) NOT NULL
    CHECK (opportunity_type IN ('mini_bid_article', 'pantry_request')),
  opportunity_id BIGINT NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  required_bid_count INTEGER NOT NULL CHECK (required_bid_count >= 1),
  bid_collection_status VARCHAR(40) NOT NULL DEFAULT 'collecting'
    CHECK (bid_collection_status IN (
      'collecting',
      'threshold_reached',
      'eligible_for_assignment',
      'assigned',
      'minimum_not_met',
      'cancelled',
      'locked'
    )),
  bid_collection_deadline_at TIMESTAMPTZ NULL,
  bid_collection_completed_at TIMESTAMPTZ NULL,
  min_bid_not_met_at TIMESTAMPTZ NULL,
  auto_close_when_threshold_reached BOOLEAN NOT NULL DEFAULT TRUE,
  auto_assign_when_threshold_reached BOOLEAN NOT NULL DEFAULT FALSE,
  source_round_id BIGINT NULL REFERENCES opportunity_bid_collection_rounds (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_type, opportunity_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_opp_bid_rounds_type_status_deadline
  ON opportunity_bid_collection_rounds (opportunity_type, bid_collection_status, bid_collection_deadline_at);

-- =========================================================
-- marketplace_articles (nullable = legacy articles without a threshold)
-- =========================================================
ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS required_bid_count INTEGER NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS current_bid_collection_round_id BIGINT NULL;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS relist_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE marketplace_articles
  ADD COLUMN IF NOT EXISTS bid_collection_outcome VARCHAR(40) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_articles_current_round_fk'
  ) THEN
    ALTER TABLE marketplace_articles
      ADD CONSTRAINT marketplace_articles_current_round_fk
      FOREIGN KEY (current_bid_collection_round_id)
      REFERENCES opportunity_bid_collection_rounds (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketplace_articles_current_round
  ON marketplace_articles (current_bid_collection_round_id);

-- =========================================================
-- applications: round link only (do not drop old unique)
-- =========================================================
ALTER TABLE marketplace_article_applications
  ADD COLUMN IF NOT EXISTS collection_round_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_article_applications_round_fk'
  ) THEN
    ALTER TABLE marketplace_article_applications
      ADD CONSTRAINT marketplace_article_applications_round_fk
      FOREIGN KEY (collection_round_id)
      REFERENCES opportunity_bid_collection_rounds (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_article_applications_collection_round
  ON marketplace_article_applications (collection_round_id);

COMMIT;
