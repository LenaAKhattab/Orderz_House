-- 196: Separate Legacy work areas from detailed users.skills
-- Additive only. Staging application only — do not apply to Production from this patch alone.
--
-- Problem: content_writing/design/programming were stored in users.skills, colliding with
-- contract field skills_programs ("المهارات والبرامج المتمكن منها") which also writes users.skills.
--
-- Fix: dedicated users.legacy_work_areas TEXT[] for general work areas.
-- users.skills remains detailed skills/programs only.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS legacy_work_areas TEXT[] NULL;

COMMENT ON COLUMN users.legacy_work_areas IS
  'Legacy Freelancer general work areas (content_writing|design|programming). Separate from users.skills detailed programs.';

CREATE INDEX IF NOT EXISTS users_legacy_work_areas_gin_idx
  ON users USING GIN (legacy_work_areas)
  WHERE legacy_work_areas IS NOT NULL;

-- Non-destructive backfill: copy known work-area keys out of skills into legacy_work_areas
-- only when legacy_work_areas is still empty. Then strip those keys from skills so both concepts coexist.
UPDATE users u
   SET legacy_work_areas = sub.areas
  FROM (
    SELECT id,
           ARRAY(
             SELECT DISTINCT k
               FROM unnest(COALESCE(skills, ARRAY[]::text[])) AS k
              WHERE k IN ('content_writing', 'design', 'programming')
              ORDER BY k
           ) AS areas
      FROM users
     WHERE skills IS NOT NULL
       AND skills && ARRAY['content_writing', 'design', 'programming']::text[]
       AND (legacy_work_areas IS NULL OR cardinality(legacy_work_areas) = 0)
  ) sub
 WHERE u.id = sub.id
   AND cardinality(sub.areas) > 0;

UPDATE users
   SET skills = ARRAY(
         SELECT x
           FROM unnest(skills) AS x
          WHERE x NOT IN ('content_writing', 'design', 'programming')
       )
 WHERE skills IS NOT NULL
   AND skills && ARRAY['content_writing', 'design', 'programming']::text[];

-- Empty array -> NULL for cleanliness
UPDATE users
   SET skills = NULL
 WHERE skills IS NOT NULL
   AND cardinality(skills) = 0;

INSERT INTO schema_migrations (version)
VALUES ('196_legacy_work_areas')
ON CONFLICT (version) DO NOTHING;

COMMIT;
