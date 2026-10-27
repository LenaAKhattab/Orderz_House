/**
 * Stripe amounts are in the smallest currency unit.
 * @param {string} currencyCode ISO 4217 upper-case
 * @param {number|string} amountMajor e.g. 10.50
 * @returns {number|null}
 */
function amountMajorToStripeMinor(amountMajor, currencyCode) {
  const c = String(currencyCode || "")
    .trim()
    .toUpperCase();
  const n = Number(amountMajor);
  if (!c || !Number.isFinite(n) || n < 0) return null;

  const zeroDecimal = new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);
  const threeDecimal = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

  if (zeroDecimal.has(c)) return Math.round(n);
  if (threeDecimal.has(c)) return Math.round(n * 1000);
  return Math.round(n * 100);
}

/** Stripe charges three-decimal currencies only in whole hundredths (last minor digit 0, e.g. 5.120 JOD → 5120). */
const STRIPE_THREE_DECIMAL_CHARGE_CURRENCIES = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

/**
 * Round a computed minor amount (e.g. after a percentage discount) to one Stripe can charge.
 * Whole-unit prices such as 19 / 50 JOD are already chargeable and are returned unchanged.
 * @param {number} minor
 * @param {string} currencyCode
 * @returns {number}
 */
function chargeableStripeMinor(minor, currencyCode) {
  const n = Math.round(Number(minor));
  if (!Number.isFinite(n)) return n;
  const c = String(currencyCode || "").trim().toUpperCase();
  return STRIPE_THREE_DECIMAL_CHARGE_CURRENCIES.has(c) ? Math.round(n / 10) * 10 : n;
}

module.exports = { amountMajorToStripeMinor, chargeableStripeMinor };
