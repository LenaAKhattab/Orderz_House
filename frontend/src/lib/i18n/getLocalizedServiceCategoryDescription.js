import { resources } from "../../i18n/resources";
import { getLocalizedField } from "./getLocalizedField";

/**
 * @param {Record<string, unknown> | null | undefined} category
 * @returns {string}
 */
export function getServiceCategorySlug(category) {
  return String(category?.slug || "").toLowerCase().trim();
}

/**
 * Resolve localized category description for Services page cards.
 * English falls back to locale bundle when API has no description_en.
 *
 * @param {Record<string, unknown> | null | undefined} category
 * @param {string} [locale="ar"]
 * @returns {string}
 */
export function getLocalizedServiceCategoryDescription(category, locale = "ar") {
  const fromApi = getLocalizedField(category, "description", locale);
  const base = category?.description != null ? String(category.description).trim() : "";

  if (locale === "en") {
    if (fromApi && fromApi !== base) return fromApi;

    const slug = getServiceCategorySlug(category);
    const fromLocale = resources.en?.services?.categories?.[slug]?.description;
    if (fromLocale != null && String(fromLocale).trim() !== "") return String(fromLocale);

    return base;
  }

  return fromApi || base;
}
