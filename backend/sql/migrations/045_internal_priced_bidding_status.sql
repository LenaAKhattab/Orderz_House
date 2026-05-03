-- 045: Internal admin "bidding" pool jobs with a valid price range should use open_for_bids
-- (matches claimPoolOrder vs submitPoolOrderBid rules). Apply: npm run db:migrate

BEGIN;

UPDATE orders
SET order_status = 'open_for_bids', updated_at = NOW()
WHERE project_type = 'bidding'
  AND bid_budget_min IS NOT NULL
  AND bid_budget_max IS NOT NULL
  AND bid_budget_min > 0
  AND bid_budget_max >= bid_budget_min
  AND order_status = 'published'
  AND source_type IN ('admin_created', 'super_admin_created')
  AND assigned_freelancer_id IS NULL
  AND is_open_for_pool = TRUE
  AND is_archived = FALSE;

COMMIT;
