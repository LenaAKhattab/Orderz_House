-- 012: Client orders in freelancer pool + optional priced bidding range + freelancer bids
-- - Extends currency/budget check: bidding may be legacy (no currency/range) OR priced (currency + min/max).
-- - Fixed orders must not carry bid range columns.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bid_budget_min NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS bid_budget_max NUMERIC(12,2) NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_by_project_type_chk;

ALTER TABLE orders
  ADD CONSTRAINT orders_currency_by_project_type_chk
  CHECK (
    (
      project_type = 'fixed'
      AND currency_code IS NOT NULL
      AND char_length(currency_code) = 3
      AND budget IS NOT NULL
      AND budget > 0
      AND bid_budget_min IS NULL
      AND bid_budget_max IS NULL
    )
    OR
    (
      project_type = 'bidding'
      AND budget IS NULL
      AND (
        (
          currency_code IS NULL
          AND bid_budget_min IS NULL
          AND bid_budget_max IS NULL
        )
        OR
        (
          currency_code IS NOT NULL
          AND char_length(currency_code) = 3
          AND bid_budget_min IS NOT NULL
          AND bid_budget_max IS NOT NULL
          AND bid_budget_min > 0
          AND bid_budget_max >= bid_budget_min
        )
      )
    )
  );

CREATE TABLE IF NOT EXISTS order_freelancer_bids (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'withdrawn', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, freelancer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_order_freelancer_bids_order_id ON order_freelancer_bids(order_id);
CREATE INDEX IF NOT EXISTS idx_order_freelancer_bids_freelancer_user_id ON order_freelancer_bids(freelancer_user_id);

INSERT INTO schema_migrations (version)
VALUES ('012_client_pool_bids')
ON CONFLICT (version) DO NOTHING;

COMMIT;
