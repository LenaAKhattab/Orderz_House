-- 179: Freelancer courses paid-membership gate (additive).
-- Premium writing courses remain visible as locked teasers for Starter/Trial users.
-- Do NOT apply to production without staging E2E approval.

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS requires_paid_membership BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN courses.requires_paid_membership IS
  'When TRUE, only Silver/Pro/Elite (or explicit assignment) may open/start the course.';

-- Known premium writing courses (EN + AR titles used in production/staging seeds).
UPDATE courses
   SET requires_paid_membership = TRUE
 WHERE title ILIKE '%كتابة المحتوى%'
    OR title ILIKE '%content writing%';

INSERT INTO schema_migrations (version)
VALUES ('179_freelancer_courses_paid_membership_gate')
ON CONFLICT (version) DO NOTHING;

COMMIT;
