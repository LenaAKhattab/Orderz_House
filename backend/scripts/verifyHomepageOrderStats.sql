-- Read-only verification for homepage hero order stats (run in psql / SQL client).
-- A. Real completed orders
SELECT COUNT(*)::int AS real_completed
FROM orders
WHERE order_status = 'completed'
  AND COALESCE(is_archived, FALSE) = FALSE;

-- B. Training rotations completed (proven visibility + ended, any audience)
SELECT COUNT(*)::int AS training_rotations_completed
FROM fake_orders fo
WHERE fo.was_marketplace_visible = TRUE
  AND fo.first_visible_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM fake_orders fo_vis
    INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo_vis.id
    INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
    WHERE fo_vis.id = fo.id
      AND fo_vis.fake_status = 'active'
      AND fo_vis.is_published = TRUE
      AND fo_vis.is_open_for_pool = TRUE
      AND fo_vis.assigned_freelancer_id IS NULL
      AND fo_vis.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
      AND ri.status = 'active'
      AND fr.status = 'active'
      AND ri.visible_from <= NOW()
      AND ri.visible_until > NOW()
      AND (SELECT training_orders_enabled FROM fake_order_settings WHERE id = 1) = TRUE
      AND (
        (SELECT show_to_all_visitors FROM fake_order_settings WHERE id = 1) = TRUE
        OR (SELECT show_to_all_freelancers FROM fake_order_settings WHERE id = 1) = TRUE
        OR EXISTS (
          SELECT 1
          FROM fake_order_settings_plans sp
          INNER JOIN freelancer_subscriptions fs ON fs.plan_id = sp.plan_id
          WHERE fs.is_current = TRUE
            AND fs.status IN ('active', 'assigned_not_started')
        )
      )
  );

-- C. Currently visible fake orders (public homepage audience)
-- Use GET /api/public/home-stats or backend queryHeroOrderCounts() for exact match.

-- D. Expected homepage completed = real_completed + training_rotations_completed

-- E. Expected available now = available_real + available_training (from home-stats API)
