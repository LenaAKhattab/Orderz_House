/**
 * Toast copy for Stripe return URLs (`paid=1` / `cancelled=1`) on Client My Orders.
 * Keeps fixed-order vs bid-selection flows separate (bid failures must not imply draft purge).
 */
import { getActiveLocale, pt } from "../i18n/activeLocale.js";

/** @param {{ response?: { status?: number, data?: { code?: string, message?: string } }, message?: string }}} axiosLike */
export function parseConfirmPaymentAxiosError(axiosLike) {
  const status = axiosLike?.response?.status;
  const code = axiosLike?.response?.data?.code;
  const message = axiosLike?.response?.data?.message || axiosLike?.message || "";
  return { status, code, message: String(message) };
}

/** Arabic when asked; otherwise the active non-Arabic UI locale (English when the UI itself is Arabic). */
function localeFromArabicFlag(isArabic) {
  if (isArabic) return "ar";
  const active = getActiveLocale();
  return active === "ar" ? "en" : active;
}

function toastCopy(variantKey, locale) {
  const base = `platformUtils.bidPaymentReturn.${variantKey}`;
  return {
    title: pt(`${base}.title`, undefined, locale),
    message: pt(`${base}.message`, undefined, locale),
  };
}

/**
 * Bid-selection: confirm failed — never use fixed-order purge messaging.
 * @param {boolean} isArabic
 * @param {{ status?: number, code?: string, message?: string }} errInfo
 * @param {string} [locale] UI locale (overrides `isArabic` when given)
 */
export function getBidPaymentConfirmFailureToast(isArabic, errInfo, locale) {
  const { status, code, message } = errInfo;
  const msgLower = String(message).toLowerCase();
  const loc = locale || localeFromArabicFlag(isArabic);

  if (status === 402 || code === "PAYMENT_NOT_COMPLETED") {
    return { ...toastCopy("pendingVerify", loc), variant: "pending_verify" };
  }

  if (status === 503) {
    return { ...toastCopy("serviceUnavailable", loc), variant: "service" };
  }

  if (status === 409) {
    if (
      msgLower.includes("not awaiting") ||
      msgLower.includes("does not match") ||
      msgLower.includes("payment is not completed")
    ) {
      return { ...toastCopy("stateChanged", loc), variant: "state" };
    }
  }

  return { ...toastCopy("generic", loc), variant: "generic" };
}
