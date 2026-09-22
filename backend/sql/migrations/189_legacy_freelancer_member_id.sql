-- 189: Freelancer business/member ID for Legacy Invite freelancers.
-- Additive only. Does NOT change users.id or any FK relationships.
-- For LEGACY_INVITE users, freelancer_member_id holds the Jordanian national ID.
-- Partial unique index: scoped to Legacy freelancers only (safe for non-Legacy NULLs).

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS freelancer_member_id VARCHAR(32) NULL;

COMMENT ON COLUMN users.freelancer_member_id IS
  'Business/member Freelancer ID. For LEGACY_INVITE freelancers equals validated national ID. Not a PK.';

-- Uniqueness only among Legacy Invite freelancers with a member ID set.
CREATE UNIQUE INDEX IF NOT EXISTS users_legacy_freelancer_member_id_uidx
  ON users (freelancer_member_id)
  WHERE onboarding_source = 'LEGACY_INVITE'
    AND freelancer_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_freelancer_member_id_lookup_idx
  ON users (freelancer_member_id)
  WHERE freelancer_member_id IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('189_legacy_freelancer_member_id')
ON CONFLICT (version) DO NOTHING;

COMMIT;
