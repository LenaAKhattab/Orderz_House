import arAnalysis from "../../../locales/ar/analysis.json";
import enAnalysis from "../../../locales/en/analysis.json";
import { mergeLocaleNamespaces } from "../../../i18n/resources";

mergeLocaleNamespaces({
  ar: { analysis: arAnalysis },
  en: { analysis: enAnalysis },
});

/** @typedef {import('../../../i18n/LanguageProvider').useTranslation} */

export const UNKNOWN_COUNTRY_NAMES = new Set(["غير معروف", "غير محدد", "UNKNOWN"]);

/** @param {{ countryCode?: string | null, countryName?: string | null }} row */
export function isUnknownCountryRow(row) {
  const code = row?.countryCode ? String(row.countryCode).trim() : "";
  if (!code) return true;
  const name = String(row?.countryName || "").trim();
  return UNKNOWN_COUNTRY_NAMES.has(name);
}
