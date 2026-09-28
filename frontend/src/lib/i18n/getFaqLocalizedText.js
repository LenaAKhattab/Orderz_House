import { getLocalizedField } from "./getLocalizedField.js";
import { canonicalFaqIdForField } from "./resolveFaqLocaleKey.js";

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
  if (fromApi && fromApi !== base && !/[\u0600-\u06FF]/.test(fromApi)) {
    return fromApi;
  }

  const localeKey = canonicalFaqIdForField(item, field);
  if (localeKey) {
    const key = `home.faq.items.${localeKey}.${field}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }

  return "";
}

export function faqTextOrNotice(text, locale, t) {
  if (text) return text;
  if (locale === "en") return t("home.faq.englishUnavailable");
  return "";
}
