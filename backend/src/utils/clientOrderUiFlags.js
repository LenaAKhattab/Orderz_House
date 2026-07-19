/**
 * Client-facing UI flags derived from existing order fields (no schema change).
 * Safe to attach on client-owned order API payloads only.
 */

const ACTIVE_WORK_STATUSES = new Set([
  "in_progress",
  "submitted",
  "revision_requested",
  "pending_client_review",
  "completed",
  "cancelled",
  "assigned",
  "ready_for_work",
]);

/**
 * @param {object} order mapped order (camelCase)
 * @returns {object} order with requiresPayment, canPayNow, requiresAdminReview, clientDisplayStatus*
 */
function attachClientOrderUiFlags(order) {
  if (!order || typeof order !== "object") return order;

  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const projectType = String(order.projectType || "").toLowerCase();
  const isPublished = order.isPublished === true;
  const isOpenForPool = order.isOpenForPool === true;
  const isPaid = paymentStatus === "paid" || paymentStatus === "skipped_by_admin";

  const requiresPayment =
    (projectType === "fixed" || orderStatus === "awaiting_payment_after_bid_selection") &&
    !isPaid &&
    (orderStatus === "pending_payment" ||
      orderStatus === "awaiting_payment_after_bid_selection" ||
      paymentStatus === "pending" ||
      paymentStatus === "unpaid");

  const canPayNow = Boolean(requiresPayment);

  // Paid but not yet pool-visible — awaiting publish/admin gate (if product enables it).
  const requiresAdminReview =
    Boolean(isPaid) &&
    projectType === "fixed" &&
    (!isPublished || !isOpenForPool) &&
    !ACTIVE_WORK_STATUSES.has(orderStatus) &&
    orderStatus !== "open_for_freelancers" &&
    orderStatus !== "open_for_bids" &&
    orderStatus !== "published";

  let clientDisplayStatus = orderStatus || null;
  let clientDisplayStatusLabelAr = null;

  if (requiresPayment) {
    clientDisplayStatus = "pending_payment";
    clientDisplayStatusLabelAr = "بانتظار الدفع";
  } else if (requiresAdminReview) {
    clientDisplayStatus = "pending_admin_review";
    clientDisplayStatusLabelAr = "بانتظار مراجعة الإدارة";
  }

  return {
    ...order,
    requiresPayment,
    canPayNow,
    requiresAdminReview,
    clientDisplayStatus,
    clientDisplayStatusLabelAr,
  };
}

module.exports = { attachClientOrderUiFlags };
