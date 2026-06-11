/** Shown to guests instead of numeric applicant / bidder counts on public pool UI. */
export const GUEST_APPLICANTS_MESSAGE = "يظهر بعد تسجيل الدخول";

export const GUEST_APPLICANTS_MESSAGE_LONG = "عدد المتقدمين يظهر للمستخدمين المسجلين فقط";

/**
 * @param {unknown} count
 * @param {{ isAuthenticated?: boolean, emptyLabel?: string }} [opts]
 * @returns {string}
 */
export function formatApplicantsCountValue(count, { isAuthenticated = false, emptyLabel = "لا يوجد" } = {}) {
  if (!isAuthenticated) return GUEST_APPLICANTS_MESSAGE;
  const n = Math.max(0, Number(count) || 0);
  return n > 0 ? String(n) : emptyLabel;
}

/**
 * Full label for list rows, e.g. "3 متقدمون".
 * @param {unknown} count
 * @param {{ isAuthenticated?: boolean }} [opts]
 * @returns {string}
 */
export function formatApplicantsCountLabel(count, { isAuthenticated = false } = {}) {
  if (!isAuthenticated) return GUEST_APPLICANTS_MESSAGE;
  const n = Math.max(0, Number(count) || 0);
  return `${n} ${n === 1 ? "متقدم" : "متقدمون"}`;
}
