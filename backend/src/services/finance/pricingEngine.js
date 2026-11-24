/**
 * Smart Orders S5 — pricing engine (suggestion only; the Admin quote stays the commercial truth).
 *
 * Works on the FROZEN service definition stored with the order (S2 snapshot / S5 item), so a later
 * catalog price change never alters an existing order's suggestion. manual_quote → no suggestion.
 */

const { pool } = require("../../config/db");
const m = require("./money");

/** S7: sum of field/option price modifiers for the frozen values (top-level fields; exact decimals). */
function modifiersFor(def, values) {
  let total = 0n;
  const lines = [];
  for (const f of def?.fields || []) {
    const v = values?.[f.key];
    if (v === undefined || v === null) continue;
    let add = 0n;
    if (f.type === "checkbox" && v === true && f.priceModifier) add = m.toMilli(f.priceModifier);
    if ((f.type === "select" || f.type === "radio") && Array.isArray(f.options)) {
      const o = f.options.find((x) => x.value === v);
      if (o?.priceModifier) add = m.toMilli(o.priceModifier);
    }
    if (f.type === "multiselect" && Array.isArray(v) && Array.isArray(f.options)) {
      for (const x of v) {
        const o = f.options.find((y) => y.value === x);
        if (o?.priceModifier) add += m.toMilli(o.priceModifier);
      }
    }
    if ((f.type === "number" || f.type === "decimal") && f.priceModifier) {
      const q100 = m.toMilli(String(v)) / 10n;
      add = m.divRoundHalfUp(m.toMilli(f.priceModifier) * q100, 100n);
    }
    if (add > 0n) {
      total += add;
      lines.push({ field: f.key, amount: m.fromMilli(add, 2) });
    }
  }
  return { total, lines };
}

function suggestForDefinition(def, { quantity = null, quantityUnspecified = false, values = {} } = {}) {
  const base = suggestBase(def, { quantity, quantityUnspecified });
  if (base.amount == null) return base;
  const mod = modifiersFor(def, values);
  if (mod.total === 0n) return base;
  return { ...base, baseAmount: base.amount, modifiers: mod.lines, amount: m.fromMilli(m.toMilli(base.amount) + mod.total, 2) };
}

function suggestBase(def, { quantity = null, quantityUnspecified = false } = {}) {
  const mode = def?.priceMode || "manual_quote";
  const p = def?.pricing || null;
  if (mode === "manual_quote" || !p) return { mode, currency: p?.currency || null, amount: null, reason: "manual_quote" };
  switch (mode) {
    case "fixed":
      return { mode, currency: p.currency, amount: m.fromMilli(m.toMilli(p.amount), 2), reason: "fixed" };
    case "per_unit": {
      if (quantityUnspecified || quantity == null) {
        return { mode, currency: p.currency, amount: null, unitAmount: p.unitAmount, reason: "quantity_unspecified" };
      }
      // unit price × quantity (both exact decimals): milli × (q·100)/100.
      const q100 = m.toMilli(String(quantity)) / 10n; // quantity with 2dp → hundredths
      let total = m.divRoundHalfUp(m.toMilli(p.unitAmount) * q100, 100n);
      if (p.minAmount && total < m.toMilli(p.minAmount)) total = m.toMilli(p.minAmount);
      return { mode, currency: p.currency, amount: m.fromMilli(total, 2), unitAmount: p.unitAmount, quantity: String(quantity), reason: "per_unit" };
    }
    case "range":
      return { mode, currency: p.currency, amount: null, range: { min: p.minAmount, max: p.maxAmount }, reason: "range_admin_decides" };
    case "package":
      return { mode, currency: p.currency, amount: null, packages: p.packages, reason: "package_admin_selects" };
    default:
      return { mode, currency: null, amount: null, reason: "unknown_mode" };
  }
}

/** Suggestion for a whole order: primary service + additional items. Never auto-issues a quote. */
async function suggestQuoteForOrder(orderId) {
  const oid = Number(orderId);
  const [primary, items] = await Promise.all([
    pool.query(
      `SELECT service_code, service_version, definition, field_values, quantity::text AS quantity, quantity_unspecified
         FROM order_form_snapshots WHERE order_id = $1 LIMIT 1`,
      [oid],
    ),
    pool.query(
      `SELECT item_no, service_code, service_version, definition, field_values, quantity::text AS quantity, quantity_unspecified,
              price_amount::text AS price_amount, price_currency
         FROM order_service_items WHERE order_id = $1 AND removed_at IS NULL ORDER BY item_no`,
      [oid],
    ),
  ]);
  const lines = [];
  if (primary.rows[0]) {
    const r = primary.rows[0];
    lines.push({ itemNo: 1, serviceCode: r.service_code, version: r.service_version, ...suggestForDefinition(r.definition, { quantity: r.quantity, quantityUnspecified: r.quantity_unspecified, values: r.field_values }) });
  }
  for (const r of items.rows) {
    const s = r.price_amount
      ? { mode: "item_price", currency: r.price_currency, amount: m.fromMilli(m.toMilli(r.price_amount), 2), reason: "item_price" }
      : suggestForDefinition(r.definition, { quantity: r.quantity, quantityUnspecified: r.quantity_unspecified, values: r.field_values });
    lines.push({ itemNo: r.item_no, serviceCode: r.service_code, version: r.service_version, ...s });
  }
  const currencies = new Set(lines.filter((l) => l.amount != null).map((l) => l.currency));
  const complete = lines.length > 0 && lines.every((l) => l.amount != null) && currencies.size === 1;
  let total = null;
  if (complete) total = m.fromMilli(lines.reduce((a, l) => a + m.toMilli(l.amount), 0n), 2);
  return {
    orderId: String(oid),
    lines,
    suggestedBaseAmount: total,
    currency: complete ? [...currencies][0] : null,
    complete,
    note: complete ? null : lines.length === 0 ? "no_service" : currencies.size > 1 ? "mixed_currencies" : "manual_pricing_required",
  };
}

module.exports = { suggestForDefinition, suggestQuoteForOrder, modifiersFor };
