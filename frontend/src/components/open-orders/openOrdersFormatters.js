export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export function typeLabelAr(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

export function relativeTimeAr(value) {
  if (!value) return "الآن";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "الآن";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "الآن";
  if (diffMs < 60 * 1000) return "منذ أقل من دقيقة";
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  return `منذ ${diffDays} يوم`;
}

export function orderPriceText(order) {
  if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
    return `${formatMoney(order.bidBudgetMin)} JOD - ${formatMoney(order.bidBudgetMax)} JOD`;
  }
  if (order?.projectType === "bidding") return "—";
  return `${formatMoney(order?.budget)} JOD`;
}

export function shortDescription(text, max = 180) {
  const s = String(text || "").trim();
  if (!s) return "لا يوجد وصف.";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export function categoryLine(order) {
  const c = String(order?.category?.name || "").trim();
  const ss = String(order?.subSubcategory?.name || "").trim();
  if (c && ss) return `${c} / ${ss}`;
  return c || ss || "بدون تصنيف";
}

export function isBiddingOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}
