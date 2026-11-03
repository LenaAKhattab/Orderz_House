import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";
import { isNewLocale } from "../i18n/systemContent.js";

const EL = "platformUtils.eligibility";

/** Shown when pool take/bid is blocked until admin approves the subscription (Arabic, legacy export). */
export const FREELANCER_ADMIN_APPROVAL_PENDING_MSG = pt(`${EL}.adminApprovalPending`, undefined, "ar");

/**
 * @param {string} [locale] copy locale for the untranslated path (no `t`): Arabic unless given; follows
 *   German / Dutch / Romanian UIs.
 */
export function getFreelancerOrderEligibilityMessage(
  eligibility,
  subscription = null,
  t = null,
  locale = localeFromEnFlag(false),
) {
  const reason = String(eligibility?.reason || "");
  const activationStatus = String(subscription?.activationStatus || "");
  const paymentStatus = String(subscription?.paymentStatus || "");
  const isCompanyPending =
    activationStatus === "company_pending" &&
    (paymentStatus === "paid" ||
      paymentStatus === "pending" ||
      paymentStatus === "not_required" ||
      paymentStatus === "");

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
    if (reason === "activation_fee_unpaid") {
      return t("freelancerDashboard.status.eligibility.activationFeeUnpaid");
    }
    if (reason === "account_hold_payment_failed") {
      // Canonical AR/EN copy (the API's freezeMessage is Arabic-only).
      return t("freelancerDashboard.status.eligibility.subscriptionRenewalFailed");
    }
    if (reason === "plan_configuration_error") {
      return t("freelancerDashboard.status.eligibility.planConfigurationError");
    }
    return t("freelancerDashboard.status.eligibility.generic");
  }

  const msg = (key) => pt(`${EL}.${key}`, undefined, locale);

  if (isCompanyPending || reason === "company_activation_pending") {
    return msg("adminApprovalPending");
  }

  if (reason === "no_subscription") {
    return msg("noSubscription");
  }

  if (reason === "status_inactive" || reason === "status_cancelled") {
    return msg("inactive");
  }

  if (reason === "payment_not_completed") {
    return msg("paymentIncomplete");
  }

  if (reason === "expired") {
    return msg("expired");
  }

  if (reason === "activation_fee_unpaid") {
    return msg("activationFeeUnpaid");
  }

  if (reason === "account_hold_payment_failed") {
    // The API's freezeMessage is Arabic-only: German / Dutch / Romanian use the catalog copy.
    if (isNewLocale(locale)) return msg("accountHoldPaymentFailed");
    return eligibility?.freezeMessage?.message || msg("accountHoldPaymentFailed");
  }

  if (reason === "plan_configuration_error") {
    return msg("planConfigurationError");
  }

  return msg("generic");
}
