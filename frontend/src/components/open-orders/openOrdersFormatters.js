export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
}

export function typeLabelAr(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
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
