export function getFreelancerOrderEligibilityMessage(eligibility, subscription = null) {
  const reason = String(eligibility?.reason || "");
  const activationStatus = String(subscription?.activationStatus || "");
  const paymentStatus = String(subscription?.paymentStatus || "");
  const isCompanyPending =
    activationStatus === "company_pending" && (paymentStatus === "paid" || paymentStatus === "pending" || paymentStatus === "");

  if (isCompanyPending) {
    return "أنت مشترك حالياً، لكن حسابك بانتظار تفعيل الشركة. يرجى مراجعة الشركة لإكمال التفعيل قبل استلام الطلبات.";
  }

  if (reason === "company_activation_pending") {
    return "أنت مشترك حالياً، لكن حسابك بانتظار تفعيل الشركة. يرجى مراجعة الشركة لإكمال التفعيل قبل استلام الطلبات.";
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
