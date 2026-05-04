/** RTL-friendly pool / order status chip label */
export function poolOrderStatusLabel(order) {
  if (!order) return "—";
  const s = String(order.orderStatus || "");
  const map = {
    published: "منشور",
    open_for_freelancers: "مفتوح للمستقلين",
    open_for_bids: "مفتوح للعروض",
    assigned: "مسند",
    in_progress: "قيد التنفيذ",
    pending_payment: "بانتظار الدفع",
    pending_client_review: "بانتظار مراجعة العميل",
    completed: "مكتمل",
    cancelled: "ملغى",
    closed: "مغلق",
  };
  return map[s] || s || "—";
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

export function myOrderStatusBadge(order, phaseLabel) {
  if (!order) return { label: "", tone: "neutral" };
  const s = String(order?.orderStatus || "");
  if (s === "completed") return { label: "مكتمل", tone: "success" };
  if (s === "cancelled") return { label: "ملغى", tone: "warning" };
  if (s === "pending_client_review") return { label: "بانتظار الاعتماد", tone: "info" };
  if (s === "in_progress" || s === "ready_for_work" || s === "assigned") {
    return { label: phaseLabel || "قيد التنفيذ", tone: "neutral" };
  }
  return { label: phaseLabel || s || "—", tone: "neutral" };
}
