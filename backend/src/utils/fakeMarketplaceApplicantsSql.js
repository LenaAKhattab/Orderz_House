/**
 * Marketplace pool only — real fake_order_applications count.
 * Synthetic growth is applied in JS (fakeSyntheticApplicants) after hydrate/map for DISPLAY ONLY.
 * Requires SQL aliases: appc (application count subquery).
 * Do NOT use baseline_applicants_count for marketplace display.
 * Do NOT use synthetic counts for admin review, assignment, payments, or round logic.
 */
const FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT =
  "COALESCE(appc.applicants_count, 0)::int AS applicants_count";

module.exports = {
  FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT,
};
