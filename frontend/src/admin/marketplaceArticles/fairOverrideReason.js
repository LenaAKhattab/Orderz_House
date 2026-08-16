export const FAIR_OVERRIDE_REASON_MIN = 10;
export const FAIR_OVERRIDE_REASON_MAX = 500;

export const FAIR_OVERRIDE_REASON_LABEL_AR = "سبب تجاوز المرشح الأول";
export const FAIR_OVERRIDE_REASON_HELPER_AR =
  "هذا المتقدم ليس المرشح الأول حسب ترتيب التوزيع العادل. يرجى توضيح سبب الاختيار قبل المتابعة.";

export function isValidFairOverrideReason(value) {
  const text = String(value || "").trim();
  return text.length >= FAIR_OVERRIDE_REASON_MIN && text.length <= FAIR_OVERRIDE_REASON_MAX;
}
