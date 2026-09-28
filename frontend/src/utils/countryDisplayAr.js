/** Arabic display names for ISO 3166-1 alpha-2 codes (analysis/dashboard UI). */

const ENGLISH_COUNTRY_NAMES = Object.freeze({
  JO: "Jordan",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  EG: "Egypt",
  IQ: "Iraq",
  LB: "Lebanon",
  PS: "Palestine",
  SY: "Syria",
  KW: "Kuwait",
  QA: "Qatar",
  BH: "Bahrain",
  OM: "Oman",
  YE: "Yemen",
  MA: "Morocco",
  DZ: "Algeria",
  SD: "Sudan",
  TN: "Tunisia",
  LY: "Libya",
  MR: "Mauritania",
  SO: "Somalia",
  US: "United States",
  GB: "United Kingdom",
  TR: "Turkey",
  DE: "Germany",
  FR: "France",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  PK: "Pakistan",
  BD: "Bangladesh",
  ID: "Indonesia",
  MY: "Malaysia",
  NL: "Netherlands",
  IT: "Italy",
  ES: "Spain",
  SE: "Sweden",
  CH: "Switzerland",
  CN: "China",
  RU: "Russia",
  BR: "Brazil",
});

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
export function resolveCountryDisplayName(row, locale = "ar") {
  const codeRaw = row?.countryCode || (isIsoCountryCode(row?.countryName) ? row.countryName : null);
  const code = codeRaw ? String(codeRaw).trim().toUpperCase() : null;
  const names = locale === "en" ? ENGLISH_COUNTRY_NAMES : ARABIC_COUNTRY_NAMES;
  const unspecified = locale === "en" ? "Unspecified" : "غير معروف";

  if (code && names[code]) {
    return names[code];
  }

  const name = String(row?.countryName || row?.name || "").trim();
  if (name === "غير معروف" || name === "غير محدد" || name === "UNKNOWN" || name === "Unspecified") {
    return unspecified;
  }
  if (name && !isIsoCountryCode(name)) {
    return name;
  }
  if (code) {
    return names[code] || code;
  }
  return unspecified;
}

/**
 * @param {Array<{ countryCode?: string | null, countryName?: string | null }>} rows
 */
export function withResolvedCountryNames(rows, locale = "ar") {
  return (rows || []).map((row) => ({
    ...row,
    countryName: resolveCountryDisplayName(row, locale),
  }));
}
