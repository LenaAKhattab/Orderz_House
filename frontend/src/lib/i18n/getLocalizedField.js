/**
 * Resolve a localized field from an API/DB item.
 *
 * Fallback order:
 * 1. `${field}_${locale}` (e.g. name_en, title_en, description_en)
 * 2. `${field}_ar` (e.g. name_ar)
 * 3. `${field}` (default Arabic/base column)
 * 4. ""
 *
 * @param {Record<string, unknown> | null | undefined} item
 * @param {string} field
 * @param {string} [locale="ar"]
 * @returns {string}
 */
export function getLocalizedField(item, field, locale = "ar") {
  if (!item || !field) return "";

  const localizedKey = `${field}_${locale}`;
  const arabicKey = `${field}_ar`;

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
 */
export function getLocaleField(item, field, locale = "ar") {
  if (!item || !field) return "";

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
