-- 104_remove_enterprise_public_site_page
-- Remove the "أوردز للمؤسسات" (/enterprise) public CMS page completely.

BEGIN;

DELETE FROM public_site_pages
WHERE slug = 'enterprise';

INSERT INTO schema_migrations (version)
VALUES ('104_remove_enterprise_public_site_page')
ON CONFLICT (version) DO NOTHING;

COMMIT;
