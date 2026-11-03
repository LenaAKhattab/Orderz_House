/** Provisional product copy — not counsel-approved legal text. */
import { ct, ctAr, ctFromEnFlag, newLocaleRegionName } from "./constantsI18n.js";

export const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION = "2026-08-18-v1";

/** Arabic terms copy (catalog: platformConstants.bildazoAuthorTerms.termsCopy). */
export const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR = ctAr("bildazoAuthorTerms.termsCopy");

export const BILDAZO_AUTHOR_LINK_FLOWS = Object.freeze({
  NEW_ACCOUNT: "new_account",
  EXISTING_ACCOUNT: "existing_account",
});

/** Arabic writer role label (catalog: platformConstants.bildazoAuthorTerms.writerRole). */
export const BILDAZO_WRITER_ROLE_LABEL_AR = ctAr("bildazoAuthorTerms.writerRole");

/** Arabic country names by ISO code; `labelAr` resolves to Intl.DisplayNames for de / nl / ro. */
const BILDAZO_AUTHOR_COUNTRY_ENTRIES = [
  { iso: "JO", nameAr: "الأردن" },
  { iso: "SA", nameAr: "السعودية" },
  { iso: "AE", nameAr: "الإمارات" },
  { iso: "EG", nameAr: "مصر" },
  { iso: "IQ", nameAr: "العراق" },
  { iso: "PS", nameAr: "فلسطين" },
  { iso: "KW", nameAr: "الكويت" },
  { iso: "QA", nameAr: "قطر" },
  { iso: "BH", nameAr: "البحرين" },
  { iso: "OM", nameAr: "عُمان" },
  { iso: "LB", nameAr: "لبنان" },
  { iso: "SY", nameAr: "سوريا" },
  { iso: "YE", nameAr: "اليمن" },
  { iso: "LY", nameAr: "ليبيا" },
  { iso: "TN", nameAr: "تونس" },
  { iso: "DZ", nameAr: "الجزائر" },
  { iso: "MA", nameAr: "المغرب" },
];

export const BILDAZO_AUTHOR_COUNTRIES = Object.freeze(
  BILDAZO_AUTHOR_COUNTRY_ENTRIES.map(({ iso, nameAr }) =>
    Object.freeze({
      iso,
      get labelAr() {
        return newLocaleRegionName(iso) || nameAr;
      },
    }),
  ),
);

export function emailsMatch(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  return Boolean(x && y && x === y);
}

export function hasExistingAccountIdentifier(payload) {
  return Boolean(
    String(payload?.existingBildazoEmail || "").trim() ||
      String(payload?.existingBildazoPublicId || "").trim() ||
      String(payload?.existingBildazoProfileUrl || "").trim(),
  );
}

/** Without `t`: catalog fallback in the non-English UI locale (Arabic, or de / nl / ro) — as before for AR / EN. */
function validationMessage(t, key) {
  return typeof t === "function" ? t(`articles.bildazoGate.errors.${key}`) : ct(`bildazoAuthorTerms.errors.${key}`);
}

export function validateBildazoPasswordPair(password, confirm, t) {
  const msg = (key) => validationMessage(t, key);
  const p = String(password || "");
  if (p.length < 8 || !/[A-Za-z\u0600-\u06FF]/.test(p) || !/\d/.test(p)) {
    return msg("passwordWeak");
  }
  if (confirm != null && String(confirm) !== p) {
    return msg("passwordMismatch");
  }
  return null;
}

export function validateBildazoAuthorLinkForm({ flow, payload, termsChecked, t }) {
  const msg = (key) => validationMessage(t, key);
  if (!termsChecked) return msg("terms");
  if (flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT) {
    if (String(payload?.fullName || "").trim().length < 3) {
      return msg("fullName");
    }
    return validateBildazoPasswordPair(payload?.password, payload?.passwordConfirm, t);
  }
  if (!String(payload?.existingBildazoEmail || "").trim()) {
    return msg("existingCredentials");
  }
  if (!String(payload?.password || "").trim()) {
    return msg("existingCredentials");
  }
  return null;
}

export function isBildazoAuthorLinked(link) {
  return String(link?.status || "") === "linked";
}

/** Without `t`: catalog fallback (English when `isEn`, otherwise Arabic or the active de / nl / ro locale). */
export function bildazoLinkFailureMessage(link, isEn = false, t) {
  const code = String(link?.failureCode || "");
  const pick = (key) =>
    typeof t === "function"
      ? t(`articles.bildazoGate.failures.${key}`)
      : ctFromEnFlag(`bildazoAuthorTerms.failures.${key}`, isEn);
  if (code === "INVALID_CREDENTIALS") return pick("INVALID_CREDENTIALS");
  if (code === "ACCOUNT_UNAVAILABLE") return pick("ACCOUNT_UNAVAILABLE");
  if (code === "ENDPOINT_UNAVAILABLE" || code === "CONFIG_MISSING") return pick("ENDPOINT_UNAVAILABLE");
  if (code === "TIMEOUT" || code === "NETWORK") return pick("TIMEOUT");
  if (String(link?.status || "") === "failed") return pick("failed");
  return "";
}

export function shouldBlockArticleApply(link) {
  return Boolean(link?.gateEnabled) && !isBildazoAuthorLinked(link);
}
