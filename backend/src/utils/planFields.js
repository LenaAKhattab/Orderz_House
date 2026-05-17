/** Shared parse/normalize for plans JSON and numeric optional fields. */

function parseJsonArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((x) => x != null && String(x).trim()).map((x) => String(x).trim());
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => x != null && String(x).trim()).map((x) => String(x).trim());
      }
    } catch {
      return t
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function parseInstallmentPlan(value) {
  if (value == null) return null;
  let raw = value;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      raw = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const upfrontJod = raw.upfrontJod != null ? Number(raw.upfrontJod) : null;
  const monthlyJod = raw.monthlyJod != null ? Number(raw.monthlyJod) : null;
  const months = raw.months != null ? Number(raw.months) : null;

  const out = {};
  if (Number.isFinite(upfrontJod) && upfrontJod >= 0) out.upfrontJod = upfrontJod;
  if (Number.isFinite(monthlyJod) && monthlyJod >= 0) out.monthlyJod = monthlyJod;
  if (Number.isInteger(months) && months > 0) out.months = months;
  if (raw.notes != null && String(raw.notes).trim()) out.notes = String(raw.notes).trim();

  return Object.keys(out).length > 0 ? out : null;
}

function installmentPlanToDb(value) {
  const parsed = parseInstallmentPlan(value);
  return parsed ? JSON.stringify(parsed) : null;
}

function jsonArrayToDb(value) {
  const arr = parseJsonArray(value);
  return JSON.stringify(arr);
}

function readJsonArrayFromRow(row, col) {
  const v = row[col];
  if (v == null) return [];
  if (Array.isArray(v)) return parseJsonArray(v);
  if (typeof v === "string") return parseJsonArray(v);
  return [];
}

function readInstallmentFromRow(row) {
  const v = row.installment_plan;
  if (v == null) return null;
  if (typeof v === "object") return parseInstallmentPlan(v);
  return parseInstallmentPlan(String(v));
}

function optionalNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Stripe / eligibility: upfront checkout amount if set, else list price. */
function effectiveCheckoutPriceJod(row) {
  if (!row) return null;
  const checkout =
    row.stripe_checkout_amount_jod != null ? Number(row.stripe_checkout_amount_jod) : null;
  const price = row.price_jod != null ? Number(row.price_jod) : null;
  if (Number.isFinite(checkout) && checkout > 0) return checkout;
  if (Number.isFinite(price) && price > 0) return price;
  return null;
}

module.exports = {
  parseJsonArray,
  parseInstallmentPlan,
  installmentPlanToDb,
  jsonArrayToDb,
  readJsonArrayFromRow,
  readInstallmentFromRow,
  optionalNumber,
  effectiveCheckoutPriceJod,
};
