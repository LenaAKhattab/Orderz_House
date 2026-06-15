/**
 * Shared eligibility predicates for public training/fake pool orders.
 * Keep homepage stats, pool list, and rotation coverage checks aligned.
 */

/** Core training order row + round-item visibility (no audience gate). */
const TRAINING_POOL_ITEM_CORE_SQL = `
  fo.fake_status = 'active'
  AND fo.is_published = TRUE
  AND fo.is_open_for_pool = TRUE
  AND fo.assigned_freelancer_id IS NULL
  AND fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
  AND ri.status = 'active'
  AND fr.status = 'active'
  AND ri.visible_from <= NOW()
  AND ri.visible_until > NOW()
  AND (SELECT training_orders_enabled FROM fake_order_settings WHERE id = 1) = TRUE
`;

/**
 * Public homepage / anonymous pool visibility (matches trainingPoolList guest branch).
 */
const TRAINING_POOL_PUBLIC_AUDIENCE_SQL = `
  (
    (SELECT show_to_all_visitors FROM fake_order_settings WHERE id = 1) = TRUE
    OR (SELECT show_to_all_freelancers FROM fake_order_settings WHERE id = 1) = TRUE
  )
`;

/** FROM/JOIN fragment for counting or listing currently visible training pool orders. */
const TRAINING_POOL_VISIBLE_FROM_SQL = `
  FROM fake_orders fo
  INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
  INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
`;

/**
 * @param {{ publicAudienceOnly?: boolean }} [options]
 */
function trainingPoolVisibleWhereSql(options = {}) {
  const parts = [TRAINING_POOL_ITEM_CORE_SQL.trim()];
  if (options.publicAudienceOnly) {
    parts.push(TRAINING_POOL_PUBLIC_AUDIENCE_SQL.trim());
  }
  return parts.join("\n  AND ");
}

module.exports = {
  TRAINING_POOL_ITEM_CORE_SQL,
  TRAINING_POOL_PUBLIC_AUDIENCE_SQL,
  TRAINING_POOL_VISIBLE_FROM_SQL,
  trainingPoolVisibleWhereSql,
};
