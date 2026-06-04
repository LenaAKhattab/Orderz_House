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
  MA: "المغرب",
  DZ: "الجزائر",
  TN: "تونس",
  LY: "ليبيا",
  SD: "السودان",
  TR: "تركيا",
  GB: "المملكة المتحدة",
  DE: "ألمانيا",
  FR: "فرنسا",
  CA: "كندا",
  AU: "أستراليا",
});

let displayNamesAr;
try {
  displayNamesAr = new Intl.DisplayNames(["ar"], { type: "region" });
} catch {
  displayNamesAr = null;
}

export function normalizeCountryCode(code) {
  if (!code) return null;
  const cc = String(code).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return cc;
}

export function countryCodeToFlag(code) {
  const cc = normalizeCountryCode(code);
  if (!cc) return "";
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 - 65 + ch.charCodeAt(0)));
}

export function getLocalizedCountryName(code) {
  const cc = normalizeCountryCode(code);
  if (!cc) return null;
  if (ARABIC_COUNTRY_NAMES[cc]) return ARABIC_COUNTRY_NAMES[cc];
  try {
    return displayNamesAr?.of(cc) || cc;
  } catch {
    return cc;
  }
}

/**
 * @returns {{ flag: string, name: string, label: string } | null}
 */
export function formatPaymentCountryDisplay(code) {
  const cc = normalizeCountryCode(code);
  if (!cc) return null;
  const flag = countryCodeToFlag(cc);
  const name = getLocalizedCountryName(cc);
  return {
    flag,
    name,
    label: `${flag} ${name}`.trim(),
  };
}

export function formatPaymentCountryShort(code) {
  return formatPaymentCountryDisplay(code)?.label || "غير معروف";
}

/**
 * Admin-friendly text:
 * - unpaid pending attempts should not look like unknown country
 * - otherwise keep localized Stripe-derived country when available
 */
export function formatSubscriptionPaymentCountry({ countryCode, paymentStatus }) {
  const p = String(paymentStatus || "").trim().toLowerCase();
  if (!countryCode && p === "pending") return "بانتظار الدفع";
  return formatPaymentCountryShort(countryCode);
}
