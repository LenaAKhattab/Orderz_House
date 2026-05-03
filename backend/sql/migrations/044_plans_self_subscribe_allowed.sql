-- 044: Explicit flag for freelancer self-service Stripe checkout vs company-assigned-only plans
-- Apply: npm run db:migrate

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS self_subscribe_allowed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN plans.self_subscribe_allowed IS
  'When TRUE, freelancers may purchase this plan via self-service checkout; company-only templates stay FALSE.';

-- Preserve prior self-checkout eligibility for plans that already matched marketplace rules.
UPDATE plans
SET self_subscribe_allowed = TRUE
WHERE deleted_at IS NULL
  AND is_active = TRUE
  AND is_visible = TRUE
  AND price_jod IS NOT NULL
  AND price_jod > 0;

COMMIT;
