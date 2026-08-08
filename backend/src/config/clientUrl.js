/**
 * First origin only — used for Stripe success/cancel redirect URLs.
 * CORS may list multiple origins in CLIENT_URL or CORS_ORIGINS; checkout must not use a comma-joined value.
 */
function getPrimaryClientUrl() {
  const raw = String(process.env.CLIENT_URL || "").trim();
  if (!raw) return "";
  const first = raw.split(",")[0].trim();
  return first.replace(/\/$/, "");
}

/**
 * Freelancer plans Stripe Checkout return URLs (success + cancel).
 * Origin must come from getPrimaryClientUrl() / validated CLIENT_URL — never hardcode ports here.
 */
function buildFreelancerPlansCheckoutReturnUrls(clientUrl) {
  const base = String(clientUrl || "").replace(/\/$/, "");
  if (!base) {
    const err = new Error("CLIENT_URL is not configured (set a single origin, e.g. https://orderzhouse.com).");
    err.statusCode = 500;
    throw err;
  }
  return {
    successUrl: `${base}/dashboard/freelancer/plans?freelancer_sub_paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/dashboard/freelancer/plans?freelancer_sub_cancelled=1&session_id={CHECKOUT_SESSION_ID}`,
  };
}

/**
 * Activation-fee-only Checkout return URLs.
 */
function buildFreelancerActivationFeeCheckoutReturnUrls(clientUrl) {
  const base = String(clientUrl || "").replace(/\/$/, "");
  if (!base) {
    const err = new Error("CLIENT_URL is not configured (set a single origin, e.g. https://orderzhouse.com).");
    err.statusCode = 500;
    throw err;
  }
  return {
    successUrl: `${base}/dashboard/freelancer/plans?freelancer_activation_fee_paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/dashboard/freelancer/plans?freelancer_activation_fee_cancelled=1&session_id={CHECKOUT_SESSION_ID}`,
  };
}

/**
 * All allowed browser origins (for CORS). Merges CLIENT_URL and optional CORS_ORIGINS.
 */
function parseAllowedClientOrigins() {
  const out = [];
  const append = (value) => {
    if (!value) return;
    String(value)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => out.push(o));
  };
  append(process.env.CLIENT_URL || "http://localhost:5173");
  append(process.env.CORS_ORIGINS);
  return [...new Set(out)];
}

module.exports = {
  getPrimaryClientUrl,
  parseAllowedClientOrigins,
  buildFreelancerPlansCheckoutReturnUrls,
  buildFreelancerActivationFeeCheckoutReturnUrls,
};
