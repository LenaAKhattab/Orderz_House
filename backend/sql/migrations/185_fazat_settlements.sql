-- 185: FAZAT settlement review queue + minimal JOD cash ledger for managed-order credits.
-- ADDITIVE ONLY. Does not mutate existing financial claims, Stripe, Bid Credits, or partner orders rows.
-- Does not enable FAZAT_INTEGRATION_ENABLED.
-- Freelancer-visible ledger text must stay white-label (no FAZAT/FAZ3AT branding).

BEGIN;

-- ---------------------------------------------------------------------------
-- Minimal JOD cash wallet (Orderz previously had no cash available-balance wallet).
-- Pattern mirrors Work Token wallet: aggregates + append-only ledger + idempotency.
-- First consumer: FAZAT settlement admin approval. Not a Stripe/payout replacement.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freelancer_cash_wallets (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  available_minor BIGINT NOT NULL DEFAULT 0
    CONSTRAINT freelancer_cash_wallets_available_chk CHECK (available_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'JOD',
  version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT freelancer_cash_wallets_user_uidx UNIQUE (freelancer_user_id)
);

COMMENT ON TABLE freelancer_cash_wallets IS
  'Available JOD balance projection for managed-order credits. Ledger is source of truth.';

CREATE TABLE IF NOT EXISTS freelancer_cash_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL REFERENCES freelancer_cash_wallets(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  direction SMALLINT NOT NULL
    CONSTRAINT freelancer_cash_ledger_direction_chk CHECK (direction IN (-1, 1)),
  amount_minor BIGINT NOT NULL
    CONSTRAINT freelancer_cash_ledger_amount_chk CHECK (amount_minor > 0),
  balance_after_minor BIGINT NOT NULL
    CONSTRAINT freelancer_cash_ledger_balance_after_chk CHECK (balance_after_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'JOD',
  event_type TEXT NOT NULL,
  description_public TEXT NOT NULL,
  description_internal TEXT,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT freelancer_cash_ledger_idem_uidx UNIQUE (idempotency_key),
  CONSTRAINT freelancer_cash_ledger_wallet_idem_uidx UNIQUE (wallet_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS freelancer_cash_ledger_freelancer_created_idx
  ON freelancer_cash_ledger_entries (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS freelancer_cash_ledger_ref_idx
  ON freelancer_cash_ledger_entries (reference_type, reference_id);

COMMENT ON COLUMN freelancer_cash_ledger_entries.description_public IS
  'Freelancer-visible white-label text. Must not contain FAZAT/FAZ3AT.';

-- ---------------------------------------------------------------------------
-- FAZAT settlement review queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fazat_settlements (
  id BIGSERIAL PRIMARY KEY,
  partner_code TEXT NOT NULL DEFAULT 'FAZAT' REFERENCES integration_partners(code) ON DELETE RESTRICT,
  fazat_settlement_id TEXT NOT NULL,
  fazat_order_id TEXT NOT NULL,
  fazat_external_assignment_id TEXT,
  orderz_partner_order_id BIGINT REFERENCES partner_orders(id) ON DELETE SET NULL,
  orderz_order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL
    CONSTRAINT fazat_settlements_amount_chk CHECK (amount_minor > 0),
  adjusted_amount_minor BIGINT
    CONSTRAINT fazat_settlements_adjusted_chk CHECK (adjusted_amount_minor IS NULL OR adjusted_amount_minor > 0),
  final_amount_minor BIGINT
    CONSTRAINT fazat_settlements_final_chk CHECK (final_amount_minor IS NULL OR final_amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'JOD',
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CONSTRAINT fazat_settlements_status_chk CHECK (status IN (
      'PENDING_REVIEW',
      'APPROVED_CREDITED',
      'REJECTED',
      'ADJUSTED_APPROVED',
      'CREDIT_FAILED',
      'VOIDED'
    )),
  source_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_label TEXT,
  admin_note TEXT,
  adjustment_reason TEXT,
  rejection_reason TEXT,
  approved_by_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejected_by_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  adjusted_by_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  wallet_ledger_entry_id BIGINT UNIQUE REFERENCES freelancer_cash_ledger_entries(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  completed_at_source TIMESTAMPTZ,
  credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fazat_settlements_fazat_id_uidx UNIQUE (partner_code, fazat_settlement_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fazat_settlements_idempotency_uidx
  ON fazat_settlements (partner_code, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS fazat_settlements_status_created_idx
  ON fazat_settlements (status, created_at DESC);

CREATE INDEX IF NOT EXISTS fazat_settlements_freelancer_idx
  ON fazat_settlements (freelancer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fazat_settlement_events (
  id BIGSERIAL PRIMARY KEY,
  settlement_id BIGINT NOT NULL REFERENCES fazat_settlements(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fazat_settlement_events_settlement_idx
  ON fazat_settlement_events (settlement_id, created_at DESC);

COMMENT ON TABLE fazat_settlements IS
  'Inbound FAZAT settlement requests pending Orderz admin review before JOD cash ledger credit.';

COMMIT;
