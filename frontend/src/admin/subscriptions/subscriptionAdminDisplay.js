import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi.js";
import { getTranslation } from "../../lib/translation/getTranslation.js";
import "../../i18n/subscriptionsResources.js";
import "../../i18n/statusesResources.js";
import { statusLabel } from "../../i18n/statusRegistry.js";

const SUBSCRIPTION_ADMIN_TZ = "Asia/Amman";

const fallbackT = (key, values) => getTranslation(key, "ar", values);

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

export function activationStatusLabel(status, t = fallbackT) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "company_pending") return t("subscriptions.status.activation.company_pending");
  if (s === "company_approved") return t("subscriptions.status.activation.company_approved");
  if (s === "company_rejected") return t("subscriptions.status.activation.company_rejected");
  return status || "—";
}

/**
 * Distinguishes company approval vs fee vs full marketplace eligibility.
 * Prefer this over a single generic active badge when eligibility is known.
 */
export function describeFreelancerAdminEligibilityState({
  eligibility = null,
  subscription = null,
  activationFeeStatus = null,
  t = fallbackT,
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
      label: t("subscriptions.eligibility.fullyEligible"),
      tone: "success",
      canTakeOrders: true,
    };
  }

  if (reason === "plan_configuration_error") {
    return {
      code: "plan_configuration_error",
      label: t("subscriptions.eligibility.planConfigError"),
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (reason === "order_value_outside_plan_range") {
    return {
      code: "order_value_outside_plan_range",
      label: t("subscriptions.eligibility.orderValueOutOfRange"),
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (["expired", "status_inactive", "status_cancelled", "invalid_status"].includes(reason) ||
      ["expired", "inactive", "cancelled"].includes(status)) {
    const statusLabel = subscriptionStatusLabel(status, t);
    return {
      code: "blocked_or_ended",
      label: statusLabel !== "—"
        ? t("subscriptions.eligibility.subscriptionPrefix", { status: statusLabel })
        : eligibilityReasonAdminMessage(reason, subscription),
      tone: "danger",
      canTakeOrders: false,
    };
  }

  if (activation === "company_pending" || reason === "company_activation_pending") {
    return {
      code: "company_pending",
      label: t("subscriptions.eligibility.companyPending"),
      tone: "warning",
      canTakeOrders: false,
    };
  }

  if (feeNeedsPayment) {
    return {
      code: "activation_fee_unpaid",
      label: t("subscriptions.eligibility.feeUnpaid"),
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
      label: t("subscriptions.eligibility.awaitingFirstOrder"),
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
        : t("subscriptions.eligibility.companyApprovedCheck"),
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
  t = fallbackT,
} = {}) {
  if (canActivate) return null;
  if (!isApproved) return t("subscriptions.eligibility.noSubscriptionToActivate");
  const state = describeFreelancerAdminEligibilityState({
    eligibility,
    subscription,
    activationFeeStatus,
    t,
  });
  if (state.code === "fully_eligible") return t("subscriptions.eligibility.fullyEligible");
  if (state.code === "activation_fee_unpaid") {
    return t("subscriptions.eligibility.feeUnpaid");
  }
  if (state.code === "plan_configuration_error") {
    return t("subscriptions.eligibility.planConfigError");
  }
  if (state.code === "awaiting_first_order" && state.canTakeOrders) {
    return t("subscriptions.eligibility.awaitingFirstOrderShort");
  }
  return state.label || t("subscriptions.eligibility.companyApprovedFallback");
}

export function paymentStatusLabel(status, t = fallbackT) {
  const p = String(status || "").trim().toLowerCase();
  if (p === "pending") return t("subscriptions.status.payment.pending");
  if (p === "paid") return t("subscriptions.status.payment.paid");
  if (p === "not_required") return t("subscriptions.status.payment.not_required");
  if (p === "failed" || p === "unpaid") return t("subscriptions.status.payment.failed");
  if (p === "cancelled") return t("subscriptions.status.payment.cancelled");
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
export function formatAssignedByAdminLabel(sub, t = fallbackT) {
  const ab = sub?.assignedBy;
  if (ab) {
    const name = [ab.firstName, ab.fatherName, ab.familyName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (ab.email) return ab.email;
    if (ab.id) return t("subscriptions.display.adminWithId", { id: ab.id });
  }
  const id = sub?.assignedByUserId;
  return id ? t("subscriptions.display.adminWithId", { id }) : null;
}

/** Admin subscriptions table: dashboard manual assign only (not auto free-plan bootstrap). */
export function subscriptionPaymentLabel(sub, t = fallbackT) {
  if (isDashboardAdminAssignedSubscription(sub)) {
    const payment = String(sub?.paymentStatus || sub?.payment_status || "").trim().toLowerCase();
    if (payment === "paid") return t("subscriptions.status.paymentAdmin.offlinePaid");
    return t("subscriptions.status.paymentAdmin.adminAssigned");
  }
  return paymentStatusLabel(sub?.paymentStatus || sub?.payment_status, t);
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

function subscriptionStatusLegacyFallback(st, t) {
  if (st === "assigned_not_started") return t("subscriptions.status.subscription.assigned_not_started");
  if (st === "active") return t("subscriptions.status.subscription.active");
  if (st === "expired") return t("subscriptions.status.subscription.expired");
  if (st === "inactive") return t("subscriptions.status.subscription.inactive");
  if (st === "cancelled") return t("subscriptions.status.subscription.cancelled");
  return undefined;
}

export function subscriptionStatusLabel(status, t = fallbackT) {
  const st = String(status || "").trim().toLowerCase();
  if (!st) return "—";
  const legacy = subscriptionStatusLegacyFallback(st, t);
  const fromRegistry = statusLabel(t, "subscriptions", st, legacy);
  if (fromRegistry && fromRegistry !== st) return fromRegistry;
  if (legacy != null) return legacy;
  return status || "—";
}

export function eligibilityReasonAdminMessage(reason, subscription = null) {
  const eligibility = { reason: reason || "" };
  return getFreelancerOrderEligibilityMessage(eligibility, subscription);
}

export function formatPlanOrderValueRange(plan, t = fallbackT) {
  const min = plan?.orderValueMinJod;
  const max = plan?.orderValueMaxJod;
  if (min != null && max != null) return t("subscriptions.display.orderRangeBoth", { min, max });
  if (min != null) return t("subscriptions.display.orderRangeMin", { min });
  if (max != null) return t("subscriptions.display.orderRangeMax", { max });
  return "—";
}

export function formatPlanPriceLabel(plan, t = fallbackT) {
  const price = plan?.priceJod;
  if (price == null || !Number.isFinite(Number(price))) return "—";
  return t("subscriptions.display.planPrice", { price: Number(price) });
}

/** Admin subscription list: freelancer display name with sensible fallbacks. */
export function formatFreelancerDisplayName(sub, t = fallbackT) {
  const f = sub?.freelancer;
  if (!f) {
    const uid = sub?.freelancerUserId;
    return uid ? t("subscriptions.display.freelancerWithId", { id: uid }) : t("subscriptions.display.noName");
  }
  const name = [f.firstName, f.fatherName, f.familyName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (f.email) return f.email;
  if (f.accountId) return f.accountId;
  const uid = f.id || sub.freelancerUserId;
  return uid ? t("subscriptions.display.freelancerWithId", { id: uid }) : t("subscriptions.display.noName");
}

/** Secondary line under freelancer name (account id / email when not already in title). */
export function formatFreelancerDisplaySubline(sub, t = fallbackT) {
  const f = sub?.freelancer;
  if (!f) return null;
  const name = formatFreelancerDisplayName(sub, t);
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
