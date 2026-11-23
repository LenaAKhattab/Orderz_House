/**
 * Smart Orders S2 — frontend contracts: catalog-driven forms (no hard-coded services), validation mirror,
 * payload shape, generic step numbering, five-language units, accessibility wiring.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildServiceFormPayload,
  fieldVisible,
  pickLocalized,
  serviceDraftFiles,
  validateServiceDraft,
} from "./components/orders/smart/catalogForm.js";
import { canRoleAccessPath } from "./constants/authRoutes.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const LOCALES = ["ar", "en", "de", "nl", "ro"];

const slides = {
  serviceCode: "presentation_design",
  version: 3,
  quantity: { unit: "slides", required: true, min: 1, max: 100 },
  fields: [
    { key: "kind", type: "select", required: true, options: [{ value: "academic", label: { ar: "أكاديمي", en: "Academic" } }] },
    { key: "charts", type: "checkbox" },
    { key: "chart_count", type: "number", min: 1, max: 9, showIf: { field: "charts", in: [true] } },
    { key: "ref", type: "url" },
    { key: "files", type: "file", max: 2 },
  ],
};

describe("catalog form helpers", () => {
  it("localized text falls back locale → en → ar", () => {
    assert.strictEqual(pickLocalized({ ar: "ع", en: "E" }, "de"), "E");
    assert.strictEqual(pickLocalized({ ar: "ع" }, "nl"), "ع");
  });
  it("validation mirrors server reasons and respects conditions", () => {
    assert.deepStrictEqual(validateServiceDraft(slides, { values: {}, quantity: "" }), { kind: "required", quantity: "required" });
    assert.strictEqual(validateServiceDraft(slides, { values: { kind: "academic", ref: "ftp://x" }, quantity: "3" }).ref, "invalid_url");
    assert.strictEqual(validateServiceDraft(slides, { values: { kind: "academic", charts: true, chart_count: "50" }, quantity: "3" }).chart_count, "above_max");
    assert.strictEqual(fieldVisible(slides.fields[2], { charts: false }), false);
  });
  it("payload sends only visible values, the exact version and file names", () => {
    const file = { name: "brief.pdf" };
    const draft = { serviceCode: "presentation_design", values: { kind: "academic", charts: false, chart_count: "5", files: [file] }, quantity: "12" };
    const p = buildServiceFormPayload(slides, draft);
    assert.strictEqual(p.version, 3);
    assert.strictEqual("chart_count" in p.values, false);
    assert.deepStrictEqual(p.values.files, ["brief.pdf"]);
    assert.deepStrictEqual(serviceDraftFiles(slides, draft), [file]);
  });
});

describe("catalog is server-driven", () => {
  it("no hard-coded service codes in the wizard / step components", () => {
    const src = read("components/orders/AdminInternalOrderWizard.jsx") + read("components/orders/smart/ServiceCatalogStep.jsx");
    for (const code of ["presentation_design", "logo_design", "excel_data", "website_development"]) {
      assert.ok(!src.includes(code), code);
    }
    assert.match(read("components/orders/smart/ServiceCatalogStep.jsx"), /adminServiceCatalogOrderOptionsRequest|publicServiceCatalogRequest/);
  });
  it("wizard step headings are numbered from the live step index (no hard-coded numbers)", () => {
    for (const loc of LOCALES) {
      const raw = read(`locales/${loc}/ordersAdmin.json`);
      assert.doesNotMatch(raw, /"heading[A-Za-z]*": "[0-9]\) /, loc);
    }
    assert.match(read("components/orders/AdminInternalOrderWizard.jsx"), /\$\{stepIdx \+ 1\}\) \$\{t\("ordersAdmin\.wizard\.files\.heading"\)\}/);
  });
  it("catalog admin routes are staff-only", () => {
    assert.strictEqual(canRoleAccessPath("/dashboard/super-admin/service-catalog", "client"), false);
    assert.strictEqual(canRoleAccessPath("/dashboard/admin/service-catalog", "freelancer"), false);
    assert.strictEqual(canRoleAccessPath("/dashboard/admin/service-catalog", "admin"), true);
  });
});

describe("accessibility wiring", () => {
  const form = read("components/orders/smart/DynamicServiceForm.jsx");
  it("labels, descriptions, invalid + required states", () => {
    for (const s of ["htmlFor={id}", "aria-describedby", "aria-invalid", "aria-required", 'role="alert"', "radiogroup"]) {
      assert.ok(form.includes(s), s);
    }
    assert.match(read("components/orders/smart/catalogForm.js"), /export function focusFirstDynamicError/);
  });
});

describe("five-language S2 strings", () => {
  const en = json("locales/en/smartOrders.json");
  for (const loc of LOCALES) {
    it(`${loc}: every quantity unit, field type and form error is translated`, () => {
      const m = json(`locales/${loc}/smartOrders.json`);
      for (const group of ["units", "fieldTypes", "priceModes"]) {
        assert.deepStrictEqual(Object.keys(m[group]).sort(), Object.keys(en[group]).sort(), `${loc}.${group}`);
      }
      assert.deepStrictEqual(Object.keys(m.form.errors).sort(), Object.keys(en.form.errors).sort());
      assert.ok(String(json(`locales/${loc}/dashboard.json`).nav.superAdmin.serviceCatalog || "").trim());
    });
  }
});
