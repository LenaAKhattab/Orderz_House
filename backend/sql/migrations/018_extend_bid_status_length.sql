-- 018_extend_bid_status_length
-- Fix: selected_pending_payment exceeds VARCHAR(20) in order_freelancer_bids.status

BEGIN;

ALTER TABLE order_freelancer_bids
  ALTER COLUMN status TYPE VARCHAR(40);

INSERT INTO schema_migrations (version)
VALUES ('018_extend_bid_status_length')
ON CONFLICT (version) DO NOTHING;

COMMIT;

