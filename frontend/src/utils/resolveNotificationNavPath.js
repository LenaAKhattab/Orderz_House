/**
 * Resolve an in-app path for a notification click.
 * Prefer the stored `link`, but for order-scoped delivery notifications ensure `orderId`
 * is present so list pages can deep-link to the exact order/review surface.
 */
import { resolveSafeInternalNavPath } from "./safeInternalNavPath.js";

function extractOrderId(notification) {
  const meta = notification?.metadata && typeof notification.metadata === "object" ? notification.metadata : {};
  const fromMeta = String(meta.orderId || "").trim();
  if (/^\d+$/.test(fromMeta)) return fromMeta;
  if (String(notification?.entityType || "").toLowerCase() === "order") {
    const fromEntity = String(notification?.entityId || "").trim();
    if (/^\d+$/.test(fromEntity)) return fromEntity;
  }
  return "";
}

function withOrderFocusQuery(pathnameAndSearch, orderId, { openReview = false } = {}) {
  if (!orderId && !openReview) return pathnameAndSearch;
  try {
    // Use a dummy origin so URL() can parse path-only values.
    const u = new URL(pathnameAndSearch, "https://orderzhouse.local");
    if (orderId && !u.searchParams.get("orderId")) {
      u.searchParams.set("orderId", orderId);
    }
    if (openReview && !u.searchParams.get("openReview")) {
      u.searchParams.set("openReview", "1");
    }
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    let out = pathnameAndSearch;
    if (orderId && !/[?&]orderId=/.test(out)) {
      const sep = out.includes("?") ? "&" : "?";
      out = `${out}${sep}orderId=${encodeURIComponent(orderId)}`;
    }
    if (openReview && !/[?&]openReview=/.test(out)) {
      const sep = out.includes("?") ? "&" : "?";
      out = `${out}${sep}openReview=1`;
    }
    return out;
  }
}

/**
 * @param {object|null|undefined} notification
 * @param {string} [fallback]
 * @returns {string}
 */
export function resolveNotificationNavPath(notification, fallback = "/dashboard") {
  const base = resolveSafeInternalNavPath(notification?.link, fallback);
  const type = String(notification?.type || "");
  const orderId = extractOrderId(notification);

  const needsOrderFocus =
    type === "order.delivery.submitted" ||
    type === "order.revision.requested" ||
    type === "order.delivery.approved" ||
    (String(notification?.entityType || "").toLowerCase() === "order" && orderId);

  if (!needsOrderFocus || !orderId) return base;

  // Only append to known order list / detail surfaces (never invent admin routes).
  if (
    base.startsWith("/dashboard/client/my-orders") ||
    base.startsWith("/dashboard/admin/orders") ||
    base.startsWith("/dashboard/super-admin/orders") ||
    /^\/dashboard\/freelancer\/my-orders\/?$/.test(base)
  ) {
    const openReview = type === "order.delivery.submitted";
    return withOrderFocusQuery(base, orderId, { openReview });
  }

  return base;
}
