/** Shown when pool take/bid is blocked until admin approves the subscription. */
export const FREELANCER_ADMIN_APPROVAL_PENDING_MSG =
  "بانتظار موافقة الإدارة قبل بدء استلام الطلبات";

export function getFreelancerOrderEligibilityMessage(eligibility, subscription = null, t = null) {
  const reason = String(eligibility?.reason || "");
  const activationStatus = String(subscription?.activationStatus || "");
  const paymentStatus = String(subscription?.paymentStatus || "");
  const isCompanyPending =
    activationStatus === "company_pending" &&
    (paymentStatus === "paid" || paymentStatus === "pending" || paymentStatus === "not_required" || paymentStatus === "");

  if (typeof t === "function") {
    if (isCompanyPending || reason === "company_activation_pending") {
      return t("freelancerDashboard.status.eligibility.adminApprovalPending");
    }
    if (reason === "no_subscription") {
      return t("freelancerDashboard.status.eligibility.noSubscription");
    }
    if (reason === "status_inactive" || reason === "status_cancelled") {
      return t("freelancerDashboard.status.eligibility.inactive");
    }
    if (reason === "payment_not_completed") {
      return t("freelancerDashboard.status.eligibility.paymentIncomplete");
    }
    if (reason === "expired") {
      return t("freelancerDashboard.status.eligibility.expired");
    }
    return t("freelancerDashboard.status.eligibility.generic");
  }

  if (isCompanyPending || reason === "company_activation_pending") {
    return FREELANCER_ADMIN_APPROVAL_PENDING_MSG;
  }

  if (reason === "no_subscription") {
    return "لا يمكنك استلام الطلبات حالياً لأنك غير مشترك. يرجى الاشتراك أولاً.";
  }

  if (reason === "status_inactive" || reason === "status_cancelled") {
    return "اشتراكك غير نشط حالياً. يرجى الاشتراك أولاً.";
  }

  if (reason === "payment_not_completed") {
    return "تعذر تفعيل استلام الطلبات لأن حالة الدفع للاشتراك غير مكتملة.";
  }

  if (reason === "expired") {
    return "اشتراكك منتهي. يرجى تجديد الاشتراك لاستلام الطلبات.";
  }

  return "حسابك غير مؤهل حالياً لاستلام طلبات من المعرض (تحقق من الاشتراك).";
}
