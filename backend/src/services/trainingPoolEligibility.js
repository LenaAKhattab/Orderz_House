/**
 * Shared eligibility predicates for public training/fake pool orders.
 * Keep homepage stats, pool list, rotation coverage checks aligned.
 */

/**
 * @param {string} [alias]
 */
function trainingPoolItemCoreSql(alias = "fo") {
  const a = String(alias || "fo").trim() || "fo";
  return `
  ${a}.fake_status = 'active'
  AND ${a}.is_published = TRUE
  AND ${a}.is_open_for_pool = TRUE
  AND ${a}.assigned_freelancer_id IS NULL
  AND ${a}.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
  AND ri.status = 'active'
  AND fr.status = 'active'
  AND ri.visible_from <= NOW()
  -- Exclusive end boundary: item is visible while visible_until > NOW() (not >=).
  AND ri.visible_until > NOW()
  AND (SELECT training_orders_enabled FROM fake_order_settings WHERE id = 1) = TRUE
`.trim();
}

/** @deprecated Use trainingPoolItemCoreSql() — default alias `fo`. */
const TRAINING_POOL_ITEM_CORE_SQL = trainingPoolItemCoreSql("fo");

/**
 * Public homepage / anonymous pool visibility (matches trainingPoolList guest branch).
 */
const TRAINING_POOL_PUBLIC_AUDIENCE_SQL = `
  (
    (SELECT show_to_all_visitors FROM fake_order_settings WHERE id = 1) = TRUE
    OR (SELECT show_to_all_freelancers FROM fake_order_settings WHERE id = 1) = TRUE
  )
`;

/**
 * Automation / coverage: visible to at least one eligible viewer (public flags or subscribed plan).
 * Aligns replenish/rotation with real marketplace reach — not core-only counts.
 */
const TRAINING_POOL_ANY_AUDIENCE_SQL = `
  (
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
`;

/** FROM/JOIN fragment for counting or listing currently visible training pool orders. */
function trainingPoolVisibleFromSql(alias = "fo") {
  const a = String(alias || "fo").trim() || "fo";
  return `
  FROM fake_orders ${a}
  INNER JOIN fake_order_round_items ri ON ri.fake_order_id = ${a}.id
  INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
`.trim();
}

/** @deprecated Use trainingPoolVisibleFromSql() — default alias `fo`. */
const TRAINING_POOL_VISIBLE_FROM_SQL = trainingPoolVisibleFromSql("fo");

/**
 * @param {{ publicAudienceOnly?: boolean, anyAudience?: boolean, alias?: string }} [options]
 */
function trainingPoolVisibleWhereSql(options = {}) {
  const alias = options.alias || "fo";
  const parts = [trainingPoolItemCoreSql(alias)];
  if (options.publicAudienceOnly) {
    parts.push(TRAINING_POOL_PUBLIC_AUDIENCE_SQL.trim());
  } else if (options.anyAudience) {
    parts.push(TRAINING_POOL_ANY_AUDIENCE_SQL.trim());
  }
  return parts.join("\n  AND ");
}

module.exports = {
  trainingPoolItemCoreSql,
  trainingPoolVisibleFromSql,
  TRAINING_POOL_ITEM_CORE_SQL,
  TRAINING_POOL_PUBLIC_AUDIENCE_SQL,
  TRAINING_POOL_ANY_AUDIENCE_SQL,
  TRAINING_POOL_VISIBLE_FROM_SQL,
  trainingPoolVisibleWhereSql,
};
