import { getLocaleField, getLocalizedField } from "./getLocalizedField";
import {
  lookupMarketplaceEnglishSeed,
  MARKETPLACE_ORDER_DESCRIPTION_EN_BY_AR,
  MARKETPLACE_ORDER_TITLE_EN_BY_AR,
} from "./marketplaceOrderEnglishSeeds";

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F]/;

function readEnglishApiField(order, field) {
  const fromLocale = getLocaleField(order, field, "en");
  if (fromLocale) return fromLocale;

  const camel = field === "title" ? order?.titleEn : field === "description" ? order?.descriptionEn : null;
  if (camel != null && String(camel).trim() !== "") return String(camel).trim();

  return "";
}

function resolveEnglishOrderTitle(order) {
  const fromApi = readEnglishApiField(order, "title");
  if (fromApi) return fromApi;

  const arabicTitle = String(order?.title || "").trim();
  const seeded = lookupMarketplaceEnglishSeed(arabicTitle, MARKETPLACE_ORDER_TITLE_EN_BY_AR);
  if (seeded) return seeded;

  const code = order?.orderCode ? String(order.orderCode).trim() : "";
  if (code) return code;

  return "";
}

function resolveEnglishOrderDescription(order) {
  const fromApi = readEnglishApiField(order, "description");
  if (fromApi) return fromApi;

  const arabicDescription = String(order?.description || "").trim();
  const seededFromDescription = lookupMarketplaceEnglishSeed(
    arabicDescription,
    MARKETPLACE_ORDER_DESCRIPTION_EN_BY_AR,
  );
  if (seededFromDescription) return seededFromDescription;

  const arabicTitle = String(order?.title || "").trim();
  const seededFromTitle = lookupMarketplaceEnglishSeed(arabicTitle, MARKETPLACE_ORDER_DESCRIPTION_EN_BY_AR);
  if (seededFromTitle) return seededFromTitle;

  return "";
}

/**
 * Resolve marketplace order title via stored translations (title_en) with Arabic fallback.
 * Works for real orders, pool orders, and training/fake order templates.
 *
 * @param {Record<string, unknown> | null | undefined} order
 * @param {string} [locale="ar"]
 * @returns {string}
 */
export function getLocalizedMarketplaceOrderTitle(order, locale = "ar") {
  if (locale === "en") {
    return resolveEnglishOrderTitle(order) || "—";
  }
  const title = getLocalizedField(order, "title", locale);
  return title || "—";
}

/** @alias getLocalizedMarketplaceOrderTitle */
export const getLocalizedOrderTitle = getLocalizedMarketplaceOrderTitle;

/**
 * Resolve order description via stored translations (description_en) with Arabic fallback.
 *
 * @param {Record<string, unknown> | null | undefined} order
 * @param {string} [locale="ar"]
 * @returns {string}
 */
export function getLocalizedMarketplaceOrderDescription(order, locale = "ar") {
  if (locale === "en") {
    return resolveEnglishOrderDescription(order);
  }
  return getLocalizedField(order, "description", locale);
}

/** @alias getLocalizedMarketplaceOrderDescription */
export const getLocalizedOrderDescription = getLocalizedMarketplaceOrderDescription;

/**
 * Resolve optional order fields (instructions, requirements, etc.) via _en columns.
 *
 * @param {Record<string, unknown> | null | undefined} order
 * @param {string} field
 * @param {string} [locale="ar"]
 * @returns {string}
 */
export function getLocalizedOrderField(order, field, locale = "ar") {
  if (locale === "en") {
    return readEnglishApiField(order, field);
  }
  return getLocalizedField(order, field, locale);
}

/**
 * Pick text direction for user-generated content so Arabic fallback reads naturally in English UI.
 *
 * @param {string} text
 * @param {string} [localeDir="rtl"]
 * @returns {"ltr" | "rtl"}
 */
export function resolveUserContentDir(text, localeDir = "rtl") {
  const s = String(text || "").trim();
  if (!s) return localeDir === "ltr" ? "ltr" : "rtl";
  if (ARABIC_SCRIPT_RE.test(s)) return "rtl";
  return localeDir === "ltr" ? "ltr" : "rtl";
}
