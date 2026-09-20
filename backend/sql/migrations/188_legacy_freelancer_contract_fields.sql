-- 188: Legacy Freelancer contract registration fields (per-campaign config + answers)
-- Additive only. No DROP/TRUNCATE. No token/campaign identity changes.

BEGIN;

CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_campaign_fields (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES legacy_freelancer_invite_campaigns(id) ON DELETE CASCADE,
  field_key VARCHAR(80) NOT NULL,
  label_ar TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lficf_campaign_field_uidx UNIQUE (campaign_id, field_key),
  CONSTRAINT lficf_required_implies_enabled_chk CHECK (is_required = FALSE OR is_enabled = TRUE)
);

CREATE INDEX IF NOT EXISTS lficf_campaign_enabled_idx
  ON legacy_freelancer_invite_campaign_fields (campaign_id, is_enabled, sort_order);

CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_answers (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES legacy_freelancer_invite_campaigns(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redemption_id BIGINT NULL REFERENCES legacy_freelancer_invite_redemptions(id) ON DELETE SET NULL,
  field_key VARCHAR(80) NOT NULL,
  value_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lfia_user_campaign_field_uidx UNIQUE (user_id, campaign_id, field_key)
);

CREATE INDEX IF NOT EXISTS lfia_campaign_user_idx
  ON legacy_freelancer_invite_answers (campaign_id, user_id);

CREATE INDEX IF NOT EXISTS lfia_redemption_idx
  ON legacy_freelancer_invite_answers (redemption_id);

COMMENT ON TABLE legacy_freelancer_invite_campaign_fields IS
  'Per-campaign Legacy contract form configuration (enable/require/label/order).';
COMMENT ON TABLE legacy_freelancer_invite_answers IS
  'Submitted Legacy contract answers. Sensitive PII must not be copied into audit logs.';

INSERT INTO schema_migrations (version)
VALUES ('188_legacy_freelancer_contract_fields')
ON CONFLICT (version) DO NOTHING;

COMMIT;
