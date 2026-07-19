const {
  getBackendPublicUrl,
  isUnsafeMobileCheckoutPublicUrl,
  isProductionEnv,
} = require("../config/backendPublicUrl");

/**
 * Stripe success/cancel URLs for client fixed-order checkout only.
 * Web: SPA my-orders. Mobile: HTTPS bridge on backend public origin → custom scheme.
 */
function buildClientOrderCheckoutReturnUrls({ isMobile, orderId, clientUrl }) {
  const oid = encodeURIComponent(String(orderId));
  if (!isMobile) {
    const base = String(clientUrl || "").replace(/\/$/, "");
    return {
      successUrl: `${base}/dashboard/client/my-orders?paid=1&orderId=${oid}`,
      cancelUrl: `${base}/dashboard/client/my-orders?cancelled=1&orderId=${oid}`,
    };
  }

  const apiBase = getBackendPublicUrl();
  if (isUnsafeMobileCheckoutPublicUrl(apiBase) && isProductionEnv()) {
    const err = new Error(
      "Mobile checkout misconfigured: BACKEND_PUBLIC_URL must be a public HTTPS origin (not localhost).",
    );
    err.statusCode = 500;
    err.publicCode = "MOBILE_CHECKOUT_URL_MISCONFIGURED";
    throw err;
  }

  const q = `orderId=${oid}&session_id={CHECKOUT_SESSION_ID}`;
  return {
    successUrl: `${apiBase}/mobile/payment-return?status=success&${q}`,
    cancelUrl: `${apiBase}/mobile/payment-return?status=cancel&${q}`,
  };
}

module.exports = { buildClientOrderCheckoutReturnUrls };
