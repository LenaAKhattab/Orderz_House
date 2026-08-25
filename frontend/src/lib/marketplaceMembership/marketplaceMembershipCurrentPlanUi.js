/** Pure helpers: current marketplace plan card lock + STARTER pending UI. */

export function normalizeMembershipTierCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

/**
 * Whether a marketplace plan card should be locked as "باقتك الحالية".
 */
export function isCurrentMarketplacePlanCard(plan, membershipSnapshot) {
  if (!plan || !membershipSnapshot?.hasMembership) return false;
  const membership = membershipSnapshot.membership || {};
  const planTier = normalizeMembershipTierCode(
    plan.tierCode || plan.tier_code || plan.title || plan.code,
  );
  const currentTier = normalizeMembershipTierCode(
    membership.plan?.tierCode || membership.plan?.tier_code,
  );
  if (!planTier || !currentTier || planTier !== currentTier) return false;
  const status = String(membership.status || "");
  return [
    "starter_pending_start",
    "purchased_pending_start",
    "active",
    "cancel_at_period_end",
    "suspended",
  ].includes(status);
}

export function isStarterPendingStartMembership(membershipSnapshot) {
  return (
    String(membershipSnapshot?.membership?.status || "") === "starter_pending_start" ||
    membershipSnapshot?.membership?.starterPendingStart === true
  );
}
