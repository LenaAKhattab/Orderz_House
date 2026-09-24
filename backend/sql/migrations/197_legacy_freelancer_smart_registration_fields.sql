-- 197: Legacy Freelancer smart registration fields
-- Additive: answers field_key index + disable university-student question on public defaults.
-- Does NOT delete historical answers. Does NOT touch campaign tokens/identity.

BEGIN;

CREATE INDEX IF NOT EXISTS lfia_field_key_idx
  ON legacy_freelancer_invite_answers (field_key);

-- Hide university-student question (+ dependents) from new public registrations.
-- Historical answer rows remain readable in Admin detail.
UPDATE legacy_freelancer_invite_campaign_fields
   SET is_enabled = FALSE,
       is_required = FALSE,
       updated_at = NOW()
 WHERE field_key IN (
   'is_university_student',
   'current_university',
   'has_university_commitments',
   'university_commitment_value'
 );

INSERT INTO schema_migrations (version)
VALUES ('197_legacy_freelancer_smart_registration_fields')
ON CONFLICT (version) DO NOTHING;

COMMIT;
