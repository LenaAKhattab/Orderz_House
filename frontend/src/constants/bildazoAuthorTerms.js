/** Provisional product copy — not counsel-approved legal text. */
export const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION = "2026-08-18-v1";

export const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR =
  "أوافق على شروط نشر المقالات وربطها بحساب الكاتب في Bildazo، وأقر بأن المقال المقبول قد يتم إرساله للمراجعة والنشر على Bildazo باسمي.";

export const BILDAZO_AUTHOR_LINK_FLOWS = Object.freeze({
  NEW_ACCOUNT: "new_account",
  EXISTING_ACCOUNT: "existing_account",
});

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

export function validateBildazoAuthorLinkForm({ flow, payload, termsChecked }) {
  if (!termsChecked) return "يجب الموافقة على شروط ربط حساب الكاتب.";
  if (flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT) {
    if (String(payload?.fullName || "").trim().length < 3) {
      return "الاسم الكامل مطلوب لإنشاء حساب الكاتب.";
    }
    return null;
  }
  if (!hasExistingAccountIdentifier(payload)) {
    return "أدخل بريد حساب Bildazo أو الرقم العام أو رابط الملف الشخصي.";
  }
  return null;
}

export function isBildazoAuthorLinked(link) {
  return String(link?.status || "") === "linked";
}

export function shouldBlockArticleApply(link) {
  return Boolean(link?.gateEnabled) && !isBildazoAuthorLinked(link);
}
