import { isNewLocale } from "../../i18n/systemContent.js";
import { getLocalizedField } from "./getLocalizedField.js";
import { containsArabicScript, localizeSystemCopyForNewLocale } from "./newLocaleSystemCopy.js";
import { canonicalFaqIdForField } from "./resolveFaqLocaleKey.js";

/**
 * Resolve FAQ question/answer for the active locale.
 * Arabic prefers API/CMS copy; English uses DB fields when present, else locale JSON.
 * German / Dutch / Romanian use the DB translation (system-content memory), else the canonical locale JSON,
 * else the English source — never Arabic script.
 *
 * @param {Record<string, unknown> | null | undefined} item
 * @param {"question" | "answer"} field
 * @param {string} locale
 * @param {(key: string) => string} t
 * @param {number} [_index]
 * @returns {string}
 */
export function getFaqLocalizedText(item, field, locale, t, _index) {
  if (!item) return "";

  if (locale === "ar") {
    return getLocalizedField(item, field, locale) || String(item[field] || "");
  }

  if (isNewLocale(locale)) {
    const localeKey = canonicalFaqIdForField(item, field);
    const localized = localizeSystemCopyForNewLocale(locale, {
      ar: getLocalizedField(item, field, "ar") || item[field],
      en: item[`${field}_en`] || item[`${field}En`],
      key: localeKey ? `home.faq.items.${localeKey}.${field}` : null,
    });
    return localized && !containsArabicScript(localized) ? localized : "";
  }

  const fromApi = getLocalizedField(item, field, locale);
  const base = String(item[field] || "");
  if (fromApi && fromApi !== base && !/[؀-ۿ]/.test(fromApi)) {
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
  if (isNewLocale(locale)) return t("platformCore.faq.translationUnavailable");
  return "";
}
