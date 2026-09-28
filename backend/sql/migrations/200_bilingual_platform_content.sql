-- 200: English columns for OrderzHouse-owned platform content.
-- Additive only. Does not rewrite Arabic columns or existing rows.

BEGIN;

ALTER TABLE website_faq_items
  ADD COLUMN IF NOT EXISTS question_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS answer_en TEXT NULL;

ALTER TABLE public_site_pages
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS menu_label_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS content_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS meta_title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS meta_description_en TEXT NULL;

ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL;

ALTER TABLE website_page_blocks
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS body_en TEXT NULL;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS title_en TEXT NULL;

COMMENT ON COLUMN website_faq_items.question_en IS
  'English FAQ question. Arabic remains in question. Empty means English is not authored yet.';
COMMENT ON COLUMN public_site_pages.content_en IS
  'English page body. Arabic remains in content.';

INSERT INTO schema_migrations (version)
VALUES ('200_bilingual_platform_content')
ON CONFLICT (version) DO NOTHING;

COMMIT;
