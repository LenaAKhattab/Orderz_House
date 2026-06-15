import { getLocalizedField } from "./getLocalizedField";
import { resolveFaqLocaleKey } from "./resolveFaqLocaleKey";

/**
 * Resolve FAQ question/answer for the active locale.
 * Arabic prefers API/CMS copy; English uses DB fields when present, else locale JSON.
 *
 * @param {Record<string, unknown> | null | undefined} item
 * @param {"question" | "answer"} field
 * @param {string} locale
 * @param {(key: string) => string} t
 * @param {number} [index]
 * @returns {string}
 */
export function getFaqLocalizedText(item, field, locale, t, index) {
  if (!item) return "";

  if (locale === "ar") {
    return getLocalizedField(item, field, locale) || String(item[field] || "");
  }

  const fromApi = getLocalizedField(item, field, locale);
  const base = String(item[field] || "");
  if (fromApi && fromApi !== base) {
    return fromApi;
  }

  const localeKey = resolveFaqLocaleKey(item, index);
  if (localeKey) {
    const key = `home.faq.items.${localeKey}.${field}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }

  return base;
}
