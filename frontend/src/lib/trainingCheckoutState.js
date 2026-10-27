/**
 * Training-package card state from the server snapshot (`GET /freelancer/training-packages/me`).
 * The server reconciles unresolved attempts with Stripe; `checkouts[].state` is open | processing | unknown.
 *
 * - "processing": Stripe reports the payment is being confirmed → no purchase CTA (no duplicate charge).
 * - "resume": an open checkout (or one not verifiable right now) → enabled "Continue payment"; the
 *   server resumes the same Stripe session or answers with a retryable error.
 * Anything else is a normal purchase.
 *
 * @returns {Record<string, "resume" | "processing">}
 */
export function trainingCheckoutStatesFromSnapshot(snapshot) {
  const states = {};
  for (const row of snapshot?.checkouts || []) {
    const code = String(row?.packageCode || "");
    if (!code) continue;
    if (row.state === "processing") states[code] = "processing";
    else if (states[code] !== "processing") states[code] = "resume";
  }
  return states;
}
