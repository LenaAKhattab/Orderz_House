import { getTranslation } from "../lib/translation/getTranslation";
import { DEFAULT_LOCALE } from "../i18n/resources";
import { orderHasAssignment } from "./orderPrivacyUi";

/** Matches backend pool listing / freelancer visibility. */
const POOL_LIKE_ORDER_STATUSES = new Set(["published", "open_for_freelancers", "open_for_bids"]);

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

function resolveTranslator(t) {
  return typeof t === "function" ? t : (key) => getTranslation(key, DEFAULT_LOCALE);
}

/**
 * @param {string | null | undefined} status
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getOrderStatusLabel(status, t) {
  const tr = resolveTranslator(t);
  const s = status != null ? String(status).trim() : "";
  if (!s) return tr("orders.status.unknown");
  const key = `orders.status.${s}`;
  const label = tr(key);
  if (label === key) return s;
  return label;
}

export function getOrderStatusBadgeClass(status) {
  const s = status != null ? String(status).trim() : "";
  return ORDER_STATUS_BADGE_CLASS[s] || "oh-badge oh-badge--neutral";
}

/**
 * Badge for order cards (header): label + CSS class.
 * @param {object} order
 * @param {(key: string, values?: Record<string, string | number>) => string} [t]
 */
export function orderStatusDisplayBadge(order, t) {
  const tr = resolveTranslator(t);

  if (order?.isArchived) {
    return { label: tr("orders.status.archived"), className: "oh-badge oh-badge--neutral" };
  }

  const hasRevision = Boolean(order?.clientRevisionNote);
  const requestedByAdmin =
    order?.revisionRequestedBy === "admin" ||
    order?.sourceType === "admin_created" ||
    order?.sourceType === "super_admin_created";

  if (hasRevision) {
    if (order?.orderStatus === "pending_client_review") {
      return { label: tr("orders.status.revisionDelivered"), className: "oh-badge oh-badge--info" };
    }
    if (order?.orderStatus === "in_progress" || order?.orderStatus === "ready_for_work") {
      return {
        label: requestedByAdmin
          ? tr("orders.status.revisionRequestedAdmin")
          : tr("orders.status.revisionRequestedClient"),
        className: "oh-badge oh-badge--warning",
      };
    }
    return { label: tr("orders.status.revisionRequired"), className: "oh-badge oh-badge--warning" };
  }

  const s = order?.orderStatus != null ? String(order.orderStatus).trim() : "";
  if (!s) return { label: "—", className: "oh-badge oh-badge--neutral" };

  return {
    label: getOrderStatusLabel(s, tr),
    className: getOrderStatusBadgeClass(s),
  };
}

/**
 * Pool/marketplace card badge — `published` shown as «available» in the public gallery.
 * @param {object} order
 * @param {(key: string, values?: Record<string, string | number>) => string} [t]
 */
export function poolMarketplaceStatusBadge(order, t) {
  const tr = resolveTranslator(t);
  if (order?.isArchived) {
    return { label: tr("orders.status.archived"), className: "oh-badge oh-badge--neutral" };
  }
  const s = order?.orderStatus != null ? String(order.orderStatus).trim() : "";
  if (!s) return { label: "—", className: "oh-badge oh-badge--neutral" };
  const label = s === "published" ? tr("orders.status.available") : getOrderStatusLabel(s, tr);
  return { label, className: getOrderStatusBadgeClass(s) };
}

/** @deprecated Use getOrderStatusLabel(status, t) — Arabic-only fallback for legacy callers. */
export function orderStatusLabelAr(status) {
  return getOrderStatusLabel(status, (key) => getTranslation(key, DEFAULT_LOCALE));
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
    !orderHasAssignment(order) &&
    POOL_LIKE_ORDER_STATUSES.has(order?.orderStatus) &&
    ["admin_created", "super_admin_created", "client_created"].includes(order?.sourceType) &&
    clientFixedPaidForPool(order)
  );
}

export function isFixedPoolClaimReviewPhase(order) {
  return order?.projectType === "fixed" && isOrderListedForFreelancerPool(order);
}
