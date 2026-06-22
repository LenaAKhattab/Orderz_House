-- 087: Remove seeded freelancers display plans (freelancers_display_*).
-- Keeps canonical plans 1–3, plan_pages architecture, and the freelancers page shell (inactive).

BEGIN;

DELETE FROM plan_features
WHERE plan_id IN (
  SELECT id FROM plans
  WHERE name IN (
    'freelancers_display_free',
    'freelancers_display_50_jod',
    'freelancers_display_platinum'
  )
);

DELETE FROM plans
WHERE name IN (
  'freelancers_display_free',
  'freelancers_display_50_jod',
  'freelancers_display_platinum'
);

UPDATE plan_pages
SET is_active = FALSE, updated_at = NOW()
WHERE LOWER(slug) = 'freelancers'
  AND page_type = 'special';

INSERT INTO schema_migrations (version) VALUES ('087_remove_seeded_freelancers_display_plans')
ON CONFLICT (version) DO NOTHING;

COMMIT;
