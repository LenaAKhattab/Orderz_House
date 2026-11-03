/**
 * Freelancer account-activation policy (web modal only).
 * Local copy — not loaded from CMS / terms-conditions.
 *
 * TODO: البنود 1–45 لم تُرفق في برومبت الاستبدال. عند وصول النص الكامل
 * أضف الأقسام والعناصر هنا دون تغيير منطق التفعيل.
 */
import { ct, ctAr } from "./constantsI18n.js";

/** Arabic title (catalog: platformConstants.freelancerOrderTenderPolicy.title). */
export const FREELANCER_ORDER_TENDER_POLICY_TITLE = ctAr("freelancerOrderTenderPolicy.title");

/** Policy title for a UI locale (default: Arabic, or the active de / nl / ro locale). */
export function freelancerOrderTenderPolicyTitle(locale) {
  return ct("freelancerOrderTenderPolicy.title", undefined, locale);
}

/**
 * @typedef {{ n: number, text: string }} PolicyItem
 * @typedef {{ id: string, heading: string, items: PolicyItem[] }} PolicySection
 */

/** @type {PolicySection[]} */
export const FREELANCER_ORDER_TENDER_POLICY_SECTIONS = [];
