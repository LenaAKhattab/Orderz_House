-- 162: Fair-distribution selection override audit (Article + Pantry).
-- FILE ONLY — do not apply in this phase.
-- Additive. No row deletes. No table rebuild.
-- Does not reuse the order-specific decisions table.
-- Does not fake an order identifier. Does not touch Stripe or payments.

BEGIN;

CREATE TABLE IF NOT EXISTS fair_distribution_selection_overrides (
  id BIGSERIAL PRIMARY KEY,
  opportunity_type VARCHAR(40) NOT NULL
    CHECK (opportunity_type IN ('mini_bid_article', 'pantry_request')),
  opportunity_id BIGINT NOT NULL,
  collection_round_id BIGINT NULL
    REFERENCES opportunity_bid_collection_rounds (id) ON DELETE SET NULL,
  selected_candidate_id BIGINT NOT NULL,
  recommended_candidate_id BIGINT NULL,
  selected_rank INTEGER NULL,
  recommended_rank INTEGER NULL,
  override_reason TEXT NOT NULL
    CONSTRAINT fair_distribution_selection_overrides_reason_chk
      CHECK (char_length(btrim(override_reason)) >= 10 AND char_length(override_reason) <= 500),
  actor_user_id BIGINT NULL
    REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS fair_distribution_selection_overrides_opp_idx
  ON fair_distribution_selection_overrides (opportunity_type, opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fair_distribution_selection_overrides_actor_idx
  ON fair_distribution_selection_overrides (actor_user_id, created_at DESC);

COMMENT ON TABLE fair_distribution_selection_overrides IS
  'Audit when Admin/Super Admin manually selects a non-rank-#1 fair-ranking candidate. Not auto-assign.';

COMMIT;
