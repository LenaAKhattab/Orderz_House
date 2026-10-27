/**
 * Stripe SDK errors carry the PROVIDER's HTTP status (e.g. StripeAuthenticationError → 401 when the
 * server's Stripe key is wrong). Passed through, that looks like an expired user session to the client.
 * Map every Stripe error to a payment-provider error instead: 503 when the provider is unavailable /
 * rate-limited, otherwise 502. No Stripe message, key fragment or request id reaches the client.
 */
const { createAppError } = require("./AppError");

const PAYMENT_PROVIDER_ERROR_CODE = "PAYMENT_PROVIDER_ERROR";
const PAYMENT_PROVIDER_ERROR_AR = "تعذر الاتصال بمزوّد الدفع حاليًا. حاول مرة أخرى بعد قليل.";
const UNAVAILABLE_TYPES = new Set(["StripeConnectionError", "StripeAPIError", "StripeRateLimitError"]);

function isStripeProviderError(err) {
  const type = err?.type;
  return typeof type === "string" && type.startsWith("Stripe") && err?.exposeToClient !== true;
}

/** @returns {Error} the original error when it is not a Stripe error, otherwise a safe AppError. */
function normalizePaymentProviderError(err) {
  if (!isStripeProviderError(err)) return err;
  const statusCode = UNAVAILABLE_TYPES.has(err.type) ? 503 : 502;
  const appErr = createAppError(PAYMENT_PROVIDER_ERROR_AR, statusCode, {
    exposeToClient: true,
    publicCode: PAYMENT_PROVIDER_ERROR_CODE,
  });
  // Server log only (errorMiddleware prints logDetails for 5xx) — no raw Stripe message.
  appErr.logDetails = {
    provider: "stripe",
    type: String(err.type),
    code: err.code ? String(err.code) : null,
    providerStatus: Number(err.statusCode) || null,
  };
  return appErr;
}

module.exports = {
  PAYMENT_PROVIDER_ERROR_CODE,
  PAYMENT_PROVIDER_ERROR_AR,
  isStripeProviderError,
  normalizePaymentProviderError,
};
