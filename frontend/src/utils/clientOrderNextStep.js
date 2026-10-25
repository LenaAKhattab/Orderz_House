import { orderHasAssignment } from "./orderPrivacyUi.js";

/**
 * What the client should know/do next for one of their orders (UI only — derived from existing fields).
 * `attention` = the client is the one blocking progress (payment, offers to review, delivery to review).
 *
 * @param {Record<string, any>} order
 * @returns {{ key: string, tone: "warning"|"info"|"success"|"neutral"|"revision", attention: boolean, params?: Record<string, number> }}
 */
export function getClientOrderNextStep(order) {
  const s = String(order?.orderStatus || "");
  const bids = Number(order?.bidsCount) || 0;
  const files = Array.isArray(order?.files) ? order.files : [];
  const hasDelivery = files.some((f) => f?.purpose === "delivery");

  if (order?.isArchived) return { key: "archived", tone: "neutral", attention: false };
  if (s === "cancelled") return { key: "cancelled", tone: "neutral", attention: false };
  if (s === "completed") return { key: "completed", tone: "success", attention: false };
  if (s === "awaiting_payment_after_bid_selection") return { key: "payAfterBid", tone: "warning", attention: true };
  if (order?.requiresPayment || s === "pending_payment") return { key: "pay", tone: "warning", attention: true };
  if (order?.requiresAdminReview) return { key: "adminReview", tone: "info", attention: false };
  if (s === "pending_client_review") return { key: "reviewDelivery", tone: "success", attention: true };
  if (orderHasAssignment(order)) {
    if (order?.clientRevisionNote && hasDelivery) return { key: "revisionSent", tone: "revision", attention: false };
    return { key: "inProgress", tone: "info", attention: false };
  }
  if (s === "open_for_bids") {
    return bids > 0
      ? { key: "reviewBids", tone: "warning", attention: true, params: { count: bids } }
      : { key: "waitingBids", tone: "neutral", attention: false };
  }
  if (s === "published" || s === "open_for_freelancers") return { key: "published", tone: "neutral", attention: false };
  return { key: "generic", tone: "neutral", attention: false };
}

/** Client "My orders" filter buckets. */
export const CLIENT_ORDER_FILTERS = ["all", "attention", "active", "open", "done"];

/** @param {Record<string, any>} order @param {string} filter */
export function clientOrderMatchesFilter(order, filter) {
  if (filter === "all") return true;
  const step = getClientOrderNextStep(order);
  if (filter === "attention") return step.attention;
  if (filter === "active") return ["inProgress", "revisionSent", "reviewDelivery"].includes(step.key);
  if (filter === "open") return ["published", "waitingBids", "reviewBids", "pay", "payAfterBid", "adminReview"].includes(step.key);
  if (filter === "done") return ["completed", "cancelled", "archived"].includes(step.key);
  return true;
}
