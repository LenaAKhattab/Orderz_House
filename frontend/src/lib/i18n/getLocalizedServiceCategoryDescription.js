import { resources } from "../../i18n/resources.js";
import { isNewLocale } from "../../i18n/systemContent.js";
import { getLocalizedField } from "./getLocalizedField.js";
import { localizeSystemCopyForNewLocale } from "./newLocaleSystemCopy.js";

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
 * German / Dutch / Romanian: system-content translation → `services.categories.<slug>` bundle → source text.
 *
 * @param {Record<string, unknown> | null | undefined} category
 * @param {string} [locale="ar"]
 * @returns {string}
 */
export function getLocalizedServiceCategoryDescription(category, locale = "ar") {
  const base = category?.description != null ? String(category.description).trim() : "";

  if (isNewLocale(locale)) {
    if (!category) return "";
    const slug = getServiceCategorySlug(category);
    const bundled = slug ? resources.en?.services?.categories?.[slug]?.description : null;
    return localizeSystemCopyForNewLocale(locale, {
      ar: getLocalizedField(category, "description", "ar") || base,
      en: category.description_en || category.descriptionEn,
      key: bundled != null && String(bundled).trim() !== "" ? `services.categories.${slug}.description` : null,
    });
  }

  const fromApi = getLocalizedField(category, "description", locale);

  if (locale === "en") {
    if (fromApi && fromApi !== base) return fromApi;

    const slug = getServiceCategorySlug(category);
    const fromLocale = resources.en?.services?.categories?.[slug]?.description;
    if (fromLocale != null && String(fromLocale).trim() !== "") return String(fromLocale);

    return base;
  }

  return fromApi || base;
}
