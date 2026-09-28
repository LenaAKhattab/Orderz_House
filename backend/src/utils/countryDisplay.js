const ENGLISH_COUNTRY_NAMES = Object.freeze({
  JO: "Jordan",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  US: "United States",
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
});

const ARABIC_COUNTRY_NAMES = Object.freeze({
  JO: "الأردن",
  SA: "السعودية",
  AE: "الإمارات",
  US: "الولايات المتحدة",
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
});

function normalizeCountryCode(code) {
  if (!code) return null;
  const raw = String(code).trim();
  if (!raw || raw === "غير محدد" || raw === "UNKNOWN") return null;
  const cc = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return cc;
}

function getLocalizedCountryName(code) {
  const cc = normalizeCountryCode(code);
  if (!cc) return "غير محدد";
  return ARABIC_COUNTRY_NAMES[cc] || cc;
}

function getEnglishCountryName(code) {
  const cc = normalizeCountryCode(code);
  if (!cc) return "Unspecified";
  return ENGLISH_COUNTRY_NAMES[cc] || cc;
}

function formatCountryRow(code) {
  const cc = normalizeCountryCode(code);
  return {
    countryCode: cc,
    name: getLocalizedCountryName(code),
    nameEn: getEnglishCountryName(code),
  };
}

module.exports = {
  normalizeCountryCode,
  getLocalizedCountryName,
  formatCountryRow,
};
