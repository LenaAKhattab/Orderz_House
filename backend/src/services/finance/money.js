/**
 * Exact money arithmetic for the financial engine (Smart Orders S5/S6).
 *
 * Unit: integer milli-units (1/1000 of the currency unit) held as BigInt — exact for JOD (3dp),
 * AED/USD (2dp) and Stripe minor units. Never uses floating point.
 */

const MILLI = 1000n;

function moneyError(message) {
  const e = new Error(message);
  e.statusCode = 400;
  e.publicCode = "FINANCE_INVALID_AMOUNT";
  return e;
}

/** "12.5" / "12.500" / 12 → 12500n. Rejects >3 decimals, exponents, NaN. */
function toMilli(value) {
  if (typeof value === "bigint") return value * MILLI;
  const s = String(value ?? "").trim();
  const m = /^(-)?(\d{1,15})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) throw moneyError("المبلغ غير صالح.");
  const frac = (m[3] || "").padEnd(3, "0");
  const v = BigInt(m[2]) * MILLI + BigInt(frac || "0");
  return m[1] ? -v : v;
}

/** 12500n → "12.500" (decimals 3) or "12.50" (decimals 2, half-up). */
function fromMilli(milli, decimals = 3) {
  let v = BigInt(milli);
  if (decimals < 3) v = divRoundHalfUp(v, 10n ** BigInt(3 - decimals)) * 10n ** BigInt(3 - decimals);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / MILLI;
  const frac = (a % MILLI).toString().padStart(3, "0").slice(0, decimals);
  return `${neg ? "-" : ""}${whole}${decimals > 0 ? `.${frac}` : ""}`;
}

/** Integer division rounding half away from zero. */
function divRoundHalfUp(num, den) {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) throw new Error("division by zero");
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (2n * ad);
  return neg ? -q : q;
}

/** Parse a decimal string ("5.00", "0.2723") into [numerator BigInt, scale BigInt]. */
function decimalParts(value, maxDecimals = 10) {
  const s = String(value ?? "").trim();
  const m = new RegExp(`^(\\d{1,14})(?:\\.(\\d{1,${maxDecimals}}))?$`).exec(s);
  if (!m) throw moneyError("القيمة العشرية غير صالحة.");
  const frac = m[2] || "";
  return [BigInt(m[1] + frac), 10n ** BigInt(frac.length)];
}

/** amount × percent / 100 (half-up). percent is a decimal string like "5.00". */
function percentOf(milli, percent) {
  const [num, scale] = decimalParts(percent, 4);
  return divRoundHalfUp(BigInt(milli) * num, scale * 100n);
}

/** Tax contained in a tax-inclusive amount: amount × r / (100 + r). */
function inclusiveTax(milli, ratePercent) {
  const [num, scale] = decimalParts(ratePercent, 4);
  return divRoundHalfUp(BigInt(milli) * num, scale * 100n + num);
}

/**
 * Convert an amount in `quote` currency to `base` using a snapshot rate expressed as
 * quote-units per 1 base-unit: base = amount / rate.
 */
function convertQuoteToBase(milli, rate) {
  const [num, scale] = decimalParts(rate, 10);
  if (num === 0n) throw moneyError("سعر الصرف غير صالح.");
  return divRoundHalfUp(BigInt(milli) * scale, num);
}

/**
 * Split `total` by integer weights (e.g. basis points summing to 10000) with the largest-remainder
 * method: the parts always sum to exactly `total` (no value created or destroyed).
 * Ties are broken by the stable key order supplied.
 */
function allocateByWeights(total, weights) {
  const t = BigInt(total);
  const ws = weights.map((w) => BigInt(w.weight));
  const sum = ws.reduce((a, b) => a + b, 0n);
  if (sum <= 0n) throw moneyError("مجموع الأوزان غير صالح.");
  const base = ws.map((w) => (t * w) / sum);
  const rema = ws.map((w, i) => ({ i, r: (t * w) % sum }));
  let left = t - base.reduce((a, b) => a + b, 0n);
  rema.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (let k = 0; left > 0n; k = (k + 1) % rema.length) {
    base[rema[k].i] += 1n;
    left -= 1n;
  }
  return weights.map((w, i) => ({ ...w, amount: base[i] }));
}

/** Stripe minor units → milli (zero-decimal ×1000, three-decimal ×1, others ×10). */
function stripeMinorToMilli(minor, currency) {
  const c = String(currency || "").toUpperCase();
  const zero = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const three = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);
  const n = BigInt(minor);
  if (zero.has(c)) return n * 1000n;
  if (three.has(c)) return n;
  return n * 10n;
}

/** NUMERIC(…,2/3) value from pg (string) → milli. */
function numericToMilli(v) {
  return v == null ? 0n : toMilli(String(v));
}

module.exports = {
  toMilli,
  fromMilli,
  divRoundHalfUp,
  percentOf,
  inclusiveTax,
  convertQuoteToBase,
  allocateByWeights,
  stripeMinorToMilli,
  numericToMilli,
};
