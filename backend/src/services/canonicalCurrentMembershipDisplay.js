/**
 * Display-only mapping from the canonical freelancer_subscriptions row
 * to a marketplace plan card. Does not write rows or start a countdown.
 */

const MARKETPLACE_TIERS = new Set(["STARTER", "SILVER", "PRO", "ELITE"]);
const DISPLAY_CURRENT_STATUSES = new Set(["assigned_not_started", "active"]);

function tierFromSubscriptionPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  const name = String(plan.name || "")
    .trim()
    .toLowerCase();
  const bridged = name.match(/^marketplace_membership_(starter|silver|pro|elite)$/);
  if (bridged) return bridged[1].toUpperCase();
  const title = String(plan.title || plan.titleEn || "")
    .trim()
    .toUpperCase();
  if (MARKETPLACE_TIERS.has(title)) return title;
  return null;
}

/**
 * @param {object|null|undefined} subscription mapped freelancer subscription
 * @returns {null | {
 *   tierCode: string,
 *   membershipStatus: string,
 *   companyApproval: string,
 *   countdownStarted: boolean,
 *   waitingForFirstOrder: boolean,
 *   actualStartDate: string|Date|null,
 *   expiryDate: string|Date|null,
 * }}
 */
function resolveCanonicalMarketplaceDisplay(subscription) {
  if (!subscription || subscription.isCurrent === false) return null;
  const status = String(subscription.status || "");
  if (!DISPLAY_CURRENT_STATUSES.has(status)) return null;
  if (String(subscription.activationStatus || "") !== "company_approved") return null;
  const tierCode = tierFromSubscriptionPlan(subscription.plan);
  if (!tierCode) return null;
  const countdownStarted = status === "active" && Boolean(subscription.actualStartDate);
  return {
    tierCode,
    membershipStatus: status,
    companyApproval: "company_approved",
    countdownStarted,
    waitingForFirstOrder: status === "assigned_not_started",
    actualStartDate: countdownStarted ? subscription.actualStartDate || null : null,
    expiryDate: countdownStarted ? subscription.expiryDate || null : null,
  };
}

function alignMembershipSnapshotToCanonical(snapshot, canonical) {
  if (!canonical) return snapshot;
  const base = snapshot && typeof snapshot === "object" ? snapshot : {};
  const membership = base.membership && typeof base.membership === "object" ? base.membership : {};
  const plan = membership.plan && typeof membership.plan === "object" ? membership.plan : {};
  const waiting = canonical.waitingForFirstOrder === true;
  return {
    ...base,
    hasMembership: true,
    currentPlanCode: canonical.tierCode,
    membershipStatus: canonical.membershipStatus,
    companyApproval: canonical.companyApproval,
    countdownStarted: canonical.countdownStarted,
    currentCycle: waiting ? null : base.currentCycle || null,
    membership: {
      ...membership,
      status: canonical.membershipStatus,
      isCurrent: true,
      source: membership.source || "freelancer_subscription",
      starterPendingStart: false,
      canStartStarterTrial: false,
      termStarted: canonical.countdownStarted,
      paidTermStartsAt: waiting ? null : canonical.actualStartDate,
      paidTermEndsAt: waiting ? null : canonical.expiryDate,
      remainingDays: waiting ? null : membership.remainingDays ?? null,
      statusMessageAr: null,
      plan: {
        ...plan,
        tierCode: canonical.tierCode,
        nameEn: canonical.tierCode,
        nameAr: canonical.tierCode,
      },
    },
  };
}

module.exports = {
  MARKETPLACE_TIERS,
  resolveCanonicalMarketplaceDisplay,
  alignMembershipSnapshotToCanonical,
  tierFromSubscriptionPlan,
};
