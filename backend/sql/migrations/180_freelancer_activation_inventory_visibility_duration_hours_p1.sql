-- 180: Article-P1 — per-inventory-item visibility duration (hours).
-- Separate from plan allocation release_interval_days (batch cadence only).
-- Additive only. Default 24 hours. Range 1..168 (7 days).
-- Do NOT apply to production from this phase unless explicitly approved.

BEGIN;

ALTER TABLE freelancer_activation_article_inventory_items
  ADD COLUMN IF NOT EXISTS visibility_duration_hours INTEGER NOT NULL DEFAULT 24;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fae_inv_visibility_duration_hours_chk'
  ) THEN
    ALTER TABLE freelancer_activation_article_inventory_items
      ADD CONSTRAINT fae_inv_visibility_duration_hours_chk
      CHECK (visibility_duration_hours >= 1 AND visibility_duration_hours <= 168);
  END IF;
END $$;

COMMENT ON COLUMN freelancer_activation_article_inventory_items.visibility_duration_hours IS
  'Article-P1: how long a released Mini Article stays visible / collects bids (hours). Not release_interval_days.';

COMMIT;
