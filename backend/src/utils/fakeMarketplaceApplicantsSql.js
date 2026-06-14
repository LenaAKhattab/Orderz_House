/**
 * Marketplace pool only — baseline + real fake_order_applications.
 * Requires SQL aliases: fo (fake_orders), appc (application count subquery).
 * Do NOT use in Super Admin application review (real counts only).
 */
const FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT =
  "(COALESCE(fo.baseline_applicants_count, 0) + COALESCE(appc.applicants_count, 0))::int AS applicants_count";

module.exports = {
  FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT,
};
