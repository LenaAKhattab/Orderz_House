/**
 * Annual Plans (catalog_category = 'annual') contractually include a total + daily application
 * allowance. Those limits are enforced through the canonical Bid Credits engine for these
 * memberships even while the global bid_credits_enabled switch is OFF. Every other plan keeps
 * following the global switch exactly as before.
 */

const ANNUAL_ENFORCED_MEMBERSHIP_STATUSES = Object.freeze([
  "purchased_pending_start",
  "active",
  "cancel_at_period_end",
]);

function isMissingSchema(err) {
  return Boolean(err && (err.code === "42P01" || err.code === "42703"));
}

/** True when the freelancer's current membership is an Annual Plans membership. */
async function freelancerHasAnnualBidEnforcement(client, freelancerUserId) {
  const runner = client || require("../config/db").pool;
  const id = Number(freelancerUserId);
  if (!Number.isInteger(id) || id < 1) return false;
  try {
    const { rows } = await runner.query(
      `SELECT 1
         FROM freelancer_marketplace_memberships m
         JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
        WHERE m.freelancer_user_id = $1
          AND m.is_current = TRUE
          AND m.status = ANY($2::text[])
          AND p.catalog_category = 'annual'
        LIMIT 1`,
      [id, [...ANNUAL_ENFORCED_MEMBERSHIP_STATUSES]],
    );
    return Boolean(rows[0]);
  } catch (err) {
    if (isMissingSchema(err)) return false;
    throw err;
  }
}

/** True when a marketplace plan belongs to the Annual Plans category. */
async function planHasAnnualBidEnforcement(client, marketplacePlanId) {
  const runner = client || require("../config/db").pool;
  const id = Number(marketplacePlanId);
  if (!Number.isInteger(id) || id < 1) return false;
  try {
    const { rows } = await runner.query(
      `SELECT 1 FROM marketplace_membership_plans WHERE id = $1 AND catalog_category = 'annual' LIMIT 1`,
      [id],
    );
    return Boolean(rows[0]);
  } catch (err) {
    if (isMissingSchema(err)) return false;
    throw err;
  }
}

module.exports = {
  ANNUAL_ENFORCED_MEMBERSHIP_STATUSES,
  freelancerHasAnnualBidEnforcement,
  planHasAnnualBidEnforcement,
};
