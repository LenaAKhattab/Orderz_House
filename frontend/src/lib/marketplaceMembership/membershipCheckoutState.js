import { resolveMarketplaceCheckoutPlanCode } from "./marketplaceMembershipCheckoutUi.js";

/**
 * Membership card checkout state from `GET /freelancer/marketplace-membership/checkout-attempts`
 * (server-reconciled with Stripe; attempt state open | processing | unknown).
 *
 * - "processing": Stripe reports the payment is being confirmed → no purchase CTA (no duplicate charge).
 * - "resume": an open checkout (or one not verifiable right now) → enabled "Continue payment"; the
 *   server resumes the same Stripe session or answers with a retryable error.
 * Plans without an unresolved attempt are a normal purchase.
 *
 * @returns {{ byPlanCode: Record<string, "resume" | "processing">, specialOffer: "resume" | "processing" | null }}
 */
export function membershipCheckoutStatesFromAttempts(data) {
  const byPlanCode = {};
  let specialOffer = null;
  for (const row of data?.attempts || []) {
    const code = String(row?.planCode || "").trim().toLowerCase();
    if (!code) continue;
    const next = row.state === "processing" ? "processing" : "resume";
    if (byPlanCode[code] !== "processing") byPlanCode[code] = next;
    if (row.specialOffer && specialOffer !== "processing") specialOffer = next;
  }
  return { byPlanCode, specialOffer };
}

/** @returns {"resume" | "processing" | null} */
export function membershipCheckoutStateForPlan(states, plan) {
  const code = String(resolveMarketplaceCheckoutPlanCode(plan) || "").toLowerCase();
  return (code && states?.byPlanCode?.[code]) || null;
}
