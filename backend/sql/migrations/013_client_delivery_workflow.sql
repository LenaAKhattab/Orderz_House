-- 013_client_delivery_workflow
-- Client approves freelancer claims; delivery files (purpose); pending_client_review; revision note.

BEGIN;

ALTER TABLE order_files
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'brief';

ALTER TABLE order_files DROP CONSTRAINT IF EXISTS order_files_purpose_chk;
ALTER TABLE order_files
  ADD CONSTRAINT order_files_purpose_chk CHECK (purpose IN ('brief', 'delivery'));

UPDATE order_files SET purpose = 'brief' WHERE purpose IS NULL OR purpose = '';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_revision_note TEXT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_status_check CHECK (
    order_status IN (
      'draft',
      'published',
      'assigned',
      'in_progress',
      'pending_client_review',
      'completed',
      'cancelled'
    )
  );

INSERT INTO schema_migrations (version)
VALUES ('013_client_delivery_workflow')
ON CONFLICT (version) DO NOTHING;

COMMIT;
