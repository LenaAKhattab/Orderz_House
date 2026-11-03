import { isNewLocale, localizeSystemText } from "../../i18n/systemContent.js";

function nonEmpty(value) {
  return value != null && String(value).trim() !== "" ? String(value) : "";
}

/** English source of a bilingual system-content field (`field_en` / `fieldEn`). */
function englishSource(item, field) {
  return nonEmpty(item[`${field}_en`]) || nonEmpty(item[`${field}En`]);
}

/** Arabic source of a bilingual system-content field (`field_ar` / `fieldAr` / base `field`). */
function arabicSource(item, field) {
  return nonEmpty(item[`${field}_ar`]) || nonEmpty(item[`${field}Ar`]) || nonEmpty(item[field]);
}

/**
 * Resolve a localized SYSTEM-content field from an API/DB item (plans, categories, FAQ, CMS pages …).
 * Never use it for user-generated content (orders, messages, profiles) — that keeps its original language.
 *
 * Arabic / English fallback order (unchanged):
 * 1. `${field}_${locale}` (e.g. name_en, title_en, description_en; English also `${field}En`)
 * 2. `${field}_ar`
 * 3. `${field}` (default Arabic/base column)
 * 4. ""
 * German / Dutch / Romanian: the translation of the source (English, else Arabic) from the system-content
 * translation memory (see i18n/systemContent.js).
 *
 * @param {Record<string, unknown> | null | undefined} item
 * @param {string} field
 * @param {string} [locale="ar"]
 * @returns {string}
 */
export function getLocalizedField(item, field, locale = "ar") {
  if (!item || !field) return "";

  if (isNewLocale(locale)) {
    return localizeSystemText(locale, { ar: arabicSource(item, field), en: englishSource(item, field) });
  }

  const localizedKey = `${field}_${locale}`;
  const arabicKey = `${field}_ar`;

  if (locale === "en") {
    const camelKey = `${field}En`;
    const camel = item[camelKey];
    if (camel != null && String(camel).trim() !== "") {
      return String(camel);
    }
  }

  const localized = item[localizedKey];
  if (localized != null && String(localized).trim() !== "") {
    return String(localized);
  }

  const arabic = item[arabicKey];
  if (arabic != null && String(arabic).trim() !== "") {
    return String(arabic);
  }

  const base = item[field];
  if (base != null && String(base).trim() !== "") {
    return String(base);
  }

  return "";
}

/**
 * Locale-only field lookup — does not fall back to Arabic when locale is "en".
 * Use for freelancer dashboard API items that ship titleAr/descriptionAr only.
 * German / Dutch / Romanian translate the English (else Arabic) source through the system-content memory.
 */
export function getLocaleField(item, field, locale = "ar") {
  if (!item || !field) return "";

  if (isNewLocale(locale)) {
    return localizeSystemText(locale, { ar: arabicSource(item, field), en: englishSource(item, field) });
  }

  const localizedKey = `${field}_${locale}`;
  const localized = item[localizedKey];
  if (localized != null && String(localized).trim() !== "") {
    return String(localized);
  }

  if (locale === "ar") {
    const arabicKey = `${field}_ar`;
    const arabic = item[arabicKey];
    if (arabic != null && String(arabic).trim() !== "") {
      return String(arabic);
    }
    const base = item[field];
    if (base != null && String(base).trim() !== "") {
      return String(base);
    }
  }

  return "";
}
