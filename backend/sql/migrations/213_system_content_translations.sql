-- 213_system_content_translations
-- German / Dutch / Romanian translations of SYSTEM-authored DB content (plans, categories, FAQ, CMS / legal
-- pages, page blocks, footer settings, popup copy …). Arabic / English keep their existing columns.
--
-- Translation memory keyed by the hash of the SOURCE text (systemContentHash: cyrb53 of the normalized English
-- source, else Arabic; see backend/src/utils/systemContentHash.js). One table instead of *_de / *_nl / *_ro
-- columns on every content table; API responses are unchanged — the SPA loads one locale map
-- (GET /api/i18n/system-content/:locale) and resolves fields locally.
-- User-generated content (orders, messages, deliveries, profiles) is never stored here.
--
-- Additive and reversible: rollback = DROP TABLE IF EXISTS system_content_translations;
--   DELETE FROM schema_migrations WHERE version = '213_system_content_translations';

BEGIN;

CREATE TABLE IF NOT EXISTS system_content_translations (
  id BIGSERIAL PRIMARY KEY,
  locale VARCHAR(5) NOT NULL,
  source_hash VARCHAR(16) NOT NULL,
  value TEXT NOT NULL,
  source_excerpt VARCHAR(120) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_content_translations_locale_chk CHECK (locale IN ('de', 'nl', 'ro')),
  CONSTRAINT system_content_translations_hash_chk CHECK (source_hash ~ '^[0-9a-f]{14}$'),
  CONSTRAINT system_content_translations_value_chk CHECK (length(btrim(value)) > 0)
);

-- Serves both the upsert key and the per-locale read (WHERE locale = $1).
CREATE UNIQUE INDEX IF NOT EXISTS system_content_translations_locale_hash_uidx
  ON system_content_translations (locale, source_hash);

INSERT INTO schema_migrations (version)
VALUES ('213_system_content_translations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
