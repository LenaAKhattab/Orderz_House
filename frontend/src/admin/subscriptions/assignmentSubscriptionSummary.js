/**
 * Maps admin subscription + eligibility API payloads to course progress card `subscription` shape.
 */
export function buildAssignmentSubscriptionSummary(sub, eligibility) {
  if (!sub) return null;
  return {
    subscriptionId: sub.id != null ? String(sub.id) : null,
    planId: sub.planId != null ? String(sub.planId) : null,
    planName: sub.plan?.title || sub.plan?.name || null,
    activationStatus: sub.activationStatus || null,
    paymentStatus: sub.paymentStatus || null,
    subscriptionStatus: sub.status || null,
    expiryDate: sub.expiryDate || null,
    canTakeOrders: Boolean(eligibility?.eligible),
    eligibilityReason: eligibility?.reason || null,
  };
}

export async function fetchAssignmentSubscriptionSummary(
  freelancerUserId,
  { getFreelancerCurrentSubscriptionAdminRequest, getFreelancerEligibilityAdminRequest },
) {
  const [subRes, elRes] = await Promise.all([
    getFreelancerCurrentSubscriptionAdminRequest(freelancerUserId),
    getFreelancerEligibilityAdminRequest(freelancerUserId),
  ]);
  return buildAssignmentSubscriptionSummary(subRes?.data?.subscription, elRes?.data);
}
