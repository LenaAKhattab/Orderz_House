const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://none:none@127.0.0.1:9/none";
const m = require("../src/services/finance/money");
const { computeBreakdown } = require("../src/services/finance/orderFinanceService");
const { suggestForDefinition } = require("../src/services/finance/pricingEngine");
const { normalizeServiceDefinition } = require("../src/services/serviceCatalogSchema");

describe("money (exact milli-units)", () => {
  it("parses/prints without floating point", () => {
    assert.equal(m.toMilli("0.1") + m.toMilli("0.2"), m.toMilli("0.3"));
    assert.equal(m.fromMilli(m.toMilli("12.345"), 3), "12.345");
    assert.equal(m.fromMilli(m.toMilli("12.345"), 2), "12.35");
    assert.equal(m.fromMilli(m.toMilli("-1.005"), 2), "-1.01");
    assert.throws(() => m.toMilli("1.2345"));
    assert.throws(() => m.toMilli("1e3"));
    assert.throws(() => m.toMilli("NaN"));
  });

  it("percent, inclusive tax and FX are half-up and exact", () => {
    assert.equal(m.percentOf(m.toMilli("100"), "5.00"), m.toMilli("5"));
    assert.equal(m.inclusiveTax(m.toMilli("105"), "5"), m.toMilli("5"));
    // 1 JOD = 5.18 AED → 100 AED = 19.305 JOD
    assert.equal(m.fromMilli(m.convertQuoteToBase(m.toMilli("100"), "5.18"), 3), "19.305");
  });

  it("allocation never creates or destroys value", () => {
    for (const total of [1n, 7n, 100n, 99999n, 1000003n]) {
      const parts = m.allocateByWeights(total, [
        { id: "a", weight: 3333 },
        { id: "b", weight: 3333 },
        { id: "c", weight: 3334 },
      ]);
      assert.equal(parts.reduce((s, p) => s + p.amount, 0n), total);
    }
  });

  it("Stripe minor → milli per currency exponent", () => {
    assert.equal(m.stripeMinorToMilli(25000, "JOD"), 25000n);
    assert.equal(m.stripeMinorToMilli(7500, "AED"), 75000n);
    assert.equal(m.stripeMinorToMilli(5, "JPY"), 5000n);
  });
});

const policies = (over = {}) => ({
  vat: { active: false, config: { ratePercent: "5.00" } },
  quality_checks: { active: false, config: {} },
  revenue_split: { active: false, config: { freelancerPercentOfNet: "50.00" } },
  ...over,
});

describe("settlement breakdown", () => {
  const lines = () => ({
    revenue: [{ currency: "JOD", milli: m.toMilli("100"), taxTreatment: "taxable" }],
    adjustments: [{ currency: "JOD", milli: m.toMilli("10") }],
    fees: [{ currency: "JOD", milli: m.toMilli("3.2") }],
    qualityChecks: [{ currency: "AED", milli: m.toMilli("2") }],
    directCosts: [{ currency: "JOD", milli: m.toMilli("1.8") }],
  });

  it("current policy: no VAT, QC excluded, freelancer = agreed pay, fees hit company share only", () => {
    const b = computeBreakdown({ base: "JOD", lines: lines(), fx: new Map(), policies: policies(), freelancer: { milli: m.toMilli("40"), currency: "JOD" } });
    // QC is in AED with no FX → not ready (rates are never invented).
    assert.equal(b.ready, false);
    assert.deepEqual(b.fxMissing, ["AED"]);
  });

  it("with an explicit FX snapshot the identity holds exactly", () => {
    const fx = new Map([["AED", { id: 7, base_currency: "JOD", rate: "5.18" }]]);
    const b = computeBreakdown({ base: "JOD", lines: lines(), fx, policies: policies(), freelancer: { milli: m.toMilli("40"), currency: "JOD" } });
    assert.equal(b.ready, true);
    const a = b.amounts;
    assert.equal(a.tax, 0n, "VAT disabled (G4)");
    assert.equal(a.qualityChecks, 0n, "QC charging disabled (G6)");
    assert.equal(a.net, a.gross - a.refunds - a.tax - a.fees - a.qualityChecks - a.directCosts);
    assert.equal(a.freelancer, m.toMilli("40"), "freelancer pay is never reduced by fees/costs");
    assert.equal(a.company, a.net - a.freelancer);
    assert.equal(m.fromMilli(a.company, 3), "45.000");
    assert.deepEqual(b.fxUsed, ["7"]);
  });

  it("gated policies change the numbers only when active", () => {
    const fx = new Map([["AED", { id: 7, base_currency: "JOD", rate: "5.18" }]]);
    const b = computeBreakdown({
      base: "JOD",
      lines: lines(),
      fx,
      policies: policies({ vat: { active: true, config: { ratePercent: "5.00" } }, quality_checks: { active: true, config: {} }, revenue_split: { active: true, config: { freelancerPercentOfNet: "50.00" } } }),
      freelancer: { milli: m.toMilli("40"), currency: "JOD" },
    });
    assert.equal(m.fromMilli(b.amounts.tax, 3), "4.762");
    assert.equal(m.fromMilli(b.amounts.qualityChecks, 3), "0.386");
    assert.equal(b.amounts.freelancer, m.toMilli("40"), "split is a suggestion only; agreed pay stays immutable");
    assert.ok(b.splitSuggestion > 0n);
  });
});

describe("pricing engine", () => {
  const def = (priceMode, pricing) =>
    normalizeServiceDefinition({
      serviceCode: "svc_x",
      categoryId: 1,
      priceMode,
      pricing,
      name: { ar: "خدمة", en: "Service" },
      quantity: { unit: "pages", required: false, allowUnspecified: true },
      fields: [],
    });

  it("manual_quote never stores pricing (existing services unchanged)", () => {
    assert.equal(def("manual_quote", { currency: "JOD", amount: "10" }).schema.pricing, undefined);
    assert.equal(def("fixed", undefined).schema.pricing, undefined);
  });

  it("fixed / per_unit / range / package", () => {
    const fixed = def("fixed", { currency: "AED", amount: "150" }).schema;
    assert.equal(suggestForDefinition({ ...fixed, priceMode: "fixed" }).amount, "150.00");
    const pu = def("per_unit", { currency: "JOD", unitAmount: "2.5", minAmount: "10" }).schema;
    assert.equal(suggestForDefinition({ ...pu, priceMode: "per_unit" }, { quantity: "3" }).amount, "10.00", "minimum applies");
    assert.equal(suggestForDefinition({ ...pu, priceMode: "per_unit" }, { quantity: "12.5" }).amount, "31.25");
    assert.equal(suggestForDefinition({ ...pu, priceMode: "per_unit" }, { quantityUnspecified: true }).amount, null);
    const range = def("range", { currency: "JOD", minAmount: "50", maxAmount: "80" }).schema;
    assert.deepEqual(suggestForDefinition({ ...range, priceMode: "range" }).range, { min: "50", max: "80" });
    assert.throws(() => def("range", { currency: "JOD", minAmount: "90", maxAmount: "80" }));
    const pkg = def("package", { currency: "JOD", packages: [{ code: "basic", label: { ar: "أساسي", en: "Basic" }, amount: "20" }] }).schema;
    assert.equal(suggestForDefinition({ ...pkg, priceMode: "package" }).packages.length, 1);
    assert.throws(() => def("fixed", { currency: "USD", amount: "1" }));
    assert.throws(() => def("fixed", { currency: "JOD", amount: "0" }));
  });
});

describe("price modifiers (S7)", () => {
  it("checkbox / option / multiselect / per-unit modifiers add exactly to the fixed price", () => {
    const def = normalizeServiceDefinition({
      serviceCode: "svc_m",
      categoryId: 1,
      priceMode: "fixed",
      pricing: { currency: "JOD", amount: "100" },
      name: { ar: "خدمة", en: "Service" },
      quantity: { unit: "pages" },
      fields: [
        { key: "rush", type: "checkbox", label: { ar: "م", en: "Rush" }, priceModifier: "15" },
        { key: "lang", type: "select", label: { ar: "ل", en: "Lang" }, options: [{ value: "en", label: { ar: "ا", en: "En" }, priceModifier: "5.5" }] },
        { key: "extras", type: "multiselect", label: { ar: "إ", en: "Extras" }, options: [{ value: "src", label: { ar: "م", en: "Source" }, priceModifier: "2.25" }, { value: "pdf", label: { ar: "ب", en: "PDF" }, priceModifier: "1" }] },
        { key: "pages", type: "number", label: { ar: "ص", en: "Pages" }, priceModifier: "0.75" },
      ],
    }).schema;
    const r = suggestForDefinition({ ...def, priceMode: "fixed" }, { values: { rush: true, lang: "en", extras: ["src", "pdf"], pages: 3 } });
    assert.equal(r.baseAmount, "100.00");
    assert.equal(r.amount, "126.00");
    assert.equal(suggestForDefinition({ ...def, priceMode: "fixed" }, { values: { rush: false } }).amount, "100.00");
  });
});
