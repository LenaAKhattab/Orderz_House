-- 195: Legacy Freelancer Campaign workspace support
-- Additive only: link view counter, recoverable encrypted invite token, soft archive.
-- No plaintext tokens. No production deploy implied by this migration alone.

BEGIN;

ALTER TABLE legacy_freelancer_invite_campaigns
  ADD COLUMN IF NOT EXISTS link_view_count BIGINT NOT NULL DEFAULT 0
    CONSTRAINT lfic_link_view_count_chk CHECK (link_view_count >= 0);

-- AES-256-GCM ciphertext payload for admin-only invite URL recovery.
-- Format: v1:<iv_b64>:<tag_b64>:<cipher_b64>  (see legacyInviteTokenCrypto.js)
-- NULL for campaigns created before this migration until token is regenerated.
ALTER TABLE legacy_freelancer_invite_campaigns
  ADD COLUMN IF NOT EXISTS invite_token_encrypted TEXT NULL,
  ADD COLUMN IF NOT EXISTS invite_token_wrapped_at TIMESTAMPTZ NULL;

ALTER TABLE legacy_freelancer_invite_campaigns
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by_admin_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lfic_archived_at_idx
  ON legacy_freelancer_invite_campaigns (archived_at)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN legacy_freelancer_invite_campaigns.link_view_count IS
  'Total successful public invite preview loads (not unique visitors).';

COMMENT ON COLUMN legacy_freelancer_invite_campaigns.invite_token_encrypted IS
  'Server-side AES-GCM wrapped invite token for admin link recovery. Never plaintext.';

COMMIT;
