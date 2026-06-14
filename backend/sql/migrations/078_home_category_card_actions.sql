-- 078_home_category_card_actions
-- Homepage category cards: external links (WhatsApp), visibility toggle, service vs home-only.

BEGIN;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS card_action VARCHAR(32) NOT NULL DEFAULT 'services';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS external_url TEXT NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS button_label VARCHAR(120) NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_service_category BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO categories (
  slug,
  name,
  description,
  image_url,
  sort_order,
  is_active,
  show_on_homepage,
  card_action,
  external_url,
  button_label,
  is_service_category
)
VALUES (
  'special-requests',
  'طلبات خاصة',
  'لاستلام طلبك بشكل مباشر لدى فريق الدعم للموقع',
  '/api/categories/images/special-requests',
  40,
  TRUE,
  TRUE,
  'external',
  'https://wa.me/971543266550?text=لاستلام%20طلبك%20بشكل%20مباشر%20لدى%20فريق%20الدعم%20للموقع',
  'تواصل عبر واتساب',
  FALSE
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  show_on_homepage = EXCLUDED.show_on_homepage,
  card_action = EXCLUDED.card_action,
  external_url = EXCLUDED.external_url,
  button_label = EXCLUDED.button_label,
  is_service_category = EXCLUDED.is_service_category,
  updated_at = NOW();

INSERT INTO schema_migrations (version)
VALUES ('078_home_category_card_actions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
