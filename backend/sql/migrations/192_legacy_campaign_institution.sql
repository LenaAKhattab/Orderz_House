-- 192: Optional Institution assignment for Legacy Freelancer Invite campaigns
-- Additive only. Nullable FK. No Campaign 2 changes. No token/seat changes.

BEGIN;

ALTER TABLE legacy_freelancer_invite_campaigns
  ADD COLUMN IF NOT EXISTS institution_id BIGINT NULL
    REFERENCES institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lfic_institution_id_idx
  ON legacy_freelancer_invite_campaigns (institution_id)
  WHERE institution_id IS NOT NULL;

COMMIT;

INSERT INTO schema_migrations (version)
VALUES ('192_legacy_campaign_institution')
ON CONFLICT (version) DO NOTHING;
