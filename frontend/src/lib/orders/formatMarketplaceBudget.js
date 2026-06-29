const BUDGET_RANGE_SEP = " - ";

export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
}

function currencySuffix(locale = "ar") {
  return locale === "en" ? " JOD" : " د.أ";
}

/**
 * Min–max budget string for marketplace cards (single currency suffix, LTR-friendly).
 * Arabic: 1 - 2 د.أ · English: 1 - 2 JOD
 */
export function formatBudgetRange(min, max, locale = "ar") {
  const minN = Number(min);
  const maxN = Number(max);
  const hasMin = Number.isFinite(minN);
  const hasMax = Number.isFinite(maxN);
  const suffix = currencySuffix(locale);

  if (!hasMin && !hasMax) return "—";
  if (hasMin && hasMax) {
    if (minN === maxN) return `${formatMoney(minN)}${suffix}`;
    return `${formatMoney(minN)}${BUDGET_RANGE_SEP}${formatMoney(maxN)}${suffix}`;
  }
  const single = hasMin ? minN : maxN;
  return `${formatMoney(single)}${suffix}`;
}

/** Marketplace/order card budget label. */
export function formatMarketplaceBudget(order, locale = "ar") {
  if (!order) return "—";
  const projectType = String(order?.projectType || "").toLowerCase();

  if (projectType === "bidding") {
    if (order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
      return formatBudgetRange(order.bidBudgetMin, order.bidBudgetMax, locale);
    }
    return "—";
  }

  if (order?.budget != null && Number.isFinite(Number(order.budget))) {
    return formatBudgetRange(order.budget, order.budget, locale);
  }

  return "—";
}

/** @deprecated Use formatMarketplaceBudget */
export const orderPriceText = formatMarketplaceBudget;
