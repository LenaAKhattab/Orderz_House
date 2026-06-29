import {
  categoryChips,
  categoryLine,
  durationLabel,
  formatBudgetRange,
  formatDuration,
  formatMarketplaceBudget,
  formatMoney,
  orderPriceText,
  shortDescription,
} from "../../components/open-orders/openOrdersFormatters";

export {
  categoryChips,
  categoryLine,
  durationLabel,
  formatBudgetRange,
  formatDuration,
  formatMarketplaceBudget,
  formatMoney,
  orderPriceText,
  shortDescription,
};

/**
 * @param {(key: string) => string} t
 */
export function buildDurationLabels(t) {
  return {
    day: t("orders.marketplace.card.day"),
    days: t("orders.marketplace.card.days"),
    hour: t("orders.marketplace.card.hour"),
    hours: t("orders.marketplace.card.hours"),
    minute: t("orders.marketplace.card.minute"),
    minutes: t("orders.marketplace.card.minutes"),
  };
}

/**
 * @param {object | null | undefined} order
 * @param {string} locale
 * @param {(key: string) => string} t
 */
export function formatOrderDuration(order, locale, t) {
  return durationLabel(order, locale, buildDurationLabels(t));
}

/**
 * @param {object | null | undefined} order
 * @param {string} locale
 */
export function formatOrderBudget(order, locale) {
  return formatMarketplaceBudget(order, locale);
}

/**
 * Format a min–max duration range (training templates).
 *
 * @param {number|string} minDuration
 * @param {number|string} maxDuration
 * @param {string} unit
 * @param {string} locale
 * @param {Record<string, string>} labels
 */
export function formatDurationRange(minDuration, maxDuration, unit, locale, labels) {
  const min = Number(minDuration);
  const max = Number(maxDuration);
  const normalizedUnit = String(unit || "days").toLowerCase();
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "—";
  if (min === max) return formatDuration(min, normalizedUnit, locale, labels);
  return `${formatDuration(min, normalizedUnit, locale, labels)} – ${formatDuration(max, normalizedUnit, locale, labels)}`;
}

/**
 * @param {string | null | undefined} projectType
 * @param {(key: string) => string} t
 */
export function formatOrderProjectType(projectType, t) {
  if (projectType === "fixed") return t("orders.type.fixed");
  if (projectType === "bidding") return t("orders.type.bidding");
  return "—";
}
