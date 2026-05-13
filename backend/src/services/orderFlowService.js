const POOL_ORDER_SOURCE_TYPES = Object.freeze(["admin_created", "super_admin_created", "client_created"]);

const ORDER_STATUSES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  PENDING_CLIENT_REVIEW: "pending_client_review",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  PENDING_PAYMENT: "pending_payment",
  OPEN_FOR_FREELANCERS: "open_for_freelancers",
  OPEN_FOR_BIDS: "open_for_bids",
  AWAITING_PAYMENT_AFTER_BID_SELECTION: "awaiting_payment_after_bid_selection",
  PENDING_FREELANCER_ACCEPTANCE: "pending_freelancer_acceptance",
  READY_FOR_WORK: "ready_for_work",
});

/** Order rows visible in freelancer pool listing (matches listPoolOrders rules). */
function isPoolListingOrderStatus(orderStatus) {
  return (
    orderStatus === ORDER_STATUSES.PUBLISHED ||
    orderStatus === ORDER_STATUSES.OPEN_FOR_FREELANCERS ||
    orderStatus === ORDER_STATUSES.OPEN_FOR_BIDS
  );
}

function isPoolListedSourceType(sourceType) {
  return POOL_ORDER_SOURCE_TYPES.includes(sourceType);
}

/** Client-created fixed-price orders must be paid (or admin-skipped) before pool work. */
function clientFixedOrderPaidForPool(row) {
  if (!row || row.source_type !== "client_created" || row.project_type !== "fixed") return true;
  return row.payment_status === "paid" || row.payment_status === "skipped_by_admin";
}

/**
 * Snapshot used by pool SQL and API visibility checks.
 * @param {object} row orders table row (snake_case)
 */
function orderRowEligibleForFreelancerPoolListing(row) {
  if (!row) return false;
  if (!row.is_published || !row.is_open_for_pool || row.assigned_freelancer_id) return false;
  if (!isPoolListingOrderStatus(row.order_status)) return false;
  if (!isPoolListedSourceType(row.source_type)) return false;
  if (!clientFixedOrderPaidForPool(row)) return false;
  return true;
}

/**
 * Deprecated in direct-take model: fixed orders no longer use claim review.
 * @param {object} row orders table row (snake_case)
 */
function orderRowAllowsFixedClaimReview(row) {
  return false;
}

/** Deprecated in direct-take model: fixed orders do not support claim approval. */
function orderRowAllowsClaimApproval(row) {
  return false;
}

/** API (camelCase) order object from getOrderById. */
function orderApiEligibleForFreelancerPool(order) {
  if (!order) return false;
  const row = {
    is_published: order.isPublished,
    is_open_for_pool: order.isOpenForPool,
    assigned_freelancer_id: order.assignedFreelancerId ? Number(order.assignedFreelancerId) : null,
    order_status: order.orderStatus,
    source_type: order.sourceType,
    project_type: order.projectType,
    payment_status: order.paymentStatus,
  };
  return orderRowEligibleForFreelancerPoolListing(row);
}

module.exports = {
  ORDER_STATUSES,
  POOL_ORDER_SOURCE_TYPES,
  isPoolListingOrderStatus,
  isPoolListedSourceType,
  clientFixedOrderPaidForPool,
  orderRowEligibleForFreelancerPoolListing,
  orderRowAllowsFixedClaimReview,
  orderRowAllowsClaimApproval,
  orderApiEligibleForFreelancerPool,
};
