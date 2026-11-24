/**
 * Smart Orders S5/S7 — pure helpers for the Admin catalog editor (no imports: unit-tested with node --test).
 * The server re-normalises everything (`serviceCatalogSchema.js`); these only shape the payload and give hints.
 */

export const PRICE_CURRENCIES = ["JOD", "AED"];
export const MAX_PACKAGES = 10;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,2})?$/;
const MODIFIER_RE = /^\d{1,7}(\.\d{1,2})?$/;
const PACKAGE_CODE_RE = /^[a-z][a-z0-9_]{0,39}$/;

const blank = (v) => v === undefined || v === null || String(v).trim() === "";
const num = (v) => (blank(v) ? undefined : Number(v));
const trimOrUndef = (v) => (blank(v) ? undefined : String(v).trim());

/** Price modifier hint check (non-negative, ≤ 2 dp). Empty is valid (no modifier). */
export function isValidPriceModifier(v) {
  return blank(v) || MODIFIER_RE.test(String(v).trim());
}

/** Pricing amount check (positive decimal string, ≤ 2 dp). */
export function isValidPriceAmount(v) {
  const t = String(v ?? "").trim();
  return AMOUNT_RE.test(t) && !/^0+(\.0+)?$/.test(t);
}

/** Admin pattern check before saving: must compile with the server's anchoring. Empty = no rule. */
export function isCompilablePattern(pattern) {
  if (blank(pattern)) return true;
  try {
    new RegExp(`^(?:${pattern})$`, "u");
    return true;
  } catch {
    return false;
  }
}

/** One field (recursively for repeater / group sub-fields) → API definition shape. */
export function fieldPayload(f) {
  const structured = f.type === "repeater" || f.type === "conditional_group";
  const out = {
    ...f,
    min: num(f.min),
    max: num(f.max),
    maxLength: num(f.maxLength),
    priceModifier: trimOrUndef(f.priceModifier),
    validationRegex: blank(f.validationRegex) ? undefined : String(f.validationRegex),
    validationMessage: blank(f.validationRegex) ? undefined : f.validationMessage,
    options: Array.isArray(f.options)
      ? f.options.map((o) => {
          const { priceModifier, ...rest } = o;
          const pm = trimOrUndef(priceModifier);
          return pm === undefined ? rest : { ...rest, priceModifier: pm };
        })
      : undefined,
    fields: structured ? (f.fields || []).map(fieldPayload) : undefined,
    minItems: f.type === "repeater" ? num(f.minItems) : undefined,
    maxItems: f.type === "repeater" ? num(f.maxItems) : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** Editor state for pricing from a stored `pricing` object (or empty). */
export function pricingDraftFrom(pricing) {
  const p = pricing && typeof pricing === "object" ? pricing : {};
  return {
    currency: PRICE_CURRENCIES.includes(p.currency) ? p.currency : "JOD",
    amount: p.amount ?? "",
    unitAmount: p.unitAmount ?? "",
    minAmount: p.minAmount ?? "",
    maxAmount: p.maxAmount ?? "",
    packages: Array.isArray(p.packages) ? p.packages.map((x) => ({ code: x.code || "", label: x.label || {}, amount: x.amount ?? "" })) : [],
  };
}

function cents(t) {
  const [w, f = ""] = String(t).split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

/**
 * `pricing` payload for a price mode. Omitted (undefined) for manual_quote, and when nothing was entered (so an
 * unpriced service stays unpriced). Amounts stay strings — never floats.
 */
export function buildPricingPayload(priceMode, d) {
  if (!priceMode || priceMode === "manual_quote" || !d) return undefined;
  const currency = PRICE_CURRENCIES.includes(d.currency) ? d.currency : "JOD";
  switch (priceMode) {
    case "fixed":
      return blank(d.amount) ? undefined : { currency, amount: String(d.amount).trim() };
    case "per_unit":
      if (blank(d.unitAmount) && blank(d.minAmount)) return undefined;
      return { currency, unitAmount: String(d.unitAmount ?? "").trim(), ...(blank(d.minAmount) ? {} : { minAmount: String(d.minAmount).trim() }) };
    case "range":
      if (blank(d.minAmount) && blank(d.maxAmount)) return undefined;
      return { currency, minAmount: String(d.minAmount ?? "").trim(), maxAmount: String(d.maxAmount ?? "").trim() };
    case "package": {
      const packages = (d.packages || []).map((p) => ({ code: String(p.code || "").trim(), label: p.label || {}, amount: String(p.amount ?? "").trim() }));
      return packages.length ? { currency, packages } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Client hints mirroring the server's pricing rules. Returns `{ path: "invalid" }` with server-style paths
 * (`pricing.amount`, `pricing.packages[0].code`, …). Empty object = OK (or nothing to send).
 */
export function validatePricing(priceMode, d) {
  const payload = buildPricingPayload(priceMode, d);
  const errors = {};
  if (!payload) return errors;
  const check = (path, v) => {
    if (!isValidPriceAmount(v)) errors[path] = "invalid";
  };
  if (priceMode === "fixed") check("pricing.amount", payload.amount);
  if (priceMode === "per_unit") {
    check("pricing.unitAmount", payload.unitAmount);
    if (payload.minAmount !== undefined) check("pricing.minAmount", payload.minAmount);
  }
  if (priceMode === "range") {
    check("pricing.minAmount", payload.minAmount);
    check("pricing.maxAmount", payload.maxAmount);
    if (!errors["pricing.minAmount"] && !errors["pricing.maxAmount"] && cents(payload.minAmount) > cents(payload.maxAmount)) {
      errors["pricing.maxAmount"] = "invalid";
    }
  }
  if (priceMode === "package") {
    if (payload.packages.length > MAX_PACKAGES) errors["pricing.packages"] = "invalid";
    const seen = new Set();
    payload.packages.forEach((p, i) => {
      if (!PACKAGE_CODE_RE.test(p.code) || seen.has(p.code)) errors[`pricing.packages[${i}].code`] = "invalid";
      seen.add(p.code);
      if (!String(p.label?.ar || "").trim() || !String(p.label?.en || "").trim()) errors[`pricing.packages[${i}].label`] = "missing";
      check(`pricing.packages[${i}].amount`, p.amount);
    });
  }
  return errors;
}
