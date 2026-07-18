-- Migration 117: Indexes for institutional storage list filters/sorts.
-- Does not alter existing data or migrations 112–116.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_inst_storages_start_date
  ON institutional_order_storages (distribution_start_date);

CREATE INDEX IF NOT EXISTS idx_inst_stored_orders_storage_price_status
  ON institutional_stored_orders (storage_id, lifecycle_status)
  WHERE deleted_at IS NULL;

COMMIT;
