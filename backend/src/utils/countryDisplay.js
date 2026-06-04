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

function formatCountryRow(code) {
  const cc = normalizeCountryCode(code);
  return {
    countryCode: cc,
    name: getLocalizedCountryName(code),
  };
}

module.exports = {
  normalizeCountryCode,
  getLocalizedCountryName,
  formatCountryRow,
};
