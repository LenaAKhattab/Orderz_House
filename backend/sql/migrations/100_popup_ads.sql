-- 100_popup_ads
-- Site-wide popup promotional ads (admin-managed).

BEGIN;

CREATE TABLE IF NOT EXISTS popup_ads (
  id BIGSERIAL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  title_ar VARCHAR(200) NOT NULL DEFAULT '',
  title_en VARCHAR(200) NULL,
  body_ar TEXT NULL,
  body_en TEXT NULL,
  image_url TEXT NULL,
  cta_text VARCHAR(120) NULL,
  cta_url TEXT NULL,
  open_in_new_tab BOOLEAN NOT NULL DEFAULT FALSE,
  audience VARCHAR(24) NOT NULL DEFAULT 'all',
  page_scope VARCHAR(24) NOT NULL DEFAULT 'all',
  frequency VARCHAR(24) NOT NULL DEFAULT 'session',
  sort_order INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NULL,
  end_date TIMESTAMPTZ NULL,
  impression_count BIGINT NOT NULL DEFAULT 0,
  click_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT popup_ads_audience_chk CHECK (
    audience IN ('all', 'guests', 'freelancer', 'client', 'staff')
  ),
  CONSTRAINT popup_ads_page_scope_chk CHECK (
    page_scope IN ('all', 'home', 'public', 'dashboard')
  ),
  CONSTRAINT popup_ads_frequency_chk CHECK (
    frequency IN ('every_visit', 'session', 'day')
  )
);

CREATE INDEX IF NOT EXISTS idx_popup_ads_active_sort
  ON popup_ads (enabled, sort_order ASC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_popup_ads_schedule
  ON popup_ads (enabled, start_date, end_date);

INSERT INTO schema_migrations (version)
VALUES ('100_popup_ads')
ON CONFLICT (version) DO NOTHING;

COMMIT;
