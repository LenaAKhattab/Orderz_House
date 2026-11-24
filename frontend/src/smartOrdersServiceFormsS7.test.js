/**
 * Smart Orders S7 — structured service forms on the web: repeater / conditional group / validationRegex parity with
 * the server (same error codes AND keys), payload shape, snapshot rendering, catalog editor payloads, 5 locales.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  buildServiceFormPayload,
  compileValidationRegex,
  matchesValidationRegex,
  validateServiceDraft,
} from "./components/orders/smart/catalogForm.js";
import {
  buildPricingPayload,
  fieldPayload,
  isCompilablePattern,
  isValidPriceModifier,
  pricingDraftFrom,
  validatePricing,
} from "./components/orders/smart/catalogEditorUtils.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const L = (en) => ({ ar: en, en });

/** Backend schema (read-only) for true parity checks; skipped if the backend tree is not present. */
let server = null;
try {
  server = createRequire(import.meta.url)(path.join(dir, "../../backend/src/services/serviceCatalogSchema.js"));
} catch {
  server = null;
}

const definition = {
  serviceCode: "research_pack",
  categoryId: 1,
  quantity: { unit: "documents" },
  name: L("Research pack"),
  fields: [
    { key: "code", type: "text", label: L("Course code"), validationRegex: "[A-Z]{2}[0-9]{3}", validationMessage: L("Use AB123") },
    {
      key: "refs",
      type: "repeater",
      label: L("References"),
      minItems: 1,
      maxItems: 3,
      fields: [
        { key: "title", type: "text", label: L("Title"), required: true },
        { key: "kind", type: "select", label: L("Kind"), options: [{ value: "book", label: L("Book") }, { value: "web", label: L("Web") }] },
        { key: "url", type: "url", label: L("Link"), required: true, showIf: { field: "kind", in: ["web"] } },
      ],
    },
    { key: "printed", type: "checkbox", label: L("Printed") },
    {
      key: "print",
      type: "conditional_group",
      label: L("Printing"),
      showIf: { field: "printed", in: [true] },
      fields: [
        { key: "size", type: "select", label: L("Size"), required: true, options: [{ value: "a4", label: L("A4") }, { value: "a3", label: L("A3") }] },
        { key: "copies", type: "number", label: L("Copies"), min: 1, max: 10 },
      ],
    },
  ],
};
const service = server ? server.normalizeServiceDefinition(definition).schema : definition;

/** Server error map (or {} when valid) for the same input. */
function serverErrors(values) {
  if (!server) return null;
  try {
    server.validateOrderForm(service, { values, quantity: null });
    return {};
  } catch (e) {
    return e.fieldErrors || { _: e.message };
  }
}
const clientErrors = (values) => validateServiceDraft(service, { values, quantity: "" });

const CASES = [
  ["valid minimal", { refs: [{ title: "Paper 1" }] }],
  ["repeater below min (minItems 1, not required)", {}],
  ["repeater above max", { refs: [{ title: "a" }, { title: "b" }, { title: "c" }, { title: "d" }] }],
  ["row required sub missing", { refs: [{ title: "ok" }, {}] }],
  ["row conditional sub shown → required", { refs: [{ title: "x", kind: "web" }] }],
  ["row conditional sub hidden → ignored", { refs: [{ title: "x", kind: "book" }] }],
  ["row invalid url", { refs: [{ title: "x", kind: "web", url: "ftp://x" }] }],
  ["group hidden → dropped (no errors)", { refs: [{ title: "x" }], printed: false, print: {} }],
  ["group visible → required sub enforced", { refs: [{ title: "x" }], printed: true }],
  ["group visible → bounds", { refs: [{ title: "x" }], printed: true, print: { size: "a4", copies: "50" } }],
  ["group visible valid", { refs: [{ title: "x" }], printed: true, print: { size: "a3", copies: "2" } }],
  ["regex mismatch", { refs: [{ title: "x" }], code: "ab123" }],
  ["regex anchored (no partial match)", { refs: [{ title: "x" }], code: "XAB123" }],
  ["regex match", { refs: [{ title: "x" }], code: "AB123" }],
];

describe("client validation mirrors the server (codes and keys)", () => {
  for (const [name, values] of CASES) {
    it(name, (t) => {
      const c = clientErrors(values);
      const s = serverErrors(values);
      if (s === null) return t.skip("backend schema not available");
      assert.deepStrictEqual(c, s);
    });
  }
  it("expected keys/codes (independent of the server)", () => {
    assert.deepStrictEqual(clientErrors({}), { refs: "below_min" });
    assert.deepStrictEqual(clientErrors({ refs: [{ title: "ok" }, {}] }), { "refs[1].title": "required" });
    assert.deepStrictEqual(clientErrors({ refs: [{ title: "x" }], printed: true }), { "print.size": "required" });
    assert.deepStrictEqual(clientErrors({ refs: [{ title: "x" }], code: "ab123" }), { code: "invalid_format" });
    assert.strictEqual(clientErrors({ refs: [1, 2, 3, 4].map(() => ({ title: "t" })) }).refs, "above_max");
  });
  it("optional repeater without minItems: required only when marked required", () => {
    const svc = { fields: [{ key: "items", type: "repeater", label: L("Items"), required: true, fields: [{ key: "n", type: "text", label: L("N") }] }] };
    assert.deepStrictEqual(validateServiceDraft(svc, { values: {} }), { items: "required" });
    assert.deepStrictEqual(validateServiceDraft({ fields: [{ ...svc.fields[0], required: false }] }, { values: {} }), {});
  });
});

describe("validationRegex", () => {
  it("anchors like the server: ^(?:pattern)$ with flag u", () => {
    const re = compileValidationRegex("a|b");
    assert.strictEqual(re.source, "^(?:a|b)$");
    assert.ok(re.unicode);
    assert.strictEqual(matchesValidationRegex({ validationRegex: "a|b" }, "ab"), false);
    assert.strictEqual(matchesValidationRegex({ validationRegex: "a|b" }, "b"), true);
  });
  it("an invalid pattern never blocks the customer", () => {
    assert.strictEqual(compileValidationRegex("([a-z"), null);
    assert.strictEqual(matchesValidationRegex({ validationRegex: "([a-z" }, "anything"), true);
  });
  it("form renderer prefers the field's localized validationMessage", () => {
    const src = read("components/orders/smart/DynamicServiceForm.jsx");
    assert.match(src, /errors\[key\] === "invalid_format" && field/);
    assert.match(src, /pickLocalized\(field\.validationMessage, locale\)/);
  });
});

describe("payload", () => {
  it("repeater rows + visible group sub-values only; hidden group dropped", () => {
    const draft = {
      serviceCode: "research_pack",
      values: { refs: [{ title: "P1", kind: "book", url: "https://x.io" }, { title: "P2" }], printed: true, print: { size: "a4", copies: "" } },
      quantity: "",
    };
    const p = buildServiceFormPayload(service, draft);
    assert.deepStrictEqual(p.values.refs, [{ title: "P1", kind: "book" }, { title: "P2" }]);
    assert.deepStrictEqual(p.values.print, { size: "a4" });
    const hidden = buildServiceFormPayload(service, { ...draft, values: { ...draft.values, printed: false } });
    assert.strictEqual(hidden.values.print, undefined);
    if (server) assert.doesNotThrow(() => server.validateOrderForm(service, { values: p.values, quantity: null }));
  });
});

describe("snapshot view", () => {
  it("renders repeater rows and group sub-values with snapshot labels", () => {
    const src = read("components/orders/smart/ServiceFormSnapshotView.jsx");
    assert.match(src, /f\.type === "repeater"/);
    assert.match(src, /f\.type === "conditional_group"/);
    assert.match(src, /pickLocalized\(sf\.label, locale\)/);
    assert.match(src, /snapshot-repeater-/);
  });
});

describe("catalog editor payloads", () => {
  it("fieldPayload: numbers, trimmed modifiers, sub-fields, regex only when set", () => {
    const out = fieldPayload({
      key: "refs",
      type: "repeater",
      label: L("R"),
      minItems: "1",
      maxItems: "5",
      fields: [{ key: "pages", type: "number", label: L("P"), min: "1", priceModifier: " 2.50 " }, { key: "t", type: "text", label: L("T"), validationRegex: "" }],
    });
    assert.strictEqual(out.minItems, 1);
    assert.strictEqual(out.maxItems, 5);
    assert.strictEqual(out.fields[0].min, 1);
    assert.strictEqual(out.fields[0].priceModifier, "2.50");
    assert.ok(!("validationRegex" in out.fields[1]));
    const opt = fieldPayload({ key: "k", type: "select", label: L("K"), options: [{ value: "a", label: L("A"), priceModifier: "" }] });
    assert.ok(!("priceModifier" in opt.options[0]));
    if (server) assert.doesNotThrow(() => server.normalizeServiceDefinition({ ...definition, fields: [out] }));
  });
  it("modifier / pattern hints", () => {
    assert.strictEqual(isValidPriceModifier("2.5"), true);
    assert.strictEqual(isValidPriceModifier("-1"), false);
    assert.strictEqual(isValidPriceModifier("1.234"), false);
    assert.strictEqual(isCompilablePattern("[A-Z]{2}"), true);
    assert.strictEqual(isCompilablePattern("([a-z"), false);
  });
  it("pricing per mode; omitted for manual_quote or when empty; amounts stay strings", () => {
    assert.strictEqual(buildPricingPayload("manual_quote", { currency: "JOD", amount: "5" }), undefined);
    assert.strictEqual(buildPricingPayload("fixed", pricingDraftFrom(null)), undefined);
    assert.deepStrictEqual(buildPricingPayload("fixed", { currency: "AED", amount: " 25.50 " }), { currency: "AED", amount: "25.50" });
    assert.deepStrictEqual(buildPricingPayload("per_unit", { currency: "JOD", unitAmount: "3" }), { currency: "JOD", unitAmount: "3" });
    assert.deepStrictEqual(validatePricing("range", { currency: "JOD", minAmount: "10", maxAmount: "9.99" }), { "pricing.maxAmount": "invalid" });
    assert.deepStrictEqual(validatePricing("range", { currency: "JOD", minAmount: "10", maxAmount: "10" }), {});
    const pk = { currency: "JOD", packages: [{ code: "basic", label: L("Basic"), amount: "10" }, { code: "Bad", label: L("X"), amount: "0" }] };
    assert.deepStrictEqual(validatePricing("package", pk), { "pricing.packages[1].code": "invalid", "pricing.packages[1].amount": "invalid" });
    if (server) {
      for (const [mode, d] of [
        ["fixed", { currency: "AED", amount: "25.50" }],
        ["per_unit", { currency: "JOD", unitAmount: "3", minAmount: "10" }],
        ["range", { currency: "JOD", minAmount: "10", maxAmount: "20" }],
        ["package", { currency: "JOD", packages: [{ code: "basic", label: L("Basic"), amount: "10" }] }],
      ]) {
        assert.deepStrictEqual(server.normalizePricing(mode, buildPricingPayload(mode, d)), buildPricingPayload(mode, d), mode);
      }
    }
  });
  it("editor surfaces the server's `unsafe` regex error and offers the new inputs", () => {
    const src = read("components/orders/smart/ServiceEditorModal.jsx");
    assert.match(src, /code === "unsafe" \? t\("smartOrders\.catalog\.editor\.regexUnsafe"\)/);
    assert.match(src, /\$\{path\}\.validationRegex/);
    assert.match(src, /options\[\$\{j\}\]\.priceModifier/);
    assert.match(src, /"repeater",\s*"conditional_group"/);
    assert.match(src, /<PricingEditor/);
    assert.strictEqual(json("locales/en/smartOrders.json").catalog.editor.regexUnsafe, "Pattern is invalid or unsafe");
  });
});

describe("five-language S7 strings", () => {
  for (const loc of ["ar", "en", "de", "nl", "ro"]) {
    it(loc, () => {
      const j = json(`locales/${loc}/smartOrders.json`);
      assert.ok(j.form.errors.invalid_format);
      for (const k of ["addRow", "removeRow", "rowLabel", "rowsRange", "rowsMax"]) assert.ok(j.form[k], k);
      assert.ok(j.fieldTypes.repeater && j.fieldTypes.conditional_group);
      for (const k of ["regexUnsafe", "validationRegex", "priceModifier", "subFields", "pricingHeading", "packages"]) assert.ok(j.catalog.editor[k], k);
    });
  }
});
