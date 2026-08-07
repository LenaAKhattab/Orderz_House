/**
 * Shared JOD money display for dashboard KPIs and tables.
 * Always uses Western digits (latn) and amount-then-currency order.
 */

const JOD_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Coerce any API/UI amount to a finite number. Nullish / invalid → 0.
 * @param {unknown} amount
 * @returns {number}
 */
export function coerceJodAmount(amount) {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format a JOD amount with Western digits and a stable suffix.
 * Examples (ar): `0 د.أ`, `50 د.أ`, `1,250 د.أ`, `12.5 د.أ`
 * Examples (en): `0 JOD`, `1,250 JOD`
 *
 * Never returns `-`, `NaN`, `null`, or bare currency.
 *
 * @param {unknown} amount
 * @param {{ locale?: string }} [options]
 * @returns {string}
 */
export function formatJodMoney(amount, { locale = "ar" } = {}) {
  const n = coerceJodAmount(amount);
  const formatted = JOD_NUMBER_FORMAT.format(n);
  const suffix = locale === "en" ? "JOD" : "د.أ";
  return `${formatted} ${suffix}`;
}
