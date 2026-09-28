import "../../../i18n/statusesResources";
import { statusLabel } from "../../../i18n/statusRegistry";

const ORDER_STATUS_AR = {
  published: "منشور",
  open_for_freelancers: "مفتوح للمستقلين",
  open_for_bids: "مفتوح للعروض",
  assigned: "مسند",
  in_progress: "قيد التنفيذ",
  ready_for_work: "جاهز للعمل",
  pending_payment: "بانتظار الدفع",
  pending_client_review: "بانتظار مراجعة العميل",
  completed: "مكتمل",
  cancelled: "ملغى",
  closed: "مغلق",
  draft: "مسودة",
  archived: "مؤرشف",
};

/** RTL-friendly pool / order status chip label */
export function poolOrderStatusLabel(order, t) {
  if (!order) return "—";
  const s = String(order.orderStatus || "");
  const fallback = ORDER_STATUS_AR[s];
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
    return {
      label: t ? statusLabel(t, "orders", s, "مكتمل") : "مكتمل",
      tone: "success",
    };
  }
  if (s === "cancelled") {
    return {
      label: t ? statusLabel(t, "orders", s, "ملغى") : "ملغى",
      tone: "warning",
    };
  }
  if (s === "pending_client_review") {
    return {
      label: t ? statusLabel(t, "orders", s, "بانتظار الاعتماد") : "بانتظار الاعتماد",
      tone: "info",
    };
  }
  if (s === "in_progress" || s === "ready_for_work" || s === "assigned") {
    const fallback = phaseLabel || "قيد التنفيذ";
    return {
      label: t && !phaseLabel ? statusLabel(t, "orders", s, fallback) : fallback,
      tone: "neutral",
    };
  }
  const fallback = phaseLabel || s || "—";
  if (t && !phaseLabel && s) return { label: statusLabel(t, "orders", s, fallback), tone: "neutral" };
  return { label: fallback, tone: "neutral" };
}
