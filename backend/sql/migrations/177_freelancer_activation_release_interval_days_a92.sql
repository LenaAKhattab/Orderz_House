-- 177: Additive release_interval_days for A9.2 plan allocations.
-- 1 = daily, 2 = every other day, N = every N days.
-- Does NOT apply cron. Do NOT apply to production from this phase without ops approval.

BEGIN;

ALTER TABLE freelancer_activation_plan_daily_allocations
  ADD COLUMN IF NOT EXISTS release_interval_days INTEGER NOT NULL DEFAULT 1;

ALTER TABLE freelancer_activation_plan_daily_allocations
  DROP CONSTRAINT IF EXISTS fae_plan_alloc_release_interval_chk;

ALTER TABLE freelancer_activation_plan_daily_allocations
  ADD CONSTRAINT fae_plan_alloc_release_interval_chk
  CHECK (release_interval_days >= 1 AND release_interval_days <= 30);

COMMENT ON COLUMN freelancer_activation_plan_daily_allocations.release_interval_days IS
  'A9.2+: Auto-release cadence in days (1=daily). Manual release bypasses. No cron in this phase.';

COMMIT;
