import { pt } from "../../i18n/activeLocale.js";
import { pickIntlTag } from "../../i18n/intlLocale.js";
import { resolveUiLocale } from "../i18n/newLocaleSystemCopy.js";

const BUDGET_RANGE_SEP = " - ";

/**
 * Whole-JOD amount. Arabic / English (and no locale) keep en-US digits and grouping; German / Dutch /
 * Romanian use their own separators.
 * @param {unknown} value
 * @param {string} [locale]
 */
export function formatMoney(value, locale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const tag = pickIntlTag(resolveUiLocale(locale), { ar: "en-US", en: "en-US" });
  return new Intl.NumberFormat(tag, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
}

function withCurrency(amountText, locale) {
  return pt("platformCore.money.jodAmount", { amount: amountText }, locale);
}

function toBudgetNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Min–max budget string for marketplace cards (single currency suffix, LTR-friendly).
 * Arabic: 1 - 2 د.أ · English: 1 - 2 JOD
 */
export function formatBudgetRange(min, max, locale = "ar") {
  const minN = toBudgetNumber(min);
  const maxN = toBudgetNumber(max);
  const hasMin = Number.isFinite(minN);
  const hasMax = Number.isFinite(maxN);
  const uiLocale = resolveUiLocale(locale);

  if (!hasMin && !hasMax) return "—";
  if (hasMin && hasMax) {
    if (minN === maxN) return withCurrency(formatMoney(minN, uiLocale), uiLocale);
    return withCurrency(`${formatMoney(minN, uiLocale)}${BUDGET_RANGE_SEP}${formatMoney(maxN, uiLocale)}`, uiLocale);
  }
  const single = hasMin ? minN : maxN;
  return withCurrency(formatMoney(single, uiLocale), uiLocale);
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
