-- 172: Freelancer Activation Engine Phase A8 — Work Inventory Reserve ledger.
-- Additive only. Global reserve flag DEFAULT FALSE. No backfill.
-- Does not mutate wallet/claims/payment/Stripe/orders/Pantry/Bildazo.
-- Do NOT apply to production from this phase.

BEGIN;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_work_inventory_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE marketplace_economy_settings
  ADD COLUMN IF NOT EXISTS freelancer_activation_work_inventory_percentage NUMERIC(6, 3) NOT NULL DEFAULT 50.000;

ALTER TABLE marketplace_economy_settings
  DROP CONSTRAINT IF EXISTS marketplace_economy_settings_fae_wir_pct_chk;
ALTER TABLE marketplace_economy_settings
  ADD CONSTRAINT marketplace_economy_settings_fae_wir_pct_chk
  CHECK (
    freelancer_activation_work_inventory_percentage >= 0
    AND freelancer_activation_work_inventory_percentage <= 100
  );

COMMENT ON COLUMN marketplace_economy_settings.freelancer_activation_work_inventory_enabled IS
  'A8: when TRUE and Activation Engine enabled, allocate Work Inventory Reserve on paid membership sync. Default FALSE.';
COMMENT ON COLUMN marketplace_economy_settings.freelancer_activation_work_inventory_percentage IS
  'A8: percent of catalog plan price allocated to Work Inventory Reserve (0–100). Default 50.000.';

CREATE TABLE IF NOT EXISTS freelancer_activation_work_inventory_reserve_entries (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  trial_id BIGINT NULL REFERENCES freelancer_activation_trials(id) ON DELETE SET NULL,
  membership_id BIGINT NULL,
  activation_request_id BIGINT NULL,
  campaign_id BIGINT NULL,
  wave_id BIGINT NULL,
  plan_code VARCHAR(32) NULL,
  plan_price_jod NUMERIC(12, 3) NOT NULL,
  reserve_percentage NUMERIC(6, 3) NOT NULL,
  reserve_amount_jod NUMERIC(12, 3) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'JOD',
  entry_type VARCHAR(40) NOT NULL
    CONSTRAINT fae_wir_entry_type_chk
    CHECK (entry_type IN (
      'membership_reserve_allocated',
      'membership_reserve_reversed',
      'manual_adjustment'
    )),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CONSTRAINT fae_wir_status_chk
    CHECK (status IN ('active', 'reversed')),
  idempotency_key VARCHAR(160) NOT NULL,
  metadata JSONB NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fae_wir_idempotency_uidx UNIQUE (idempotency_key),
  CONSTRAINT fae_wir_amounts_nonneg_chk
    CHECK (
      plan_price_jod >= 0
      AND reserve_percentage >= 0
      AND reserve_percentage <= 100
      AND reserve_amount_jod >= 0
    )
);

CREATE INDEX IF NOT EXISTS fae_wir_freelancer_idx
  ON freelancer_activation_work_inventory_reserve_entries (freelancer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fae_wir_status_idx
  ON freelancer_activation_work_inventory_reserve_entries (status, created_at DESC);

CREATE INDEX IF NOT EXISTS fae_wir_plan_code_idx
  ON freelancer_activation_work_inventory_reserve_entries (plan_code, created_at DESC)
  WHERE plan_code IS NOT NULL;

COMMENT ON TABLE freelancer_activation_work_inventory_reserve_entries IS
  'A8: internal Work Inventory Reserve ledger. Not wallet, claims, or payment. Catalog-price based.';

INSERT INTO schema_migrations (version)
VALUES ('172_freelancer_activation_work_inventory_reserve_a8')
ON CONFLICT (version) DO NOTHING;

COMMIT;
