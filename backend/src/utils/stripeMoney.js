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

module.exports = { amountMajorToStripeMinor };
