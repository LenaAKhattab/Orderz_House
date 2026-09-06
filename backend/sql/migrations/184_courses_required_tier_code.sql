-- Courses-Gating-01: minimum marketplace membership tier per course (additive).
-- Default existing rows to silver so premium courses stay locked for STARTER until admin adjusts.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS required_tier_code VARCHAR(16) NOT NULL DEFAULT 'silver';

COMMENT ON COLUMN courses.required_tier_code IS
  'Minimum marketplace membership tier required to access course content (starter|silver|pro|elite). Visibility/assignment is separate.';

UPDATE courses
   SET required_tier_code = 'silver'
 WHERE required_tier_code IS NULL
    OR TRIM(required_tier_code) = '';

ALTER TABLE courses
  DROP CONSTRAINT IF EXISTS courses_required_tier_code_check;

ALTER TABLE courses
  ADD CONSTRAINT courses_required_tier_code_check
  CHECK (required_tier_code IN ('starter', 'silver', 'pro', 'elite'));
