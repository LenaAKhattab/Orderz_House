-- 150: Phase B5 final — Article application Bid Credit economics (ADDITIVE ONLY).
-- Dedicated domain (NOT order_freelancer_bid_credit_economics).
-- Product: first valid Article application costs exactly 1 Bid Credit (flat).
-- Eligible refund: Article closed/cancelled with ZERO selected Freelancers
--   → restore 100% (1 Bid) per refundable charged pending application.
--   * unexpired source grant → same bucket restore
--   * expired source → compensating grant source=article_application_refund (+30 days)
-- Withdrawal / individual rejection / loser → NO refund.
--
-- Does NOT:
--   enable article_applications_enabled or bid_credits_enabled
--   consume/refund Bids / create grants/ledger rows
--   create Article applications / backfill
--   alter Work Tokens / Priority / Fair / Elite / normal Order Bid economics
-- Apply ONLY after explicit review. Do not auto-apply.

BEGIN;

-- =========================================================
-- Extend Bid Credit ledger event vocabulary (Article)
-- =========================================================
ALTER TABLE marketplace_bid_credit_ledger_entries
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_ledger_entries_event_type_check;

ALTER TABLE marketplace_bid_credit_ledger_entries
  ADD CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  CHECK (
    event_type IN (
      'MEMBERSHIP_BID_GRANT',
      'ADMIN_BID_GRANT',
      'ADMIN_BID_ADJUSTMENT',
      'APPLICATION_BID_CONSUME',
      'BID_EXPIRED',
      'NORMAL_APPLICATION_BID_REFUND',
      'ARTICLE_APPLICATION_BID_CONSUME',
      'ARTICLE_APPLICATION_BID_REFUND'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check
  ON marketplace_bid_credit_ledger_entries IS
  'Phase B5 Article economics adds ARTICLE_APPLICATION_BID_CONSUME and ARTICLE_APPLICATION_BID_REFUND. Preserves all prior B1/B2 events.';

-- =========================================================
-- Extend Bid Credit grant source vocabulary (Article refund)
-- =========================================================
ALTER TABLE marketplace_bid_credit_grants
  DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_source_type_check;

ALTER TABLE marketplace_bid_credit_grants
  ADD CONSTRAINT marketplace_bid_credit_grants_source_type_check
  CHECK (
    source_type IN (
      'membership_daily_unlock',
      'admin_manual',
      'admin_adjustment',
      'normal_application_refund',
      'article_application_refund'
    )
  );

COMMENT ON CONSTRAINT marketplace_bid_credit_grants_source_type_check
  ON marketplace_bid_credit_grants IS
  'Phase B5 adds article_application_refund for expired-source compensating Article application Bid grants (30-day).';

-- =========================================================
-- Article application Bid Credit economics
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_article_application_bid_credit_economics (
  id BIGSERIAL PRIMARY KEY,

  article_application_id BIGINT NOT NULL
    REFERENCES marketplace_article_applications(id) ON DELETE RESTRICT,
  article_id BIGINT NOT NULL
    REFERENCES marketplace_articles(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  bid_credit_cost INTEGER NOT NULL DEFAULT 1
    CONSTRAINT marketplace_article_app_bid_econ_cost_chk
      CHECK (bid_credit_cost = 1),

  charge_status VARCHAR(20) NOT NULL DEFAULT 'charged'
    CONSTRAINT marketplace_article_app_bid_econ_charge_chk
      CHECK (charge_status IN ('charged')),
  refund_status VARCHAR(20) NOT NULL DEFAULT 'none'
    CONSTRAINT marketplace_article_app_bid_econ_refund_chk
      CHECK (refund_status IN ('none', 'refunded')),

  consume_ledger_entry_id BIGINT NULL
    REFERENCES marketplace_bid_credit_ledger_entries(id) ON DELETE RESTRICT,
  primary_grant_id BIGINT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  grant_expires_at_snapshot TIMESTAMPTZ NULL,

  refund_mode VARCHAR(40) NULL
    CONSTRAINT marketplace_article_app_bid_econ_refund_mode_chk
      CHECK (
        refund_mode IS NULL
        OR refund_mode IN ('same_bucket_restore', 'compensating_grant_30d')
      ),
  refund_ledger_entry_id BIGINT NULL
    REFERENCES marketplace_bid_credit_ledger_entries(id) ON DELETE RESTRICT,
  compensating_grant_id BIGINT NULL
    REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
  refund_idempotency_key VARCHAR(200) NULL,

  idempotency_key VARCHAR(200) NOT NULL,
  fefo_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  charged_at TIMESTAMPTZ NULL,
  refunded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT marketplace_article_app_bid_econ_application_uidx
    UNIQUE (article_application_id),
  CONSTRAINT marketplace_article_app_bid_econ_article_fl_uidx
    UNIQUE (article_id, freelancer_user_id),
  CONSTRAINT marketplace_article_app_bid_econ_idem_uidx
    UNIQUE (idempotency_key),
  CONSTRAINT marketplace_article_app_bid_econ_refund_idem_uidx
    UNIQUE (refund_idempotency_key)
);

CREATE INDEX IF NOT EXISTS marketplace_article_app_bid_econ_article_idx
  ON marketplace_article_application_bid_credit_economics (article_id, charged_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_article_app_bid_econ_freelancer_idx
  ON marketplace_article_application_bid_credit_economics (freelancer_user_id, charged_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_article_app_bid_econ_refund_idx
  ON marketplace_article_application_bid_credit_economics (article_id, refund_status)
  WHERE charge_status = 'charged' AND refund_status = 'none';

COMMENT ON TABLE marketplace_article_application_bid_credit_economics IS
  'Phase B5: Article application Bid charge/refund (1 Bid flat). Independent of order_freelancer_bid_credit_economics. No historical backfill.';

COMMENT ON COLUMN marketplace_article_application_bid_credit_economics.bid_credit_cost IS
  'Always 1. Not derived from article_level / article_value_jod / membership.';

COMMENT ON COLUMN marketplace_article_application_bid_credit_economics.refund_status IS
  'none until Article closes/cancels with zero selected; refunded via same-bucket or compensating +30d. Withdrawal/reject/loser stay none.';

INSERT INTO schema_migrations (version)
VALUES ('150_article_application_bid_credit_economics')
ON CONFLICT (version) DO NOTHING;

COMMIT;
