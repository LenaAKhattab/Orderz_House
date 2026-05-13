-- 031_platform_ui_settings
-- Public-facing UI toggles (hero analytics strip, etc.).

BEGIN;

CREATE TABLE IF NOT EXISTS platform_ui_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  show_hero_public_stats BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_ui_settings (id, show_hero_public_stats)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('031_platform_ui_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
