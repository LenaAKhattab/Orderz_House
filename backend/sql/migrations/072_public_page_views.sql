-- 072_public_page_views
-- Local pageview event log + fast total counter for public homepage hero stat.

BEGIN;

CREATE TABLE IF NOT EXISTS public_page_views (
  id BIGSERIAL PRIMARY KEY,
  path VARCHAR(2048) NOT NULL,
  title VARCHAR(512),
  referrer VARCHAR(2048),
  idempotency_key VARCHAR(128) NOT NULL,
  client_session_id VARCHAR(128),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_page_views_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_public_page_views_created_at ON public_page_views (created_at DESC);

CREATE TABLE IF NOT EXISTS public_page_view_totals (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public_page_view_totals (id, total_count)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('072_public_page_views')
ON CONFLICT (version) DO NOTHING;

COMMIT;
