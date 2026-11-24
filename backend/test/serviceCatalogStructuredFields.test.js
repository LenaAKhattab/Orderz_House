const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://none:none@127.0.0.1:9/none";
const s = require("../src/services/serviceCatalogSchema");

const base = { serviceCode: "svc_t", categoryId: 1, name: { ar: "خدمة", en: "Service" }, quantity: { unit: "pages" } };
const L = (en) => ({ ar: "حقل", en });
const textWith = (validationRegex) => s.normalizeServiceDefinition({ ...base, fields: [{ key: "a", type: "text", label: L("A"), validationRegex }] });

describe("S7 structured catalog fields", () => {
  it("validation_regex: safe patterns accepted, catastrophic / back-reference / look-around rejected", () => {
    for (const ok of [String.raw`[A-Z]{2}\d{6}`, "(x|y)+", String.raw`[a-z]+@[a-z]+\.com`, String.raw`\d{4}-\d{2}`]) {
      assert.doesNotThrow(() => textWith(ok), ok);
    }
    for (const bad of ["(a+)+", String.raw`(\d*)*`, "(x{2,})+", String.raw`(ab)\1`, String.raw`(?<n>a)\k<n>`, "(?=a)b", "(?<!a)b", "[", "a".repeat(201)]) {
      assert.throws(() => textWith(bad), (e) => e.fieldErrors?.["fields[0].validationRegex"] === "unsafe", bad);
    }
  });

  const def = s.normalizeServiceDefinition({
    ...base,
    fields: [
      { key: "code", type: "text", label: L("Code"), validationRegex: String.raw`[A-Z]{2}\d{4}` },
      { key: "rush", type: "checkbox", label: L("Rush"), priceModifier: "15" },
      { key: "lang", type: "select", label: L("Lang"), options: [{ value: "en", label: L("En"), priceModifier: "5.5" }, { value: "fr", label: L("Fr") }] },
      {
        key: "refs",
        type: "repeater",
        label: L("Refs"),
        minItems: 1,
        maxItems: 3,
        fields: [
          { key: "title", type: "text", label: L("T"), required: true },
          { key: "url", type: "url", label: L("U") },
        ],
      },
      { key: "needs_print", type: "checkbox", label: L("Print?") },
      {
        key: "print",
        type: "conditional_group",
        label: L("Print"),
        showIf: { field: "needs_print", in: [true] },
        fields: [{ key: "size", type: "select", label: L("Size"), required: true, options: [{ value: "a4", label: L("A4") }] }],
      },
    ],
  }).schema;
  const v = (values) => s.validateOrderForm(def, { values });
  const errs = (values) => {
    try {
      v(values);
      return null;
    } catch (e) {
      return e.fieldErrors;
    }
  };

  it("regex format, repeater rows and conditional group validation", () => {
    assert.deepEqual(v({ code: "AB1234", refs: [{ title: "x", url: "https://a.com" }] }).values, {
      code: "AB1234",
      refs: [{ title: "x", url: "https://a.com/" }],
    });
    assert.deepEqual(errs({ code: "ab12", refs: [{ title: "x" }] }), { code: "invalid_format" });
    assert.deepEqual(errs({}), { refs: "below_min" }, "minItems ≥ 1 implies at least one row");
    assert.deepEqual(errs({ refs: [{ url: "https://a.com" }] }), { "refs[0].title": "required" });
    assert.deepEqual(errs({ refs: [{ title: "a" }, { title: "b" }, { title: "c" }, { title: "d" }] }), { refs: "above_max" });
    assert.deepEqual(errs({ refs: [{ title: "x", evil: 1 }] }), { "refs[0].evil": "unknown_field" });
    assert.deepEqual(errs({ refs: [{ title: "x" }], needs_print: true }), { "print.size": "required" }, "visible group enforces its required fields");
    assert.deepEqual(v({ refs: [{ title: "x" }], needs_print: true, print: { size: "a4" } }).values.print, { size: "a4" });
    assert.equal(v({ refs: [{ title: "x" }], print: { size: "a4" } }).values.print, undefined, "hidden group is dropped");
  });

  it("price modifiers are stored as exact decimal strings; nesting and bad modifiers rejected", () => {
    assert.equal(def.fields.find((f) => f.key === "rush").priceModifier, "15");
    assert.equal(def.fields.find((f) => f.key === "lang").options[0].priceModifier, "5.5");
    assert.throws(() => s.normalizeServiceDefinition({ ...base, fields: [{ key: "r", type: "checkbox", label: L("R"), priceModifier: "-1" }] }));
    assert.throws(() =>
      s.normalizeServiceDefinition({ ...base, fields: [{ key: "r", type: "repeater", label: L("R"), fields: [{ key: "x", type: "repeater", label: L("X"), fields: [] }] }] }),
    );
    assert.throws(() =>
      s.normalizeServiceDefinition({ ...base, fields: [{ key: "r", type: "repeater", label: L("R"), fields: [{ key: "f", type: "file", label: L("F") }] }] }),
    );
  });
});

describe("pricing never leaks to customers / freelancers", () => {
  it("public catalog and order snapshots strip price modifiers; admin keeps them + pricing", () => {
    const svc = require("../src/services/serviceCatalogService");
    const schema = {
      name: { en: "S" },
      quantity: { unit: "pages" },
      pricing: { currency: "JOD", amount: "10" },
      fields: [
        { key: "rush", type: "checkbox", label: { en: "R" }, priceModifier: "5" },
        { key: "lang", type: "select", label: { en: "L" }, options: [{ value: "en", label: { en: "E" }, priceModifier: "2" }] },
        { key: "rows", type: "repeater", label: { en: "Rows" }, fields: [{ key: "n", type: "number", label: { en: "N" }, priceModifier: "1" }] },
      ],
    };
    const row = { id: 1, service_code: "s", category_id: 1, price_mode: "fixed", current_version: 1, schema };
    const pub = JSON.stringify(svc.mapServiceRow(row));
    assert.ok(!pub.includes("priceModifier") && !pub.includes("pricing"), pub);
    const admin = svc.mapServiceRow(row, { includeAdmin: true });
    assert.equal(admin.pricing.amount, "10");
    assert.equal(admin.fields[0].priceModifier, "5");
    const snap = JSON.stringify(svc.mapSnapshotRow({ service_code: "s", service_version: 1, definition: { ...schema, priceMode: "fixed" }, field_values: {} }));
    assert.ok(!snap.includes("priceModifier") && !snap.includes("pricing"), snap);
  });
});
