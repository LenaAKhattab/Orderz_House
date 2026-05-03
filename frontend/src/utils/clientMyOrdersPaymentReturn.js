/**
 * Toast copy for Stripe return URLs (`paid=1` / `cancelled=1`) on Client My Orders.
 * Keeps fixed-order vs bid-selection flows separate (bid failures must not imply draft purge).
 */

/** @param {{ response?: { status?: number, data?: { code?: string, message?: string } }, message?: string }}} axiosLike */
export function parseConfirmPaymentAxiosError(axiosLike) {
  const status = axiosLike?.response?.status;
  const code = axiosLike?.response?.data?.code;
  const message = axiosLike?.response?.data?.message || axiosLike?.message || "";
  return { status, code, message: String(message) };
}

/** Fixed-order: confirm failed after returning from Checkout — matches legacy product copy. */
export function getFixedPaymentConfirmFailureToast(isArabic) {
  return {
    title: isArabic ? "فشل إنشاء المشروع" : "Project creation failed",
    message: isArabic
      ? "فشل إنشاء المشروع لأن عملية الدفع لم تكتمل. يرجى المحاولة مرة أخرى."
      : "Project creation failed because the payment was not completed. Please try again.",
  };
}

/**
 * Bid-selection: confirm failed — never use fixed-order purge messaging.
 * @param {boolean} isArabic
 * @param {{ status?: number, code?: string, message?: string }} errInfo
 */
export function getBidPaymentConfirmFailureToast(isArabic, errInfo) {
  const { status, code, message } = errInfo;
  const msgLower = String(message).toLowerCase();

  if (status === 402 || code === "PAYMENT_NOT_COMPLETED") {
    return {
      title: isArabic ? "جاري التحقق من الدفع" : "Verifying payment",
      message: isArabic
        ? "لم يُؤكَّد الدفع بعد من الخادم (قد يتأخر الويب هوك لحظات). انتظر قليلاً ثم حدّث الصفحة. إذا بقي الطلب بانتظار الدفع بعد عدة دقائق، تواصل مع الدعم."
        : "Payment is not confirmed yet (the webhook can take a moment). Wait briefly, then refresh. If the order still shows awaiting payment after a few minutes, contact support.",
      variant: "pending_verify",
    };
  }

  if (status === 503) {
    return {
      title: isArabic ? "خدمة الدفع غير متاحة" : "Payment service unavailable",
      message: isArabic
        ? "تعذّر الاتصال بمزود الدفع حالياً. حاول لاحقاً أو تواصل مع الدعم."
        : "The payment provider is unavailable. Try again later or contact support.",
      variant: "service",
    };
  }

  if (status === 409) {
    if (
      msgLower.includes("not awaiting") ||
      msgLower.includes("does not match") ||
      msgLower.includes("payment is not completed")
    ) {
      return {
        title: isArabic ? "حالة الطلب أو العرض تغيّرت" : "Order or bid state changed",
        message: isArabic
          ? "لا يمكن إتمام تأكيد دفع العرض بالحالة الحالية. حدّث الصفحة، أو أعد فتح الدفع من بطاقة الطلب. إذا ظننت أن الدفع نُزِف بالفعل، انتظر قليلاً ثم حدّث؛ وإلا تواصل مع الدعم."
          : "This bid payment cannot be confirmed in the current state. Refresh the page or start checkout again from the order card. If you believe you were charged, wait briefly and refresh; otherwise contact support.",
        variant: "state",
      };
    }
  }

  return {
    title: isArabic ? "تعذّر تأكيد دفع العرض" : "Could not confirm bid payment",
    message: isArabic
      ? "لم نتمكن من تأكيد دفع العرض المختار. إذا نجح الدفع في Stripe، انتظر قليلاً ثم حدّث الصفحة. إذا تكرّر الخطأ أو لم يُحدَّث الطلب، تواصل مع الدعم مع رقم الطلب."
      : "We could not confirm payment for the selected bid. If Stripe shows a successful charge, wait briefly and refresh. If this persists, contact support with your order ID.",
    variant: "generic",
  };
}

/** User cancelled Stripe Checkout for fixed-order creation. */
export function getFixedCheckoutCancelledToast(isArabic) {
  return {
    title: isArabic ? "فشل إنشاء المشروع" : "Project creation failed",
    message: isArabic
      ? "فشل إنشاء المشروع لأن عملية الدفع لم تكتمل. يرجى المحاولة مرة أخرى."
      : "Project creation failed because the payment was not completed. Please try again.",
  };
}

/** User cancelled Stripe Checkout for bid payment — order stays in awaiting-payment / selection flow; no draft purge. */
export function getBidCheckoutCancelledToast(isArabic) {
  return {
    title: isArabic ? "تم إلغاء الدفع" : "Payment cancelled",
    message: isArabic
      ? "لم يكتمل دفع العرض المختار. الطلب ما يزال في انتظار الدفع؛ يمكنك فتح الطلب وإكمال الدفع لاحقاً."
      : "Bid checkout was cancelled. The order remains awaiting payment—you can open it and complete payment when ready.",
  };
}
