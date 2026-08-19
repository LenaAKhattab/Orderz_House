-- 164: OrderzHouse-side Bildazo writer link requests (Phase 0B).
-- Additive CREATE TABLE. Apply after 163 via db:migrate:production:next with approvals.
-- Additive CREATE TABLE only. Does not call Bildazo.
-- status = linked is set by Super Admin manual link (Phase 0C) or OrderzHouse S2S when BILDAZO_AUTHOR_SYNC_ENABLED (Phase 1B).
-- IP capture for consent is deferred (no established safe IP-consent pattern in this codebase).

BEGIN;

CREATE TABLE IF NOT EXISTS freelancer_bildazo_author_links (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL UNIQUE
    REFERENCES users (id) ON DELETE CASCADE,
  link_flow VARCHAR(32) NOT NULL
    CHECK (link_flow IN ('new_account', 'existing_account')),
  status VARCHAR(48) NOT NULL
    CHECK (status IN (
      'not_started',
      'pending_new_account',
      'pending_existing_account',
      'pending_external_verification',
      'pending_manual_link',
      'linked',
      'needs_manual_review',
      'failed',
      'blocked'
    )),
  orderz_verified_email VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NULL,
  phone_e164 VARCHAR(20) NULL,
  country_iso CHAR(2) NULL,
  bio TEXT NULL,
  existing_bildazo_email VARCHAR(255) NULL,
  existing_bildazo_public_id VARCHAR(120) NULL,
  existing_bildazo_profile_url TEXT NULL,
  email_matches_orderz BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_terms_version VARCHAR(64) NOT NULL,
  accepted_terms_snapshot JSONB NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'orderzhouse',
  bildazo_user_id VARCHAR(80) NULL,
  bildazo_public_id VARCHAR(120) NULL,
  bildazo_profile_url TEXT NULL,
  linked_at TIMESTAMPTZ NULL,
  linked_by_user_id BIGINT NULL
    REFERENCES users (id) ON DELETE SET NULL,
  manual_review_reason TEXT NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT freelancer_bildazo_author_links_linked_fields_chk
    CHECK (
      status <> 'linked'
      OR (
        linked_at IS NOT NULL
        AND (bildazo_user_id IS NOT NULL OR bildazo_public_id IS NOT NULL OR bildazo_profile_url IS NOT NULL)
      )
    )
);

CREATE INDEX IF NOT EXISTS freelancer_bildazo_author_links_status_idx
  ON freelancer_bildazo_author_links (status, updated_at DESC);

COMMENT ON TABLE freelancer_bildazo_author_links IS
  'OrderzHouse-only Bildazo writer link requests. Does not prove a Bildazo user exists unless status=linked.';

COMMIT;
