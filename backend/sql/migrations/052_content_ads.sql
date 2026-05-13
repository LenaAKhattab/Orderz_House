-- 052_content_ads
-- Promotional ads / homepage sidebar panels (admin-managed).

BEGIN;

CREATE TABLE IF NOT EXISTS content_ads (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  subtitle TEXT NULL,
  description TEXT NULL,
  badge_text VARCHAR(200) NULL,
  badge_color VARCHAR(64) NULL,
  texts JSONB NOT NULL DEFAULT '[]'::jsonb,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta_text VARCHAR(200) NULL,
  cta_url TEXT NULL,
  secondary_cta_text VARCHAR(200) NULL,
  secondary_cta_url TEXT NULL,
  open_in_new_tab BOOLEAN NOT NULL DEFAULT FALSE,
  background_color VARCHAR(64) NULL,
  gradient_from VARCHAR(64) NULL,
  gradient_to VARCHAR(64) NULL,
  title_color VARCHAR(64) NULL,
  text_color VARCHAR(64) NULL,
  button_color VARCHAR(64) NULL,
  button_text_color VARCHAR(64) NULL,
  border_color VARCHAR(64) NULL,
  layout_type VARCHAR(32) NOT NULL DEFAULT 'image_top',
  text_align VARCHAR(16) NOT NULL DEFAULT 'right',
  image_position VARCHAR(16) NOT NULL DEFAULT 'top',
  button_position VARCHAR(16) NOT NULL DEFAULT 'bottom',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_sticky BOOLEAN NOT NULL DEFAULT TRUE,
  is_clickable_card BOOLEAN NOT NULL DEFAULT FALSE,
  placement VARCHAR(32) NOT NULL DEFAULT 'home_right_panel',
  sort_order INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NULL,
  end_date TIMESTAMPTZ NULL,
  impression_count BIGINT NOT NULL DEFAULT 0,
  click_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_ads_placement_active_sort
  ON content_ads (placement, is_active, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_ads_schedule
  ON content_ads (placement, start_date, end_date);

COMMIT;
