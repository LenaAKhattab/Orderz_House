-- 214_payment_checkout_funnel_events
-- First-party checkout journey signals (analytics / telemetry only).
-- NEVER grants membership, marks orders paid, or overrides Stripe webhook truth.
--
-- Additive only. Rollback (ops manual): remove table payment_checkout_funnel_events
-- and clear schema_migrations row version 214_payment_checkout_funnel_events.

BEGIN;

CREATE TABLE IF NOT EXISTS payment_checkout_funnel_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(40) NOT NULL,
  payment_flow VARCHAR(64) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  locale VARCHAR(5) NULL,
  stripe_checkout_session_id VARCHAR(255) NULL,
  local_ref VARCHAR(96) NOT NULL,
  actor_user_id INTEGER NOT NULL,
  dedupe_key TEXT GENERATED ALWAYS AS (COALESCE(stripe_checkout_session_id, local_ref)) STORED,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_checkout_funnel_events_type_chk CHECK (
    event_type IN (
      'checkout_requested',
      'checkout_session_created',
      'checkout_redirect_started',
      'checkout_cancel_returned',
      'checkout_success_returned'
    )
  ),
  CONSTRAINT payment_checkout_funnel_events_channel_chk CHECK (channel IN ('web', 'mobile')),
  CONSTRAINT payment_checkout_funnel_events_locale_chk CHECK (
    locale IS NULL OR locale IN ('ar', 'en', 'de', 'nl', 'ro')
  ),
  CONSTRAINT payment_checkout_funnel_events_session_chk CHECK (
    stripe_checkout_session_id IS NULL
    OR stripe_checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'
  ),
  CONSTRAINT payment_checkout_funnel_events_local_ref_chk CHECK (
    length(btrim(local_ref)) > 0 AND length(local_ref) <= 96
  ),
  CONSTRAINT payment_checkout_funnel_events_dedupe_uidx UNIQUE (event_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS payment_checkout_funnel_events_occurred_idx
  ON payment_checkout_funnel_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS payment_checkout_funnel_events_session_idx
  ON payment_checkout_funnel_events (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_checkout_funnel_events_flow_idx
  ON payment_checkout_funnel_events (payment_flow, occurred_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('214_payment_checkout_funnel_events')
ON CONFLICT (version) DO NOTHING;

COMMIT;
