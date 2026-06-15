import { orderPriceText } from "../components/open-orders/openOrdersFormatters";
import { getLocaleField, getLocalizedField } from "../lib/i18n/getLocalizedField";
import { getLocalizedMarketplaceOrderTitle } from "../lib/i18n/getLocalizedMarketplaceOrderText";

const PREVIEW_LIMIT = 3;

/**
 * @param {unknown} order
 * @param {string} locale
 * @param {string} fallbackTitle
 */
function resolveHomeMobileLatestOrderTitle(order, locale, fallbackTitle) {
  if (locale === "en") {
    const title = getLocalizedMarketplaceOrderTitle(order, "en");
    if (title && title !== "—") return title;
  }

  return getLocalizedField(order, "title", locale).trim() || fallbackTitle;
}

/**
 * @param {unknown} order
 * @param {string} locale
 * @param {{ fallbackTitle: string; fallbackCategory: string }} labels
 */
export function mapHomeMobileOrderCard(order, locale = "ar", labels = {}) {
  const fallbackTitle = labels.fallbackTitle || "";
  const fallbackCategory = labels.fallbackCategory || "";

  const categoryName =
    (locale === "en"
      ? getLocaleField(order?.category, "name", "en")
      : getLocalizedField(order?.category, "name", locale)
    ).trim() || fallbackCategory;
  const title = resolveHomeMobileLatestOrderTitle(order, locale, fallbackTitle);
  return {
    id: String(order?.id ?? ""),
    title,
    categoryTag: categoryName,
    priceTag: orderPriceText(order, locale),
    to: "/orders",
  };
}

/**
 * @param {unknown[]} orders
 * @param {unknown[]} _categoryItems - reserved for future category enrichment
 * @param {string} locale
 * @param {{ fallbackTitle: string; fallbackCategory: string }} labels
 */
export function mapHomeMobileOrderCards(orders = [], _categoryItems = [], locale = "ar", labels = {}) {
  return orders
    .slice(0, PREVIEW_LIMIT)
    .map((order) => mapHomeMobileOrderCard(order, locale, labels));
}

export { PREVIEW_LIMIT as HOME_MOBILE_ORDERS_PREVIEW_LIMIT };
