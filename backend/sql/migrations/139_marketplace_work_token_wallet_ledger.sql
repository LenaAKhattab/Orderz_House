-- 139: Marketplace Work Token Wallet + Ledger + Reservations — ADDITIVE ONLY.
-- Phase 4 accounting foundation. Empty tables. No backfill. No Token grants.
-- No Stripe. No auctions. No Order application wiring. No economy flag flips.
-- Do NOT apply to Production from agent tasks; review then migrate explicitly.
-- Does NOT modify 134–138 or legacy plans / freelancer_subscriptions.
--
-- Hardening (pre-apply):
-- - Reservation identity is WALLET-SCOPED: UNIQUE(wallet_id, reference_type, reference_id)
-- - Ledger operation idempotency is separate from business reference:
--     UNIQUE(wallet_id, idempotency_key)

BEGIN;

-- =========================================================
-- Freelancer Work Token Wallet (current aggregates)
-- Ledger is authoritative history; wallet is projection.
-- Lazy creation only — do NOT seed wallets for all freelancers.
-- =========================================================
CREATE TABLE IF NOT EXISTS freelancer_work_token_wallets (
  id BIGSERIAL PRIMARY KEY,

  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  available_tokens BIGINT NOT NULL DEFAULT 0
    CHECK (available_tokens >= 0),
  reserved_tokens BIGINT NOT NULL DEFAULT 0
    CHECK (reserved_tokens >= 0),

  -- Monotonic counter for debugging / optimistic awareness (not required for correctness)
  version BIGINT NOT NULL DEFAULT 0
    CHECK (version >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT freelancer_work_token_wallets_freelancer_uidx UNIQUE (freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS freelancer_work_token_wallets_updated_idx
  ON freelancer_work_token_wallets (updated_at DESC);

COMMENT ON TABLE freelancer_work_token_wallets IS
  'Marketplace Work Token wallet aggregates (AVAILABLE + RESERVED). Integer tokens only. Lazy-created. Phase 4.';

COMMENT ON COLUMN freelancer_work_token_wallets.available_tokens IS
  'Tokens free to reserve or (future) spend. Never negative.';

COMMENT ON COLUMN freelancer_work_token_wallets.reserved_tokens IS
  'Tokens held by active reservations. Must equal SUM(active reservation.reserved_tokens).';

-- =========================================================
-- Reservations (what holds reserved Tokens)
-- Identity is per-wallet: UNIQUE(wallet_id, reference_type, reference_id)
-- Two freelancers MAY share the same business reference.
-- =========================================================
CREATE TABLE IF NOT EXISTS work_token_reservations (
  id BIGSERIAL PRIMARY KEY,

  wallet_id BIGINT NOT NULL REFERENCES freelancer_work_token_wallets(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  reference_type VARCHAR(80) NOT NULL,
  reference_id VARCHAR(120) NOT NULL,

  -- Currently held (active) amount
  reserved_tokens BIGINT NOT NULL DEFAULT 0
    CHECK (reserved_tokens >= 0),
  -- Permanently consumed from this reservation (historical)
  consumed_tokens BIGINT NOT NULL DEFAULT 0
    CHECK (consumed_tokens >= 0),

  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'consumed', 'cancelled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,

  CONSTRAINT work_token_reservations_active_has_amount
    CHECK (
      (status = 'active' AND reserved_tokens > 0)
      OR (status <> 'active' AND reserved_tokens = 0)
    ),
  CONSTRAINT work_token_reservations_terminal_consumed
    CHECK (
      status <> 'consumed'
      OR (consumed_tokens > 0 AND released_at IS NULL)
    ),
  CONSTRAINT work_token_reservations_wallet_reference_uidx
    UNIQUE (wallet_id, reference_type, reference_id)
);

CREATE INDEX IF NOT EXISTS work_token_reservations_wallet_status_idx
  ON work_token_reservations (wallet_id, status);

CREATE INDEX IF NOT EXISTS work_token_reservations_freelancer_idx
  ON work_token_reservations (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS work_token_reservations_active_idx
  ON work_token_reservations (wallet_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS work_token_reservations_reference_idx
  ON work_token_reservations (reference_type, reference_id);

COMMENT ON TABLE work_token_reservations IS
  'Identifiable Work Token holds. Unique per wallet + business reference. Phase 4.';

COMMENT ON CONSTRAINT work_token_reservations_wallet_reference_uidx ON work_token_reservations IS
  'Wallet-scoped reservation identity. Cross-freelancer identical references are allowed.';

-- =========================================================
-- Append-only ledger (immutable accounting history)
-- Operation idempotency: UNIQUE(wallet_id, idempotency_key)
-- Business reference (reference_type/id) is separate and may repeat.
-- =========================================================
CREATE TABLE IF NOT EXISTS work_token_ledger_entries (
  id BIGSERIAL PRIMARY KEY,

  wallet_id BIGINT NOT NULL REFERENCES freelancer_work_token_wallets(id) ON DELETE RESTRICT,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reservation_id BIGINT NULL REFERENCES work_token_reservations(id) ON DELETE RESTRICT,

  event_type VARCHAR(60) NOT NULL
    CHECK (
      event_type IN (
        'TOKEN_CREDIT',
        'TOKEN_RESERVE',
        'TOKEN_RELEASE',
        'TOKEN_CONSUME',
        'TOKEN_CONSUME_AVAILABLE',
        'MEMBERSHIP_CYCLE_GRANT',
        'IDENTITY_VERIFICATION_BONUS',
        'PAYOUT_VERIFICATION_BONUS',
        'ADMIN_ADJUSTMENT_CREDIT',
        'ADMIN_ADJUSTMENT_DEBIT',
        'PRIORITY_BID_RESERVE',
        'PRIORITY_BID_INCREASE_RESERVE',
        'PRIORITY_BID_RELEASE',
        'PRIORITY_BID_CONSUME'
      )
    ),

  -- Always positive quantity; direction encoded in balance_effect + deltas
  amount_tokens BIGINT NOT NULL
    CHECK (amount_tokens > 0),

  balance_effect VARCHAR(40) NOT NULL
    CHECK (
      balance_effect IN (
        'credit_available',
        'reserve',
        'release',
        'consume_reserved',
        'consume_available'
      )
    ),

  available_delta BIGINT NOT NULL,
  reserved_delta BIGINT NOT NULL,
  available_after BIGINT NOT NULL
    CHECK (available_after >= 0),
  reserved_after BIGINT NOT NULL
    CHECK (reserved_after >= 0),

  -- Business / economic reference (may repeat across operations on same wallet)
  reference_type VARCHAR(80) NOT NULL,
  reference_id VARCHAR(120) NOT NULL,

  -- Explicit operation idempotency key (caller-owned or stable default)
  idempotency_key VARCHAR(180) NOT NULL,

  related_entry_id BIGINT NULL REFERENCES work_token_ledger_entries(id) ON DELETE RESTRICT,

  reason TEXT NULL,
  metadata_json JSONB NULL,
  actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT work_token_ledger_entries_delta_effect
    CHECK (
      (balance_effect = 'credit_available'
        AND available_delta = amount_tokens AND reserved_delta = 0)
      OR (balance_effect = 'reserve'
        AND available_delta = -amount_tokens AND reserved_delta = amount_tokens)
      OR (balance_effect = 'release'
        AND available_delta = amount_tokens AND reserved_delta = -amount_tokens)
      OR (balance_effect = 'consume_reserved'
        AND available_delta = 0 AND reserved_delta = -amount_tokens)
      OR (balance_effect = 'consume_available'
        AND available_delta = -amount_tokens AND reserved_delta = 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS work_token_ledger_entries_wallet_idempotency_uidx
  ON work_token_ledger_entries (wallet_id, idempotency_key);

CREATE INDEX IF NOT EXISTS work_token_ledger_entries_wallet_created_idx
  ON work_token_ledger_entries (wallet_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS work_token_ledger_entries_freelancer_created_idx
  ON work_token_ledger_entries (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS work_token_ledger_entries_reference_idx
  ON work_token_ledger_entries (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS work_token_ledger_entries_reservation_idx
  ON work_token_ledger_entries (reservation_id)
  WHERE reservation_id IS NOT NULL;

COMMENT ON TABLE work_token_ledger_entries IS
  'Append-only Work Token ledger. Corrections require compensating entries. Phase 4.';

COMMENT ON COLUMN work_token_ledger_entries.idempotency_key IS
  'Caller/operation idempotency key. Unique per wallet. Separate from business reference_type/id.';

COMMENT ON INDEX work_token_ledger_entries_wallet_idempotency_uidx IS
  'Prevents duplicate application of the same operation key on a wallet.';

-- Explicit: economy engines remain OFF. This migration must NOT flip flags.
-- (No UPDATE on marketplace_economy_settings.)

INSERT INTO schema_migrations (version) VALUES ('139_marketplace_work_token_wallet_ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
