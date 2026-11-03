import { arabicDurationUnit } from "../../utils/arTime";
import { getLocaleField, getLocalizedField } from "../../lib/i18n/getLocalizedField";
import {
  formatBudgetRange,
  formatMarketplaceBudget,
  formatMoney,
  orderPriceText,
} from "../../lib/orders/formatMarketplaceBudget";
import { localeFromEnFlag, pt } from "../../i18n/activeLocale";
import { pluralCategoryFor } from "../../i18n/plural";
import { pluralDurationUnit } from "../orders/durationUnitLabel";

export { formatBudgetRange, formatMarketplaceBudget, formatMoney, orderPriceText };

function getCategoryName(item, locale = "ar") {
  if (locale === "en") {
    return getLocaleField(item, "name", "en");
  }
  return getLocalizedField(item, "name", locale);
}

/** Arabic project-type label (legacy helper; the name is kept for compatibility). */
export function typeLabelAr(projectType) {
  if (projectType === "fixed") return pt("platformComponents.openOrders.projectType.fixed", undefined, "ar");
  if (projectType === "bidding") return pt("platformComponents.openOrders.projectType.bidding", undefined, "ar");
  return "—";
}

/** Default empty label: Arabic for the Arabic / English UI (unchanged), translated for de / nl / ro. */
export function shortDescription(
  text,
  max = 180,
  { emptyLabel = pt("platformComponents.openOrders.noDescription", undefined, localeFromEnFlag(false)) } = {},
) {
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

const DURATION_LABEL_FORMS = Object.freeze({
  days: ["day", "days"],
  hours: ["hour", "hours"],
  minutes: ["minute", "minutes"],
});

/** Latin-script locales (en / de / nl / ro): caller labels when given, else the catalog; plural rules per locale. */
function latinDurationUnit(value, unit, locale, labels) {
  const n = Number(value);
  if (!Number.isFinite(n)) return labels?.days || pluralDurationUnit(null, locale, "days", 2);

  const forms = DURATION_LABEL_FORMS[unit];
  if (!forms) return String(unit || "");
  const label = pluralCategoryFor(locale, n) === "one" ? labels?.[forms[0]] : labels?.[forms[1]];
  return label || pluralDurationUnit(null, locale, unit, n);
}

/**
 * Format a delivery duration for marketplace cards.
 * Latin-script locales: number before unit ("5 days"). Arabic: number before unit ("5 أيام").
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

  if (locale !== "ar") {
    return `${n} ${latinDurationUnit(n, normalizedUnit, locale, labels)}`;
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
