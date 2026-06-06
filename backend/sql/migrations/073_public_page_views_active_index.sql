-- 073_public_page_views_active_index
-- Speed up distinct active-visitor counts for the last 7 days.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_public_page_views_active_users_lookup
  ON public_page_views (created_at DESC, user_id, client_session_id);

INSERT INTO schema_migrations (version)
VALUES ('073_public_page_views_active_index')
ON CONFLICT (version) DO NOTHING;

COMMIT;
