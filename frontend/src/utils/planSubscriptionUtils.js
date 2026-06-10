import { isOrderzhouseFreePlan } from "../constants/orderzhousePlansCatalog";

export function planTierRank(planOrId) {
  if (planOrId == null) return 0;
  if (typeof planOrId === "object") {
    const sortOrder = Number(planOrId.sortOrder);
    if (Number.isFinite(sortOrder) && sortOrder > 0) return sortOrder;
    const id = Number(planOrId.id ?? planOrId.planId);
    if (Number.isInteger(id) && id > 0) return id;
    return 0;
  }
  const n = Number(planOrId);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function isUpgradePlan(currentSubscription, targetPlan) {
  if (!targetPlan) return false;
  const currentRank = currentSubscription ? planTierRank(currentSubscription.plan ?? currentSubscription.planId) : 0;
  const targetRank = planTierRank(targetPlan);
  return targetRank > currentRank;
}

export function isBlockingSubscription(subscription) {
  if (!subscription) return false;
  if (isOrderzhouseFreePlan(subscription.plan || { id: subscription.planId, name: subscription.plan?.name })) {
    return false;
  }
  const status = subscription?.status;
  if (status === "inactive" || status === "cancelled" || status === "expired") return false;

  const expiry = subscription?.expiryDate ? new Date(subscription.expiryDate) : null;
  if (expiry && Number.isFinite(expiry.getTime())) {
    return expiry.getTime() > Date.now();
  }
  return status === "active" || status === "assigned_not_started";
}

export function getNextUpgradePlan(plans, currentSubscription) {
  if (!Array.isArray(plans) || plans.length === 0) return null;
  const currentRank = currentSubscription ? planTierRank(currentSubscription.plan ?? currentSubscription.planId) : 0;
  const sorted = [...plans].sort((a, b) => planTierRank(a) - planTierRank(b));
  return sorted.find((plan) => planTierRank(plan) > currentRank && !isOrderzhouseFreePlan(plan)) || null;
}
