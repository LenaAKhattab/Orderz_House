/** Shown to guests instead of numeric applicant / bidder counts on public pool UI. */
export const GUEST_APPLICANTS_MESSAGE = "يظهر بعد تسجيل الدخول";

export const GUEST_APPLICANTS_MESSAGE_LONG = "عدد المتقدمين يظهر للمستخدمين المسجلين فقط";

/**
 * @param {unknown} count
 * @param {{ isAuthenticated?: boolean, emptyLabel?: string, guestMessage?: string }} [opts]
 * @returns {string}
 */
export function formatApplicantsCountValue(count, { isAuthenticated = false, emptyLabel, guestMessage } = {}) {
  if (!isAuthenticated) return guestMessage || GUEST_APPLICANTS_MESSAGE;
  const n = Math.max(0, Number(count) || 0);
  return n > 0 ? String(n) : emptyLabel || "لا يوجد";
}

/**
 * Full label for list rows, e.g. "3 applicants".
 * @param {unknown} count
 * @param {{ isAuthenticated?: boolean, guestMessage?: string, applicantSingular?: string, applicantPlural?: string }} [opts]
 * @returns {string}
 */
export function formatApplicantsCountLabel(
  count,
  { isAuthenticated = false, guestMessage, applicantSingular, applicantPlural } = {},
) {
  if (!isAuthenticated) return guestMessage || GUEST_APPLICANTS_MESSAGE;
  const n = Math.max(0, Number(count) || 0);
  const singular = applicantSingular || "متقدم";
  const plural = applicantPlural || "متقدمون";
  return `${n} ${n === 1 ? singular : plural}`;
}
