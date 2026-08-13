-- 142: Marketplace Fair Distribution (Phase 7 v1) — ADDITIVE ONLY.
-- Lexicographic COUNT-ONLY fairness queue (NO numeric fairness_score).
--
-- Adds:
--   fair_distribution_lookback_days (default 30)
--   fair_distribution_events (idempotent outcome history)
--   fair_distribution_decisions + candidate snapshots (immutable audit)
--
-- Does NOT:
--   enable fair_work_distribution_enabled
--   change assignment_strategy / priority_bid_assignment_strategy defaults
--   backfill invented historical fairness events
--   create assignments / move Tokens / alter Priority Bid economics
--   implement HYBRID weighted scoring

BEGIN;

-- =========================================================
-- Economy setting: lookback days
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS fair_distribution_lookback_days INTEGER NOT NULL DEFAULT 30
    CHECK (fair_distribution_lookback_days >= 1 AND fair_distribution_lookback_days <= 3650);

COMMENT ON COLUMN marketplace_economy_settings.fair_distribution_lookback_days IS
  'Phase 7 Fair Distribution lookback window in days (approved default 30). Source of truth for lexicographic queue metrics.';

-- =========================================================
-- fair_distribution_events — idempotent outcome history
-- =========================================================
CREATE TABLE IF NOT EXISTS fair_distribution_events (
  id BIGSERIAL PRIMARY KEY,

  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,

  outcome_code VARCHAR(64) NOT NULL
    CHECK (outcome_code IN (
      'APPLIED_AND_LOST',
      'ASSIGNMENT_OFFERED_AND_DECLINED',
      'FREELANCER_CANCELLED_AFTER_AWARD',
      'AWARDED',
      'INELIGIBLE_SKIPPED',
      'ORDER_CANCELLED_BEFORE_RESOLUTION',
      'NO_ELIGIBLE_WINNER',
      'CLIENT_ADMIN_SYSTEM_CANCELLED',
      'EFFECTIVE_ASSIGNMENT'
    )),

  category_id BIGINT NULL REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id BIGINT NULL,
  scope_kind VARCHAR(24) NOT NULL DEFAULT 'category'
    CHECK (scope_kind IN ('subcategory', 'category')),

  reference_type VARCHAR(64) NOT NULL,
  reference_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(191) NOT NULL,

  actor_role VARCHAR(40) NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(160) NULL,
  metadata_json JSONB NULL,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fair_distribution_events_idempotency_uidx UNIQUE (idempotency_key)
);

-- APPLIED_AND_LOST: at most once per Freelancer + Order
CREATE UNIQUE INDEX IF NOT EXISTS fair_distribution_events_applied_lost_once_uidx
  ON fair_distribution_events (freelancer_user_id, order_id)
  WHERE outcome_code = 'APPLIED_AND_LOST';

CREATE INDEX IF NOT EXISTS fair_distribution_events_freelancer_scope_idx
  ON fair_distribution_events (freelancer_user_id, category_id, subcategory_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS fair_distribution_events_order_idx
  ON fair_distribution_events (order_id);

COMMENT ON TABLE fair_distribution_events IS
  'Phase 7: idempotent Fair Distribution outcome history. No numeric fairness_score. No ambiguous legacy backfill.';

-- =========================================================
-- fair_distribution_decisions — immutable decision audit
-- =========================================================
CREATE TABLE IF NOT EXISTS fair_distribution_decisions (
  id BIGSERIAL PRIMARY KEY,

  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  assignment_strategy VARCHAR(40) NOT NULL,
  fair_engine_enabled_snapshot BOOLEAN NOT NULL DEFAULT FALSE,

  category_id BIGINT NULL,
  subcategory_id BIGINT NULL,
  scope_kind VARCHAR(24) NOT NULL
    CHECK (scope_kind IN ('subcategory', 'category')),
  lookback_days INTEGER NOT NULL CHECK (lookback_days >= 1),

  priority_auction_id BIGINT NULL,
  priority_auction_participated BOOLEAN NOT NULL DEFAULT FALSE,

  selected_freelancer_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  selected_candidate_key VARCHAR(128) NULL,
  selection_source VARCHAR(64) NOT NULL DEFAULT 'fair_distribution_first',

  reason_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  human_summary_en TEXT NULL,
  human_summary_ar TEXT NULL,

  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One decision snapshot row per Order for Phase 7 v1 model
  CONSTRAINT fair_distribution_decisions_order_uidx UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS fair_distribution_decisions_decided_idx
  ON fair_distribution_decisions (decided_at DESC);

COMMENT ON TABLE fair_distribution_decisions IS
  'Phase 7: immutable Fair Distribution decision audit. Lexicographic metrics only — no fairness_score.';

-- =========================================================
-- fair_distribution_decision_candidates — per-candidate snapshot
-- =========================================================
CREATE TABLE IF NOT EXISTS fair_distribution_decision_candidates (
  id BIGSERIAL PRIMARY KEY,

  decision_id BIGINT NOT NULL REFERENCES fair_distribution_decisions(id) ON DELETE RESTRICT,
  ordinal_position INTEGER NOT NULL CHECK (ordinal_position >= 1),

  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  candidate_key VARCHAR(128) NOT NULL,
  eligible BOOLEAN NOT NULL,
  ineligible_reason VARCHAR(80) NULL,

  recent_effective_assignments_count INTEGER NOT NULL DEFAULT 0 CHECK (recent_effective_assignments_count >= 0),
  applied_and_lost_waiting_count INTEGER NOT NULL DEFAULT 0 CHECK (applied_and_lost_waiting_count >= 0),
  active_workload_count INTEGER NOT NULL DEFAULT 0 CHECK (active_workload_count >= 0),
  last_effective_assignment_at TIMESTAMPTZ NULL,

  priority_bid_tokens INTEGER NULL CHECK (priority_bid_tokens IS NULL OR priority_bid_tokens >= 1),
  submitted_at TIMESTAMPTZ NULL,
  application_or_bid_id BIGINT NULL,

  reason_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fair_distribution_decision_candidates_decision_freelancer_uidx
    UNIQUE (decision_id, freelancer_user_id),
  CONSTRAINT fair_distribution_decision_candidates_decision_ordinal_uidx
    UNIQUE (decision_id, ordinal_position)
);

CREATE INDEX IF NOT EXISTS fair_distribution_decision_candidates_decision_idx
  ON fair_distribution_decision_candidates (decision_id, ordinal_position ASC);

COMMENT ON TABLE fair_distribution_decision_candidates IS
  'Phase 7: immutable per-candidate Fair Distribution metrics snapshot for Admin explainability.';

INSERT INTO schema_migrations (version)
VALUES ('142_marketplace_fair_distribution')
ON CONFLICT (version) DO NOTHING;

COMMIT;
