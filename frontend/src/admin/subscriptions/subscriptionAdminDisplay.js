import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi.js";

const SUBSCRIPTION_ADMIN_TZ = "Asia/Amman";

/**
 * Stable Super Admin date-only: DD/MM/YYYY (Latin digits, Amman TZ).
 */
export function formatSubscriptionAdminDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: SUBSCRIPTION_ADMIN_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

/**
 * Stable Arabic admin date/time: DD/MM/YYYY، h:mm م|ص (Latin digits, Amman TZ).
 */
export function formatSubscriptionAdminDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    const datePart = formatSubscriptionAdminDate(value);
    if (datePart === "—") return "—";

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
  if (s === "company_pending") return "بانتظار موافقة الشركة";
  if (s === "company_approved") return "موافقة الشركة مكتملة";
  if (s === "company_rejected") return "مرفوض من الشركة";
  return status || "—";
}

/**
 * Distinguishes company approval vs fee vs full marketplace eligibility.
 * Prefer this over a single "مفعّل" badge when eligibility is known.
 */
export function describeFreelancerAdminEligibilityState({
  eligibility = null,
  subscription = null,
  activationFeeStatus = null,
} = {}) {
  const reason = String(eligibility?.reason || "").trim().toLowerCase();
  const activation = String(
    subscription?.activationStatus || subscription?.activation_status || "",
  )
    .trim()
    .toLowerCase();
  const status = String(subscription?.status || subscription?.subscriptionStatus || "")
    .trim()
    .toLowerCase();
  const feeDisabled =
    activationFeeStatus?.enabled === false ||
    eligibility?.activationFeeStatus?.enabled === false;
  const feeNeedsPayment =
    !feeDisabled &&
    (activationFeeStatus?.needsPayment === true ||
      eligibility?.activationFeeStatus?.needsPayment === true ||
      reason === "activation_fee_unpaid");
  const feePaid =
    !feeDisabled &&
    (activationFeeStatus?.isCurrent === true ||
      eligibility?.activationFeeStatus?.isCurrent === true ||
      (activationFeeStatus?.needsPayment === false && activationFeeStatus != null));

  if (eligibility?.eligible === true) {
    return {
      code: "fully_eligible",
      label: "المستخدم مؤهل لاستلام الطلبات",
      tone: "success",
      canTakeOrders: true,
    };
  }

  if (reason === "plan_configuration_error") {
    return {
      code: "plan_configuration_error",
      label: "تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.",
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (reason === "order_value_outside_plan_range") {
    return {
      code: "order_value_outside_plan_range",
      label: "هذا الطلب متاح لباقات أعلى. قم بترقية خطتك لاستلامه.",
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (["expired", "status_inactive", "status_cancelled", "invalid_status"].includes(reason) ||
      ["expired", "inactive", "cancelled"].includes(status)) {
    return {
      code: "blocked_or_ended",
      label: subscriptionStatusLabel(status) !== "—"
        ? `الاشتراك: ${subscriptionStatusLabel(status)}`
        : eligibilityReasonAdminMessage(reason, subscription),
      tone: "danger",
      canTakeOrders: false,
    };
  }

  if (activation === "company_pending" || reason === "company_activation_pending") {
    return {
      code: "company_pending",
      label: "بانتظار موافقة الشركة",
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (feeNeedsPayment) {
    return {
      code: "activation_fee_unpaid",
      label: "موافقة الشركة مكتملة، لكن رسوم التفعيل غير مدفوعة",
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (activation === "company_approved" && status === "assigned_not_started" && !feeNeedsPayment) {
    if (eligibility?.eligible === false && reason && reason !== "assigned_not_started") {
      return {
        code: reason || "not_eligible",
        label: eligibilityReasonAdminMessage(reason, subscription),
        tone: "warning",
        canTakeOrders: false,
      };
    }
    return {
      code: "awaiting_first_order",
      label: "بانتظار أول طلب مقبول لبدء الاشتراك",
      tone: "info",
      canTakeOrders: eligibility?.eligible === true,
    };
  }

  if (feePaid && activation === "company_approved" && eligibility?.eligible !== true) {
    return {
      code: reason || "not_eligible",
      label: eligibilityReasonAdminMessage(reason, subscription),
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (activation === "company_approved") {
    return {
      code: "company_approved_incomplete",
      label: eligibility?.reason
        ? eligibilityReasonAdminMessage(eligibility.reason, subscription)
        : "موافقة الشركة مكتملة — تحقق من الأهلية ورسوم التفعيل",
      tone: "warning",
      canTakeOrders: false,
    };
  }

  return {
    code: reason || "unknown",
    label: eligibilityReasonAdminMessage(reason, subscription),
    tone: "neutral",
    canTakeOrders: false,
  };
}

/** Short menu/badge text: never claim full activation unless eligible. */
export function adminSubscriptionActivationMenuLabel({
  isApproved,
  canActivate,
  eligibility = null,
  subscription = null,
  activationFeeStatus = null,
} = {}) {
  if (canActivate) return null;
  if (!isApproved) return "لا يوجد اشتراك للتفعيل";
  const state = describeFreelancerAdminEligibilityState({
    eligibility,
    subscription,
    activationFeeStatus,
  });
  if (state.code === "fully_eligible") return "المستخدم مؤهل لاستلام الطلبات";
  if (state.code === "activation_fee_unpaid") {
    return "موافقة الشركة مكتملة، لكن رسوم التفعيل غير مدفوعة";
  }
  if (state.code === "plan_configuration_error") {
    return "تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.";
  }
  if (state.code === "awaiting_first_order" && state.canTakeOrders) {
    return "موافقة الشركة مكتملة — بانتظار أول طلب";
  }
  return state.label || "موافقة الشركة مكتملة";
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

function isDashboardAdminAssignedSubscription(sub) {
  const source = String(sub?.source || "").trim().toLowerCase();
  const payment = String(sub?.paymentStatus || sub?.payment_status || "").trim().toLowerCase();
  const assignedBy = sub?.assignedByUserId ?? sub?.assigned_by_user_id ?? null;
  const hasAssignedBy =
    assignedBy !== null &&
    assignedBy !== undefined &&
    String(assignedBy).trim() !== "";
  const notes = String(sub?.notes || "").trim();
  return (
    source === "admin" &&
    (payment === "not_required" || payment === "paid") &&
    hasAssignedBy &&
    notes !== "auto_default_free_plan"
  );
}

export { isDashboardAdminAssignedSubscription };

export function isPaidCompanyPendingActivation(sub) {
  const payment = String(sub?.paymentStatus || sub?.payment_status || "").trim().toLowerCase();
  const activation = String(sub?.activationStatus || sub?.activation_status || "").trim().toLowerCase();
  return payment === "paid" && activation === "company_pending";
}

/** Legacy activation page: company approval still required (paid, pending, or not_required). */
export function needsCompanyActivationAction(sub) {
  if (sub?.needsCompanyActivation === true) return true;
  const payment = String(sub?.paymentStatus || sub?.payment_status || "").trim().toLowerCase();
  const activation = String(sub?.activationStatus || sub?.activation_status || "").trim().toLowerCase();
  if (activation !== "company_pending") return false;
  return payment === "paid" || payment === "pending" || payment === "not_required" || payment === "";
}

/** Flutter Super Admin parity — exclude free/STARTER from paid activation counts. */
export function isFreeOrStarterSubscriptionPlan(sub) {
  const planId = String(sub?.planId ?? sub?.plan_id ?? "").trim();
  if (planId === "1") return true;
  const planName = String(sub?.planName ?? sub?.plan_name ?? sub?.planTitle ?? sub?.plan_title ?? "")
    .trim()
    .toLowerCase();
  if (planName === "orderzhouse_free") return true;
  if (planName.includes("starter") || planName.includes("start")) return true;
  if (planName.includes("مجاني") || planName.includes("free")) return true;
  if (String(sub?.notes || "").trim() === "auto_default_free_plan") return true;
  const price = Number(sub?.priceJod ?? sub?.price_jod);
  if (Number.isFinite(price) && price <= 0) {
    const payment = String(sub?.paymentStatus || sub?.payment_status || "").trim().toLowerCase();
    if (payment === "not_required" || payment === "") return true;
  }
  return false;
}

/** Paid membership activation needing company action (not free/legacy/admin-assigned). */
export function isPaidSubscriptionActivationActionable(sub) {
  if (isDashboardAdminAssignedSubscription(sub)) return false;
  if (isFreeOrStarterSubscriptionPlan(sub)) return false;
  return needsCompanyActivationAction(sub);
}

export function countPaidSubscriptionActivations(subs) {
  return (Array.isArray(subs) ? subs : []).filter(isPaidSubscriptionActivationActionable).length;
}

/** Admin who assigned the subscription (activation queue). */
export function formatAssignedByAdminLabel(sub) {
  const ab = sub?.assignedBy;
  if (ab) {
    const name = [ab.firstName, ab.fatherName, ab.familyName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (ab.email) return ab.email;
    if (ab.id) return `مدير #${ab.id}`;
  }
  const id = sub?.assignedByUserId;
  return id ? `مدير #${id}` : null;
}

/** Admin subscriptions table: dashboard manual assign only (not auto free-plan bootstrap). */
export function subscriptionPaymentLabel(sub) {
  if (isDashboardAdminAssignedSubscription(sub)) {
    const payment = String(sub?.paymentStatus || sub?.payment_status || "").trim().toLowerCase();
    if (payment === "paid") return "مدفوع أوفلاين (إسناد إداري)";
    return "إسناد إداري";
  }
  return paymentStatusLabel(sub?.paymentStatus || sub?.payment_status);
}

/** Payment badge tone for admin subscriptions table. */
export function subscriptionPaymentTone(sub) {
  if (isDashboardAdminAssignedSubscription(sub)) {
    return "admin_assigned";
  }
  const payment = String(sub?.paymentStatus || sub?.payment_status || "").trim().toLowerCase();
  if (payment === "pending") return "pending";
  if (payment === "paid") return "success";
  return "neutral";
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
