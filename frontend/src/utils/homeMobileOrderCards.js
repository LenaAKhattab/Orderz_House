import heroImage from "../assets/hero.png";
import { orderPriceText } from "../components/open-orders/openOrdersFormatters";
import { resolveBackendAssetUrl } from "./homeCategoryCards";

const PREVIEW_LIMIT = 3;

/**
 * @param {unknown[]} categoryItems
 */
export function buildCategoryImageMap(categoryItems = []) {
  const map = new Map();
  for (const item of categoryItems) {
    const id = item?.id;
    if (id == null) continue;
    const img = resolveBackendAssetUrl(item?.image_url);
    if (img) map.set(String(id), img);
  }
  return map;
}

/**
 * @param {unknown} order
 * @param {Map<string, string>} categoryImageMap
 */
export function mapHomeMobileOrderCard(order, categoryImageMap) {
  const categoryId = order?.categoryId != null ? String(order.categoryId) : "";
  const categoryName = String(order?.category?.name || "").trim() || "طلب";
  const imgSrc = (categoryId && categoryImageMap.get(categoryId)) || heroImage;

  return {
    id: String(order?.id ?? ""),
    title: String(order?.title || "طلب بدون عنوان").trim() || "طلب بدون عنوان",
    imgSrc,
    categoryTag: categoryName,
    priceTag: orderPriceText(order),
    to: "/orders",
  };
}

/**
 * @param {unknown[]} orders
 * @param {unknown[]} categoryItems
 */
export function mapHomeMobileOrderCards(orders = [], categoryItems = []) {
  const categoryImageMap = buildCategoryImageMap(categoryItems);
  return orders.slice(0, PREVIEW_LIMIT).map((order) => mapHomeMobileOrderCard(order, categoryImageMap));
}

export { PREVIEW_LIMIT as HOME_MOBILE_ORDERS_PREVIEW_LIMIT };
