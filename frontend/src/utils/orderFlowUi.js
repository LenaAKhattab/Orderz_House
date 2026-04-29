/** Matches backend pool listing / freelancer visibility. */
const POOL_LIKE_ORDER_STATUSES = new Set(["published", "open_for_freelancers", "open_for_bids"]);

/** Human-readable Arabic for API `orderStatus` values (backend CHECK). */
const ORDER_STATUS_LABEL_AR = {
  draft: "مسودة",
  published: "منشور",
  assigned: "مُسند",
  in_progress: "قيد التنفيذ",
  pending_client_review: "بانتظار اعتماد العميل",
  completed: "مكتمل",
  cancelled: "ملغي",
  pending_payment: "بانتظار الدفع",
  open_for_freelancers: "متاح للمستقلين",
  open_for_bids: "مفتوح للعروض",
  awaiting_payment_after_bid_selection: "بانتظار الدفع بعد اختيار العرض",
  pending_freelancer_acceptance: "بانتظار قبول مستقل",
  ready_for_work: "جاهز للعمل",
};

const ORDER_STATUS_BADGE_CLASS = {
  draft: "oh-badge oh-badge--neutral",
  published: "oh-badge oh-badge--warning",
  assigned: "oh-badge oh-badge--success",
  in_progress: "oh-badge oh-badge--info",
  pending_client_review: "oh-badge oh-badge--info",
  completed: "oh-badge oh-badge--success",
  cancelled: "oh-badge oh-badge--danger",
  pending_payment: "oh-badge oh-badge--warning",
  open_for_freelancers: "oh-badge oh-badge--warning",
  open_for_bids: "oh-badge oh-badge--warning",
  awaiting_payment_after_bid_selection: "oh-badge oh-badge--warning",
  pending_freelancer_acceptance: "oh-badge oh-badge--info",
  ready_for_work: "oh-badge oh-badge--success",
};

export function orderStatusLabelAr(status) {
  const s = status != null ? String(status).trim() : "";
  if (!s) return "—";
  return ORDER_STATUS_LABEL_AR[s] || s;
}

/** Badge for order cards (header): label + CSS class. */
export function orderStatusDisplayBadge(order) {
  if (order?.isArchived) {
    return { label: "مؤرشف", className: "oh-badge oh-badge--neutral" };
  }
  const hasRevision = Boolean(order?.clientRevisionNote);
  const requestedByAdmin =
    order?.revisionRequestedBy === "admin" || order?.sourceType === "admin_created" || order?.sourceType === "super_admin_created";
  if (hasRevision) {
    if (order?.orderStatus === "pending_client_review") {
      return { label: "تم تسليم التعديل", className: "oh-badge oh-badge--info" };
    }
    if (order?.orderStatus === "in_progress" || order?.orderStatus === "ready_for_work") {
      return {
        label: requestedByAdmin ? "طلب تعديل من الإدارة" : "طلب تعديل من العميل",
        className: "oh-badge oh-badge--warning",
      };
    }
    return { label: "تعديل مطلوب", className: "oh-badge oh-badge--warning" };
  }
  const s = order?.orderStatus != null ? String(order.orderStatus).trim() : "";
  if (!s) return { label: "—", className: "oh-badge oh-badge--neutral" };
  const label = ORDER_STATUS_LABEL_AR[s] || s;
  const className = ORDER_STATUS_BADGE_CLASS[s] || "oh-badge oh-badge--neutral";
  return { label, className };
}

export function isClientFixedAwaitingPayment(order) {
  return (
    order?.sourceType === "client_created" &&
    order?.projectType === "fixed" &&
    order?.orderStatus === "pending_payment"
  );
}

export function clientFixedPaidForPool(order) {
  if (order?.sourceType !== "client_created" || order?.projectType !== "fixed") return true;
  return order?.paymentStatus === "paid" || order?.paymentStatus === "skipped_by_admin";
}

export function isOrderListedForFreelancerPool(order) {
  return (
    order?.isPublished &&
    order?.isOpenForPool &&
    !order?.assignedFreelancerId &&
    POOL_LIKE_ORDER_STATUSES.has(order?.orderStatus) &&
    ["admin_created", "super_admin_created", "client_created"].includes(order?.sourceType) &&
    clientFixedPaidForPool(order)
  );
}

export function isFixedPoolClaimReviewPhase(order) {
  return order?.projectType === "fixed" && isOrderListedForFreelancerPool(order);
}
