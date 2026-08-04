-- 125: FAZ3AT workforce provider foundation (partner overlay + mapping + messages + webhooks + audit).
-- Does not alter existing public order workflows or fake/training tables.
-- Safe additive migration for staging/local only until explicitly applied.

BEGIN;

CREATE TABLE IF NOT EXISTS integration_partners (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  api_key_hash TEXT,
  webhook_url TEXT,
  notes_internal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_freelancer_profiles (
  id BIGSERIAL PRIMARY KEY,
  partner_code TEXT NOT NULL REFERENCES integration_partners(code) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank TEXT NOT NULL DEFAULT 'UNAPPROVED'
    CHECK (rank IN ('UNAPPROVED', 'APPROVED', 'TRUSTED')),
  is_assignable BOOLEAN NOT NULL DEFAULT FALSE,
  notes_internal TEXT,
  skills_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_code, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_freelancer_profiles_partner_rank
  ON partner_freelancer_profiles (partner_code, rank, is_assignable);

CREATE TABLE IF NOT EXISTS partner_orders (
  id BIGSERIAL PRIMARY KEY,
  partner_code TEXT NOT NULL REFERENCES integration_partners(code) ON DELETE RESTRICT,
  orderz_order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  external_assignment_id TEXT NOT NULL,
  external_order_id TEXT,
  freelancer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'created',
  settlement_status TEXT NOT NULL DEFAULT 'pending_internal_settlement',
  idempotency_key TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_code, external_assignment_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_orders_idempotency
  ON partner_orders (partner_code, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_orders_orderz_order_id
  ON partner_orders (orderz_order_id);

CREATE TABLE IF NOT EXISTS partner_order_messages (
  id BIGSERIAL PRIMARY KEY,
  partner_order_id BIGINT NOT NULL REFERENCES partner_orders(id) ON DELETE CASCADE,
  orderz_order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('partner_to_freelancer', 'freelancer_to_partner', 'system')),
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  external_message_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_order_messages_external
  ON partner_order_messages (partner_order_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_order_messages_order
  ON partner_order_messages (orderz_order_id, id);

CREATE TABLE IF NOT EXISTS partner_request_nonces (
  partner_code TEXT NOT NULL,
  nonce TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (partner_code, nonce)
);

CREATE INDEX IF NOT EXISTS idx_partner_request_nonces_seen_at
  ON partner_request_nonces (seen_at);

CREATE TABLE IF NOT EXISTS partner_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  partner_code TEXT NOT NULL REFERENCES integration_partners(code) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  partner_order_id BIGINT REFERENCES partner_orders(id) ON DELETE SET NULL,
  orderz_order_id BIGINT,
  payload_json JSONB NOT NULL,
  signature_header TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_integration_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  partner_code TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'partner',
  entity_type TEXT,
  entity_id TEXT,
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_integration_audit_logs_partner_created
  ON partner_integration_audit_logs (partner_code, created_at DESC);

INSERT INTO integration_partners (code, name, enabled, notes_internal)
VALUES (
  'FAZAT',
  'FAZ3AT',
  FALSE,
  'Workforce provider partner. Secrets live in env (FAZAT_INTEGRATION_*), not in this row.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('125_fazat_workforce_provider')
ON CONFLICT (version) DO NOTHING;

COMMIT;
