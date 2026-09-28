/**
 * Order title and description are client-authored (or stored fake-order) content.
 * Locale changes system chrome only. Empty English columns must not hide the original text.
 */

function readOriginalOrderText(order, field) {
  if (!order || !field) return "";
  const base = order[field];
  if (base != null && String(base).trim() !== "") return String(base).trim();

  const arabicKey = `${field}_ar`;
  const arabic = order[arabicKey];
  if (arabic != null && String(arabic).trim() !== "") return String(arabic).trim();

  const camelKey = `${field}Ar`;
  const camel = order[camelKey];
  if (camel != null && String(camel).trim() !== "") return String(camel).trim();

  return "";
}

/**
 * Original order title. Same string in Arabic and English UI.
 *
 * @param {Record<string, unknown> | null | undefined} order
 * @param {string} [_locale]
 * @returns {string}
 */
export function getLocalizedMarketplaceOrderTitle(order, _locale = "ar") {
  return readOriginalOrderText(order, "title");
}

/** @alias getLocalizedMarketplaceOrderTitle */
export const getLocalizedOrderTitle = getLocalizedMarketplaceOrderTitle;

/**
 * Original order description. Empty string means the caller should show the localized empty state.
 *
 * @param {Record<string, unknown> | null | undefined} order
 * @param {string} [_locale]
 * @returns {string}
 */
export function getLocalizedMarketplaceOrderDescription(order, _locale = "ar") {
  return readOriginalOrderText(order, "description");
}

/** @alias getLocalizedMarketplaceOrderDescription */
export const getLocalizedOrderDescription = getLocalizedMarketplaceOrderDescription;

/**
 * Other client-authored order fields (requirements, notes, instructions).
 *
 * @param {Record<string, unknown> | null | undefined} order
 * @param {string} field
 * @param {string} [_locale]
 * @returns {string}
 */
export function getLocalizedOrderField(order, field, _locale = "ar") {
  return readOriginalOrderText(order, field);
}

/**
 * Let the browser pick direction from the text itself.
 * Page direction stays on the UI locale.
 *
 * @param {string} [_text]
 * @param {string} [_localeDir]
 * @returns {"auto"}
 */
export function resolveUserContentDir(_text, _localeDir = "rtl") {
  return "auto";
}
