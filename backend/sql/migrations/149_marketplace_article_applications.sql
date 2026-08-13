-- 149: Phase B5 — Marketplace Article Applications FOUNDATION (ADDITIVE ONLY).
-- Dedicated Article application domain (NOT order_freelancer_bids / Priority Boost).
-- Runtime enforces membership article_access_level >= article.article_level.
--
-- Owner-approved Bid policy (recorded in app constants; NOT encoded/wired here):
--   ARTICLE_APPLICATION_BID_COST = 1 (flat; eligibility ≠ free)
--   no-selection refund 100% when Article closes/cancels with no Freelancer selected
--   withdrawal / rejection / loser refund = NONE
-- Economics consume/refund + economics table = NEXT migration/step AFTER 149.
--
-- Does NOT:
--   encode Bid Credit cost columns
--   consume Bid Credits / create refunds / create Bid grants
--   create Article Bid economics table
--   enable article_applications_enabled or bid_credits_enabled
--   create applications / backfill
--   reintroduce competition rounds / caps / Token entry / cohorts
--   DROP Work Token / Priority auction schema
--   mutate Fair / Elite / Orders
-- Apply ONLY after explicit review. Do not auto-apply.

BEGIN;

-- =========================================================
-- Feature flag (dormant rollout)
-- =========================================================
ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS article_applications_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN marketplace_economy_settings.article_applications_enabled IS
  'Phase B5: Article Applications engine. Default OFF / DORMANT. Independent of Bid Credits and Priority Boost.';

-- =========================================================
-- Article applications
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_article_applications (
  id BIGSERIAL PRIMARY KEY,

  article_id BIGINT NOT NULL
    REFERENCES marketplace_articles(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  membership_id BIGINT NOT NULL
    REFERENCES freelancer_marketplace_memberships(id) ON DELETE RESTRICT,
  cycle_id BIGINT NULL
    REFERENCES marketplace_membership_cycles(id) ON DELETE RESTRICT,

  -- Snapshots at submission (audit / freeze integrity)
  article_level_snapshot INTEGER NOT NULL
    CONSTRAINT marketplace_article_applications_level_snap_chk
      CHECK (article_level_snapshot >= 1 AND article_level_snapshot <= 5),
  article_value_jod_snapshot NUMERIC(12, 3) NOT NULL
    CONSTRAINT marketplace_article_applications_value_snap_chk
      CHECK (article_value_jod_snapshot >= 0),
  required_word_count_snapshot INTEGER NOT NULL
    CONSTRAINT marketplace_article_applications_words_snap_chk
      CHECK (required_word_count_snapshot > 0),
  required_references_count_snapshot INTEGER NOT NULL DEFAULT 0
    CONSTRAINT marketplace_article_applications_refs_snap_chk
      CHECK (required_references_count_snapshot >= 0),
  membership_article_access_level_snapshot INTEGER NOT NULL
    CONSTRAINT marketplace_article_applications_access_snap_chk
      CHECK (
        membership_article_access_level_snapshot >= 1
        AND membership_article_access_level_snapshot <= 5
      ),

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT marketplace_article_applications_status_chk
      CHECK (
        status IN ('pending', 'selected', 'rejected', 'withdrawn', 'cancelled')
      ),

  proposal_message TEXT NULL,

  -- Bid Credit cost intentionally NOT stored in 149.
  -- Owner-approved flat cost ARTICLE_APPLICATION_BID_COST = 1 lives in app constants;
  -- consume/refund + economics table belong to the NEXT Article Bid economics step.

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ NULL,
  selected_at TIMESTAMPTZ NULL,
  rejected_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  selected_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  rejected_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_article_applications_article_fl_uidx
    UNIQUE (article_id, freelancer_user_id),
  CONSTRAINT marketplace_article_applications_idem_uidx
    UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS marketplace_article_applications_article_status_idx
  ON marketplace_article_applications (article_id, status, submitted_at);

CREATE INDEX IF NOT EXISTS marketplace_article_applications_freelancer_idx
  ON marketplace_article_applications (freelancer_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_article_applications_status_idx
  ON marketplace_article_applications (status);

COMMENT ON TABLE marketplace_article_applications IS
  'Phase B5 foundation: Freelancer Article applications. One row per Article+Freelancer. Bid economics deferred (approved cost=1 Bid flat in app constants). No competition rounds. No Work Tokens. No Priority Boost.';

COMMENT ON COLUMN marketplace_article_applications.idempotency_key IS
  'Deterministic: article_application:article:{articleId}:freelancer:{freelancerUserId}';

COMMENT ON COLUMN marketplace_article_applications.article_value_jod_snapshot IS
  'Audit snapshot of Article value at apply time. NOT a Bid Credit cost (ARTICLE_VALUE_TO_BID_COST_MAPPING = NONE).';

INSERT INTO schema_migrations (version)
VALUES ('149_marketplace_article_applications')
ON CONFLICT (version) DO NOTHING;

COMMIT;
