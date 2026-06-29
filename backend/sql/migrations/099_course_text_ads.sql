-- 099_course_text_ads
-- Admin-managed moving text ads for freelancer course pages.

BEGIN;

CREATE TABLE IF NOT EXISTS course_text_ads (
  id BIGSERIAL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  text_ar VARCHAR(200) NOT NULL DEFAULT '',
  text_en VARCHAR(200) NULL,
  url TEXT NULL,
  placement VARCHAR(32) NOT NULL DEFAULT 'both',
  course_id BIGINT NULL REFERENCES courses(id) ON DELETE CASCADE,
  direction VARCHAR(16) NOT NULL DEFAULT 'vertical',
  speed VARCHAR(16) NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_text_ads_placement_chk CHECK (
    placement IN ('courses_list', 'all_course_details', 'both', 'specific_course')
  ),
  CONSTRAINT course_text_ads_direction_chk CHECK (direction IN ('horizontal', 'vertical')),
  CONSTRAINT course_text_ads_speed_chk CHECK (speed IN ('slow', 'normal', 'fast')),
  CONSTRAINT course_text_ads_specific_course_chk CHECK (
    (placement = 'specific_course' AND course_id IS NOT NULL)
    OR (placement <> 'specific_course' AND course_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_course_text_ads_list
  ON course_text_ads (enabled, placement, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_text_ads_specific
  ON course_text_ads (enabled, course_id, updated_at DESC)
  WHERE placement = 'specific_course';

INSERT INTO schema_migrations (version)
VALUES ('099_course_text_ads')
ON CONFLICT (version) DO NOTHING;

COMMIT;
