import { orderHasAssignment } from "./orderPrivacyUi";

const OPEN_POOL_STATUSES = ["published", "open_for_freelancers", "open_for_bids"];
const POOL_SOURCE_TYPES = ["admin_created", "super_admin_created", "client_created"];

/** Fixed pool orders that record participation via application (myBid) instead of claim. */
export function isPoolFixedApplicationOrder(order) {
  return order?.projectType === "fixed" && order?.myBid != null && order?.myClaim == null;
}

/** Whether the freelancer already registered interest on a fixed pool order. */
export function poolFixedParticipationPending(order) {
  if (!order || order.projectType !== "fixed") return false;
  if (order.myClaim && ["pending", "accepted"].includes(String(order.myClaim.status))) return true;
  if (isPoolFixedApplicationOrder(order) && ["pending", "accepted"].includes(String(order.myBid?.status))) {
    return true;
  }
  return false;
}

export function isPoolOrderAvailable(order) {
  if (!order) return false;
  const sourceOk = POOL_SOURCE_TYPES.includes(order?.sourceType);
  if (!sourceOk || !order.isPublished || !order.isOpenForPool || orderHasAssignment(order)) return false;
  const st = String(order.orderStatus || "");
  if (order.projectType === "fixed") {
    return OPEN_POOL_STATUSES.includes(st);
  }
  if (order.projectType === "bidding") {
    return st === "open_for_bids" || (order.bidBudgetMin != null && order.bidBudgetMax != null && OPEN_POOL_STATUSES.includes(st));
  }
  return OPEN_POOL_STATUSES.includes(st);
}
