-- 105_community_page_title_orderz_house
-- Update only the in-page heading for /community; keep menu_label for nav/footer.

BEGIN;

UPDATE public_site_pages
SET
  title = 'مجتمع أوردرز هاوس',
  updated_at = NOW()
WHERE slug = 'community';

INSERT INTO schema_migrations (version)
VALUES ('105_community_page_title_orderz_house')
ON CONFLICT (version) DO NOTHING;

COMMIT;
