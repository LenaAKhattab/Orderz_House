-- 046: Explicit lifecycle for Stripe webhook idempotency (status / processed_at / failed_at / last_error)
-- Apply: npm run db:migrate

BEGIN;

ALTER TABLE stripe_webhook_events
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Legacy rows were successful dedupe records (row kept after handler success).
UPDATE stripe_webhook_events
SET status = 'processed',
    processed_at = COALESCE(processed_at, received_at, NOW())
WHERE status IS NULL;

ALTER TABLE stripe_webhook_events
  ALTER COLUMN status SET DEFAULT 'processing';

ALTER TABLE stripe_webhook_events
  ALTER COLUMN status SET NOT NULL;

COMMENT ON COLUMN stripe_webhook_events.status IS 'processing | processed | failed';
COMMENT ON COLUMN stripe_webhook_events.processed_at IS 'Set when handler completed successfully.';
COMMENT ON COLUMN stripe_webhook_events.failed_at IS 'Set when handler failed; row may be reclaimed for Stripe retry.';
COMMENT ON COLUMN stripe_webhook_events.last_error IS 'Truncated handler error for observability.';

COMMIT;
