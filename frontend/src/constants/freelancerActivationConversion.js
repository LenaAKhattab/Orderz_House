/**
 * Silver conversion copy (catalog: platformConstants.freelancerActivationConversion).
 * `*_AR` exports are the Arabic copy; the helpers take an optional `locale` (default: Arabic, or the active
 * de / nl / ro UI locale — unchanged for Arabic / English).
 */
import { ct, ctAr } from "./constantsI18n.js";

const NS = "freelancerActivationConversion";

export const SILVER_CONVERSION_DEFAULT_ERROR_AR = ctAr(`${NS}.defaultError`);

export const SILVER_CONVERSION_SUCCESS_AR = ctAr(`${NS}.success`);

/** Success message for a UI locale. */
export function silverConversionSuccessMessage(locale) {
  return ct(`${NS}.success`, undefined, locale);
}

export function formatSilverUpgradeButtonLabel(priceJod, locale) {
  const raw = String(priceJod ?? "19").trim();
  const label = raw.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") || "19";
  return ct(`${NS}.upgradeButton`, { price: label }, locale);
}

const ERROR_CODES = new Set([
  "FREELANCER_ACTIVATION_ENGINE_DISABLED",
  "FREELANCER_SILVER_CONVERSION_BLOCKED",
  "FREELANCER_SILVER_PLAN_NOT_FOUND",
  "ACTIVATION_REQUEST_ALREADY_PENDING",
  "MARKETPLACE_PLAN_NOT_FOUND",
]);

export function silverConversionErrorMessage(err, locale) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  if (ERROR_CODES.has(code)) return ct(`${NS}.errors.${code}`, undefined, locale);
  const apiMessage = err?.response?.data?.message;
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage.trim();
  return ct(`${NS}.defaultError`, undefined, locale);
}
