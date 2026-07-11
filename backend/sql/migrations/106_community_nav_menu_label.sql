-- 106_community_nav_menu_label
-- Align CMS menu_label for /community with the page title used in nav (desktop More + mobile).

BEGIN;

UPDATE public_site_pages
SET
  menu_label = 'مجتمع أوردرز هاوس',
  updated_at = NOW()
WHERE slug = 'community';

INSERT INTO schema_migrations (version)
VALUES ('106_community_nav_menu_label')
ON CONFLICT (version) DO NOTHING;

COMMIT;
