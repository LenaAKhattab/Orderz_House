/**
 * Unit — Smart Orders S2 declarative service schema: definition normalisation + order value validation.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../src/services/serviceCatalogSchema");

const L = (en) => ({ ar: `ع ${en}`, en });
const base = {
  serviceCode: "presentation_qa",
  categoryId: 2,
  name: L("Presentation"),
  quantity: { unit: "slides", required: true, min: 1, max: 100 },
  fields: [
    { key: "kind", type: "select", label: L("Type"), required: true, options: [{ value: "academic", label: L("Academic") }, { value: "business", label: L("Business") }] },
    { key: "charts", type: "checkbox", label: L("Charts") },
    { key: "chart_count", type: "number", label: L("Charts count"), min: 1, max: 20, showIf: { field: "charts", equals: true } },
    { key: "formats", type: "multiselect", label: L("Formats"), required: true, min: 1, options: [{ value: "pptx", label: L("PPTX") }, { value: "pdf", label: L("PDF") }] },
    { key: "deadline", type: "date", label: L("Deadline") },
    { key: "ref", type: "url", label: L("Reference") },
    { key: "files", type: "file", label: L("Files"), max: 2 },
    { key: "notes", type: "textarea", label: L("Notes"), maxLength: 20 },
  ],
};
const { schema } = lib.normalizeServiceDefinition(base);

describe("normalizeServiceDefinition", () => {
  it("keeps the slide unit and allowlisted field types", () => {
    assert.equal(schema.quantity.unit, "slides");
    assert.deepEqual(schema.fields.map((f) => f.type), ["select", "checkbox", "number", "multiselect", "date", "url", "file", "textarea"]);
  });
  it("rejects unknown types / units / keys / duplicate option values / forward conditions", () => {
    const bad = [
      { ...base, quantity: { unit: "parsecs" } },
      { ...base, fields: [{ key: "x", type: "script", label: L("x") }] },
      { ...base, fields: [{ key: "__proto__", type: "text", label: L("x") }] },
      { ...base, fields: [{ key: "a", type: "select", label: L("a"), options: [{ value: "x", label: L("x") }, { value: "x", label: L("y") }] }] },
      { ...base, fields: [{ key: "a", type: "text", label: L("a"), showIf: { field: "b", equals: "x" } }, { key: "b", type: "text", label: L("b") }] },
      { ...base, fields: [{ key: "a", type: "text", label: { en: "only en" } }] },
      { ...base, serviceCode: "Bad Code" },
    ];
    for (const def of bad) assert.throws(() => lib.normalizeServiceDefinition(def), (e) => e.publicCode === "SERVICE_CATALOG_INVALID");
  });
  it("strips markup from labels", () => {
    const { schema: s } = lib.normalizeServiceDefinition({ ...base, name: { ar: "<b>ع</b>", en: "<script>x</script>Deck" } });
    assert.equal(s.name.en.includes("<"), false);
  });
});

describe("validateOrderForm", () => {
  const ok = { values: { kind: "academic", formats: ["pptx"], charts: true, chart_count: "3" }, quantity: "12" };
  it("accepts and normalises valid values", () => {
    const out = lib.validateOrderForm(schema, ok, {});
    assert.equal(out.quantity, "12");
    assert.equal(out.values.chart_count, 3);
  });
  it("rejects missing required, tampered option, unknown field, bounds, bad url/date, foreign file", () => {
    const cases = [
      [{ ...ok, values: { formats: ["pptx"] } }, "kind", "required"],
      [{ ...ok, values: { ...ok.values, kind: "hacked" } }, "kind", "invalid_option"],
      [{ ...ok, values: { ...ok.values, evil: "x" } }, "evil", "unknown_field"],
      [{ ...ok, values: { ...ok.values, chart_count: 99 } }, "chart_count", "above_max"],
      [{ ...ok, values: { ...ok.values, ref: "javascript:alert(1)" } }, "ref", "invalid_url"],
      [{ ...ok, values: { ...ok.values, deadline: "2026-02-31" } }, "deadline", "invalid_date"],
      [{ ...ok, values: { ...ok.values, files: ["not-uploaded.pdf"] } }, "files", "invalid_file"],
      [{ ...ok, values: { ...ok.values, notes: "x".repeat(21) } }, "notes", "too_long"],
      [{ ...ok, quantity: "" }, "quantity", "required"],
      [{ ...ok, quantity: "500" }, "quantity", "above_max"],
      [{ ...ok, quantityUnspecified: true, quantity: "" }, "quantity", "unspecified_not_allowed"],
    ];
    for (const [input, key, reason] of cases) {
      assert.throws(
        () => lib.validateOrderForm(schema, input, {}),
        (e) => e.publicCode === "SMART_ORDER_FORM_INVALID" && e.fieldErrors?.[key] === reason,
        `${key}:${reason}`,
      );
    }
  });
  it("hidden conditional fields are dropped, uploaded files are accepted by name", () => {
    const out = lib.validateOrderForm(schema, { ...ok, values: { ...ok.values, charts: false, chart_count: 5, files: ["a.pdf"] } }, { uploadedFileNames: ["a.pdf"] });
    assert.equal("chart_count" in out.values, false);
    assert.deepEqual(out.values.files, [{ name: "a.pdf" }]);
  });
  it("parseServiceFormInput rejects malformed JSON and bad codes", () => {
    assert.equal(lib.parseServiceFormInput(""), null);
    assert.throws(() => lib.parseServiceFormInput("{bad"), (e) => e.publicCode === "SMART_ORDER_FORM_INVALID");
    assert.throws(() => lib.parseServiceFormInput({ serviceCode: "../etc" }), (e) => e.publicCode === "SMART_ORDER_FORM_INVALID");
    assert.equal(lib.parseServiceFormInput({ serviceCode: "logo_design", version: 2 }).version, 2);
  });
  it("schemaUsesOnly hides services with unsupported types for a client", () => {
    assert.equal(lib.schemaUsesOnly(schema, ["select", "checkbox"]), false);
    assert.equal(lib.schemaUsesOnly(schema, lib.FIELD_TYPES), true);
  });
});
