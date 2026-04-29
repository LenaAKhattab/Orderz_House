-- 029_fake_bids_metadata
-- Track fake/training bid metadata and optional proposal text.

BEGIN;

ALTER TABLE order_freelancer_bids
  ADD COLUMN IF NOT EXISTS is_fake_bid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fake_round_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS proposal_message TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_order_bids_fake_round ON order_freelancer_bids(fake_round_id);
CREATE INDEX IF NOT EXISTS idx_order_bids_is_fake ON order_freelancer_bids(is_fake_bid);

INSERT INTO schema_migrations (version)
VALUES ('029_fake_bids_metadata')
ON CONFLICT (version) DO NOTHING;

COMMIT;
