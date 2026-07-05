/** Arabic display names for ISO 3166-1 alpha-2 codes (analysis/dashboard UI). */

const ARABIC_COUNTRY_NAMES = Object.freeze({
  JO: "الأردن",
  SA: "السعودية",
  AE: "الإمارات",
  EG: "مصر",
  IQ: "العراق",
  LB: "لبنان",
  PS: "فلسطين",
  SY: "سوريا",
  KW: "الكويت",
  QA: "قطر",
  BH: "البحرين",
  OM: "عُمان",
  YE: "اليمن",
  MA: "المغرب",
  DZ: "الجزائر",
  SD: "السودان",
  TN: "تونس",
  LY: "ليبيا",
  MR: "موريتانيا",
  SO: "الصومال",
  US: "الولايات المتحدة",
  GB: "المملكة المتحدة",
  TR: "تركيا",
  DE: "ألمانيا",
  FR: "فرنسا",
  CA: "كندا",
  AU: "أستراليا",
  IN: "الهند",
  PK: "باكستان",
  BD: "بنغلاديش",
  ID: "إندونيسيا",
  MY: "ماليزيا",
  NL: "هولندا",
  IT: "إيطاليا",
  ES: "إسبانيا",
  SE: "السويد",
  CH: "سويسرا",
  CN: "الصين",
  RU: "روسيا",
  BR: "البرازيل",
});

function isIsoCountryCode(value) {
  return /^[A-Za-z]{2}$/.test(String(value || "").trim());
}

/**
 * Resolve a user-facing Arabic country label from API row fields.
 * @param {{ countryCode?: string | null, countryName?: string | null }} row
 */
export function resolveCountryDisplayName(row) {
  const codeRaw = row?.countryCode || (isIsoCountryCode(row?.countryName) ? row.countryName : null);
  const code = codeRaw ? String(codeRaw).trim().toUpperCase() : null;

  if (code && ARABIC_COUNTRY_NAMES[code]) {
    return ARABIC_COUNTRY_NAMES[code];
  }

  const name = String(row?.countryName || "").trim();
  if (name === "غير معروف" || name === "غير محدد" || name === "UNKNOWN") {
    return "غير معروف";
  }
  if (name && !isIsoCountryCode(name)) {
    return name;
  }
  if (code) {
    return ARABIC_COUNTRY_NAMES[code] || code;
  }
  return "غير معروف";
}

/**
 * @param {Array<{ countryCode?: string | null, countryName?: string | null }>} rows
 */
export function withResolvedCountryNames(rows) {
  return (rows || []).map((row) => ({
    ...row,
    countryName: resolveCountryDisplayName(row),
  }));
}
