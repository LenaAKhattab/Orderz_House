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
 * When CLIENT_URL is an apex host (no www.), also trust the www sibling for CORS/origin-guard.
 * Canonical application URL stays CLIENT_URL; www is only a trusted browser origin during
 * redirect rollout and for leftover tabs that still send Origin: https://www.…
 */
function appendWwwSiblingOrigins(origins) {
  const out = [...origins];
  for (const origin of origins) {
    try {
      const u = new URL(origin);
      if (u.hostname.startsWith("www.")) continue;
      // Only auto-pair bare registrable-looking hosts (no extra subdomain), e.g. orderzhouse.com
      if (u.hostname.split(".").length !== 2) continue;
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const wwwOrigin = `${u.protocol}//www.${u.hostname}`;
      if (!out.includes(wwwOrigin)) out.push(wwwOrigin);
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

/**
 * All allowed browser origins (for CORS + originGuard). Merges CLIENT_URL and optional CORS_ORIGINS.
 * Also includes the www sibling of apex CLIENT_URL hosts (defense-in-depth; not a second canonical site).
 */
function parseAllowedClientOrigins() {
  const collected = [];
  const append = (value) => {
    if (!value) return;
    String(value)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => {
        const normalized = o.replace(/\/$/, "");
        if (!collected.includes(normalized)) collected.push(normalized);
      });
  };
  append(process.env.CLIENT_URL || "http://localhost:5173");
  append(process.env.CORS_ORIGINS);
  return appendWwwSiblingOrigins(collected);
}

/** True when origin is on the shared CORS / origin-guard allowlist. */
function isTrustedBrowserOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  let normalized;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    normalized = `${u.protocol}//${u.host}`;
  } catch {
    return false;
  }
  return parseAllowedClientOrigins().includes(normalized);
}

module.exports = {
  getPrimaryClientUrl,
  parseAllowedClientOrigins,
  isTrustedBrowserOrigin,
  appendWwwSiblingOrigins,
  buildFreelancerPlansCheckoutReturnUrls,
  buildFreelancerActivationFeeCheckoutReturnUrls,
};
