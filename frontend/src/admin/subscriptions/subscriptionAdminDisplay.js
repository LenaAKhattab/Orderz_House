import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";

const SUBSCRIPTION_ADMIN_TZ = "Asia/Amman";

/**
 * Stable Arabic admin date/time: DD/MM/YYYY، h:mm م|ص (Latin digits, Amman TZ).
 */
export function formatSubscriptionAdminDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    const datePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: SUBSCRIPTION_ADMIN_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("ar", {
      timeZone: SUBSCRIPTION_ADMIN_TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);

    return `${datePart}، ${timePart}`;
  } catch {
    return "—";
  }
}

export function activationStatusLabel(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "company_pending") return "بانتظار تفعيل الشركة";
  if (s === "company_approved") return "مفعّل";
  if (s === "company_rejected") return "مرفوض";
  return status || "—";
}

export function paymentStatusLabel(status) {
  const p = String(status || "").trim().toLowerCase();
  if (p === "pending") return "بانتظار الدفع";
  if (p === "paid") return "مدفوع";
  if (p === "not_required") return "لا يتطلب دفعاً";
  if (p === "failed" || p === "unpaid") return "غير مكتمل";
  if (p === "cancelled") return "ملغى";
  return status || "—";
}

export function subscriptionStatusLabel(status) {
  const st = String(status || "").trim().toLowerCase();
  if (st === "assigned_not_started") return "معيّن — لم يبدأ";
  if (st === "active") return "نشط";
  if (st === "expired") return "منتهٍ";
  if (st === "inactive") return "غير نشط";
  if (st === "cancelled") return "ملغى";
  return status || "—";
}

export function eligibilityReasonAdminMessage(reason, subscription = null) {
  const eligibility = { reason: reason || "" };
  return getFreelancerOrderEligibilityMessage(eligibility, subscription);
}

export function formatPlanOrderValueRange(plan) {
  const min = plan?.orderValueMinJod;
  const max = plan?.orderValueMaxJod;
  if (min != null && max != null) return `${min}–${max} د.أ`;
  if (min != null) return `من ${min} د.أ`;
  if (max != null) return `حتى ${max} د.أ`;
  return "—";
}

export function formatPlanPriceLabel(plan) {
  const price = plan?.priceJod;
  if (price == null || !Number.isFinite(Number(price))) return "—";
  return `${Number(price)} د.أ`;
}

/** Admin subscription list: freelancer display name with sensible fallbacks. */
export function formatFreelancerDisplayName(sub) {
  const f = sub?.freelancer;
  if (!f) {
    const uid = sub?.freelancerUserId;
    return uid ? `مستقل · ${uid}` : "بدون اسم";
  }
  const name = [f.firstName, f.fatherName, f.familyName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (f.email) return f.email;
  if (f.accountId) return f.accountId;
  const uid = f.id || sub.freelancerUserId;
  return uid ? `مستقل · ${uid}` : "بدون اسم";
}

/** Secondary line under freelancer name (account id / email when not already in title). */
export function formatFreelancerDisplaySubline(sub) {
  const f = sub?.freelancer;
  if (!f) return null;
  const name = formatFreelancerDisplayName(sub);
  const parts = [];
  if (f.accountId && !name.includes(f.accountId)) parts.push(f.accountId);
  if (f.email && !name.includes("@")) parts.push(f.email);
  return parts.length ? parts.join(" · ") : null;
}

/** Resolve plan title from nested subscription data or a preloaded id→title map. */
export function resolveSubscriptionPlanTitle(sub, planTitleById = {}) {
  const nested = sub?.plan?.title || sub?.plan?.name;
  if (nested && String(nested).trim()) return String(nested).trim();
  const mapped = planTitleById[String(sub?.planId || "")];
  if (mapped && String(mapped).trim()) return String(mapped).trim();
  return null;
}

/** Formatted payment timestamp when recorded; otherwise null (do not substitute payment status text). */
export function formatSubscriptionPaymentDate(sub, formatDateTime = formatSubscriptionAdminDateTime) {
  if (!sub?.paidAt) return null;
  const formatted = formatDateTime(sub.paidAt);
  return formatted === "—" ? null : formatted;
}

/** Table cell for payment date column: actual timestamp or em dash. */
export function subscriptionPaymentDateTableCell(sub, formatDateTime = formatSubscriptionAdminDateTime) {
  return formatSubscriptionPaymentDate(sub, formatDateTime) || "—";
}
