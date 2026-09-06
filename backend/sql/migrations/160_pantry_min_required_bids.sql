-- 160: Pantry House minimum required bids / bid-collection (ADDITIVE ONLY).
-- Do NOT APPLY until explicit review.
-- Reuses opportunity_bid_collection_rounds.opportunity_type = 'pantry_request' (already in 159 CHECK).
-- Does NOT reuse target_applicant_count (that remains an intake CAP).
-- Does NOT drop pantry_bids unique (pantry_request_id, freelancer_id).
-- Does NOT auto-assign. Does NOT touch Articles, orders, Stripe, or JOD.
-- Legacy pantry rows: required_bid_count NULL = existing manual accept MVP.

BEGIN;

-- =========================================================
-- Admin settings (Pantry only)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS pantry_min_required_bids INTEGER NOT NULL DEFAULT 10;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS pantry_allowed_required_bid_counts INTEGER[] NOT NULL DEFAULT ARRAY[10, 15, 20, 30];

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS pantry_default_required_bid_count INTEGER NOT NULL DEFAULT 10;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS pantry_auto_close_when_threshold_reached BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS pantry_auto_assign_when_threshold_reached BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS pantry_refund_policy VARCHAR(40) NOT NULL DEFAULT 'full_on_minimum_not_met';

-- =========================================================
-- pantry_requests (nullable = legacy without a threshold)
-- =========================================================
ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS required_bid_count INTEGER NULL;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS current_bid_collection_round_id BIGINT NULL;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS relist_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pantry_requests
  ADD COLUMN IF NOT EXISTS bid_collection_outcome VARCHAR(40) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pantry_requests_current_round_fkey'
  ) THEN
    ALTER TABLE pantry_requests
      ADD CONSTRAINT pantry_requests_current_round_fkey
      FOREIGN KEY (current_bid_collection_round_id)
      REFERENCES opportunity_bid_collection_rounds (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pantry_requests_current_round
  ON pantry_requests (current_bid_collection_round_id);

-- =========================================================
-- pantry_bids.collection_round_id (nullable for legacy bids)
-- =========================================================
ALTER TABLE pantry_bids
  ADD COLUMN IF NOT EXISTS collection_round_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pantry_bids_collection_round_fkey'
  ) THEN
    ALTER TABLE pantry_bids
      ADD CONSTRAINT pantry_bids_collection_round_fkey
      FOREIGN KEY (collection_round_id)
      REFERENCES opportunity_bid_collection_rounds (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pantry_bids_collection_round
  ON pantry_bids (collection_round_id);

COMMIT;
