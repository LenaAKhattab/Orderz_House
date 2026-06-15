import { arabicDurationUnit } from "../../utils/arTime";
import { getLocaleField, getLocalizedField } from "../../lib/i18n/getLocalizedField";

function getCategoryName(item, locale = "ar") {
  if (locale === "en") {
    return getLocaleField(item, "name", "en");
  }
  return getLocalizedField(item, "name", locale);
}

export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
}

function currencySuffix(locale = "ar") {
  return locale === "en" ? "JOD" : "د.أ";
}

export function typeLabelAr(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

export function orderPriceText(order, locale = "ar") {
  const currency = currencySuffix(locale);
  if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
    return `${formatMoney(order.bidBudgetMin)} ${currency} - ${formatMoney(order.bidBudgetMax)} ${currency}`;
  }
  if (order?.projectType === "bidding") return "—";
  return `${formatMoney(order?.budget)} ${currency}`;
}

export function shortDescription(text, max = 180, { emptyLabel = "لا يوجد وصف." } = {}) {
  const s = String(text || "").trim();
  if (!s) return emptyLabel;
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export function categoryLine(order, locale = "ar") {
  const c = getCategoryName(order?.category, locale);
  const ss = getCategoryName(order?.subSubcategory, locale);
  if (c && ss) return `${c} / ${ss}`;
  return c || ss || "";
}

export function isBiddingOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

function englishDurationUnit(value, unit, labels) {
  const n = Number(value);
  if (!Number.isFinite(n)) return labels?.days || "days";

  if (unit === "days") return n === 1 ? labels?.day || "day" : labels?.days || "days";
  if (unit === "hours") return n === 1 ? labels?.hour || "hour" : labels?.hours || "hours";
  if (unit === "minutes") return n === 1 ? labels?.minute || "minute" : labels?.minutes || "minutes";
  return String(unit || "");
}

/**
 * Format a delivery duration for marketplace cards.
 * English: number before unit ("5 days"). Arabic: number before unit ("5 أيام").
 *
 * @param {number|string} value
 * @param {string} unit - "days" | "hours" | "minutes"
 * @param {string} [locale="ar"]
 * @param {Record<string, string> | null} [labels] - from orders.marketplace.card.*
 */
export function formatDuration(value, unit, locale = "ar", labels = null) {
  const n = Number(value);
  const normalizedUnit = String(unit || "").toLowerCase();
  if (!Number.isFinite(n) || n <= 0 || !normalizedUnit) return "—";

  if (locale === "en") {
    return `${n} ${englishDurationUnit(n, normalizedUnit, labels)}`;
  }
  return `${n} ${arabicDurationUnit(n, normalizedUnit)}`;
}

export function durationLabel(order, locale = "ar", durationLabels = null) {
  if (!order?.durationValue || !order?.durationUnit) return "—";
  return formatDuration(order.durationValue, order.durationUnit, locale, durationLabels);
}

export function categoryChips(order, locale = "ar") {
  const chips = [];
  const c = getCategoryName(order?.category, locale);
  const ss = getCategoryName(order?.subSubcategory, locale);
  if (c) chips.push(c);
  if (ss && ss !== c) chips.push(ss);
  return chips;
}
