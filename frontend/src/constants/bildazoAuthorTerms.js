/** Provisional product copy — not counsel-approved legal text. */
export const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION = "2026-08-18-v1";

export const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR =
  "أوافق على شروط نشر المقالات وربطها بحساب الكاتب في Bildazo، وأقر بأن المقال المقبول قد يتم إرساله للمراجعة والنشر على Bildazo باسمي.";

export const BILDAZO_AUTHOR_LINK_FLOWS = Object.freeze({
  NEW_ACCOUNT: "new_account",
  EXISTING_ACCOUNT: "existing_account",
});

export const BILDAZO_WRITER_ROLE_LABEL_AR = "كاتب";

export const BILDAZO_AUTHOR_COUNTRIES = Object.freeze([
  { iso: "JO", labelAr: "الأردن" },
  { iso: "SA", labelAr: "السعودية" },
  { iso: "AE", labelAr: "الإمارات" },
  { iso: "EG", labelAr: "مصر" },
  { iso: "IQ", labelAr: "العراق" },
  { iso: "PS", labelAr: "فلسطين" },
  { iso: "KW", labelAr: "الكويت" },
  { iso: "QA", labelAr: "قطر" },
  { iso: "BH", labelAr: "البحرين" },
  { iso: "OM", labelAr: "عُمان" },
  { iso: "LB", labelAr: "لبنان" },
  { iso: "SY", labelAr: "سوريا" },
  { iso: "YE", labelAr: "اليمن" },
  { iso: "LY", labelAr: "ليبيا" },
  { iso: "TN", labelAr: "تونس" },
  { iso: "DZ", labelAr: "الجزائر" },
  { iso: "MA", labelAr: "المغرب" },
]);

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

export function validateBildazoPasswordPair(password, confirm) {
  const p = String(password || "");
  if (p.length < 8 || !/[A-Za-z\u0600-\u06FF]/.test(p) || !/\d/.test(p)) {
    return "كلمة المرور يجب أن تكون 8 أحرف على الأقل وتتضمن حرفًا ورقمًا.";
  }
  if (confirm != null && String(confirm) !== p) {
    return "تأكيد كلمة المرور غير مطابق.";
  }
  return null;
}

export function validateBildazoAuthorLinkForm({ flow, payload, termsChecked }) {
  if (!termsChecked) return "يجب الموافقة على شروط ربط حساب الكاتب.";
  if (flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT) {
    if (String(payload?.fullName || "").trim().length < 3) {
      return "الاسم الكامل مطلوب لإنشاء حساب الكاتب.";
    }
    return validateBildazoPasswordPair(payload?.password, payload?.passwordConfirm);
  }
  if (!String(payload?.existingBildazoEmail || "").trim()) {
    return "أدخل بريد حساب Bildazo وكلمة المرور.";
  }
  if (!String(payload?.password || "").trim()) {
    return "أدخل بريد حساب Bildazo وكلمة المرور.";
  }
  return null;
}

export function isBildazoAuthorLinked(link) {
  return String(link?.status || "") === "linked";
}

export function shouldBlockArticleApply(link) {
  return Boolean(link?.gateEnabled) && !isBildazoAuthorLinked(link);
}
