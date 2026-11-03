import "../../../i18n/statusesResources";
import { statusLabel } from "../../../i18n/statusRegistry";
import { localeFromEnFlag, pt } from "../../../i18n/activeLocale";

const SD = "platformComponents.orderDetailsStatus";

/** Statuses with a fallback label in `platformComponents.orderDetailsStatus.status.*`. */
const ORDER_STATUS_FALLBACK_CODES = new Set([
  "published",
  "open_for_freelancers",
  "open_for_bids",
  "assigned",
  "in_progress",
  "ready_for_work",
  "pending_payment",
  "pending_client_review",
  "completed",
  "cancelled",
  "closed",
  "draft",
  "archived",
]);

/**
 * Fallback copy used when the status registry has no label: through the caller's translator when given,
 * otherwise Arabic for the Arabic / English UI (unchanged) and the active locale for German / Dutch / Romanian.
 */
function fallbackText(key, t) {
  return typeof t === "function" ? t(`${SD}.${key}`) : pt(`${SD}.${key}`, undefined, localeFromEnFlag(false));
}

/** RTL-friendly pool / order status chip label */
export function poolOrderStatusLabel(order, t) {
  if (!order) return "—";
  const s = String(order.orderStatus || "");
  const fallback = ORDER_STATUS_FALLBACK_CODES.has(s) ? fallbackText(`status.${s}`, t) : undefined;
  if (t) return statusLabel(t, "orders", s, fallback);
  return fallback || s || "—";
}

/** @returns {"neutral"|"success"|"warning"|"info"} */
export function poolOrderStatusTone(order) {
  const s = String(order?.orderStatus || "");
  if (s === "completed") return "success";
  if (s === "cancelled" || s === "closed") return "warning";
  if (s === "pending_client_review" || s === "pending_payment") return "info";
  if (s === "published" || s === "open_for_freelancers" || s === "open_for_bids") return "info";
  return "neutral";
}

export function myOrderStatusBadge(order, phaseLabel, t) {
  if (!order) return { label: "", tone: "neutral" };
  const s = String(order?.orderStatus || "");
  if (s === "completed") {
    const fallback = fallbackText("status.completed", t);
    return {
      label: t ? statusLabel(t, "orders", s, fallback) : fallback,
      tone: "success",
    };
  }
  if (s === "cancelled") {
    const fallback = fallbackText("status.cancelled", t);
    return {
      label: t ? statusLabel(t, "orders", s, fallback) : fallback,
      tone: "warning",
    };
  }
  if (s === "pending_client_review") {
    const fallback = fallbackText("awaitingApproval", t);
    return {
      label: t ? statusLabel(t, "orders", s, fallback) : fallback,
      tone: "info",
    };
  }
  if (s === "in_progress" || s === "ready_for_work" || s === "assigned") {
    const fallback = phaseLabel || fallbackText("status.in_progress", t);
    return {
      label: t && !phaseLabel ? statusLabel(t, "orders", s, fallback) : fallback,
      tone: "neutral",
    };
  }
  const fallback = phaseLabel || s || "—";
  if (t && !phaseLabel && s) return { label: statusLabel(t, "orders", s, fallback), tone: "neutral" };
  return { label: fallback, tone: "neutral" };
}
