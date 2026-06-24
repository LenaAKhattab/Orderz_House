/**
 * Template → fake_orders pool conversion helpers and script guards.
 * Run: node --test test/convertFakeOrderTemplates.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/convert_templates_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scriptSrc = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "convertFakeOrderTemplatesToFakeOrders.js"),
  "utf8",
);
const serviceSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
  "utf8",
);
const migrationSrc = fs.readFileSync(
  path.join(__dirname, "..", "sql", "migrations", "094_fake_order_template_conversions.sql"),
  "utf8",
);

const {
  buildFakeOrderRowFromTemplateForPoolConversion,
  resolveFakeOrderDbBudgetColumns,
} = require("../src/services/fakeOrdersService");

const { resolveDestructiveScriptMode } = require("../scripts/lib/destructiveScriptSafety");

const baseTemplate = {
  id: 101,
  title: "تصميم شعار احترافي",
  description: "مطلوب تصميم شعار وهوية بصرية بسيطة لمتجر إلكتروني ناشئ.",
  category_id: 1,
  subcategory_id: null,
  sub_subcategory_id: null,
  min_budget: 80,
  max_budget: 120,
  min_duration: 3,
  max_duration: 7,
  duration_unit: "days",
  created_by: 1,
};

describe("convertFakeOrderTemplates migration", () => {
  it("defines conversion tracking table and template_converted source_type", () => {
    assert.match(migrationSrc, /fake_order_template_conversions/);
    assert.match(migrationSrc, /template_converted/);
  });
});

describe("convertFakeOrderTemplates script guards", () => {
  it("defaults to dry-run without execute flags", () => {
    const m = resolveDestructiveScriptMode({
      scriptName: "convertFakeOrderTemplatesToFakeOrders.js",
      specificExecuteVar: "CONVERT_TEMPLATES_EXECUTE",
      confirmVar: "CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS",
      executeCommandExample: "EXECUTE=true CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS=true node scripts/convertFakeOrderTemplatesToFakeOrders.js",
      env: {},
    });
    assert.equal(m.dryRun, true);
    assert.equal(m.execute, false);
  });

  it("requires EXECUTE and CONFIRM for writes", () => {
    const m = resolveDestructiveScriptMode({
      scriptName: "convertFakeOrderTemplatesToFakeOrders.js",
      specificExecuteVar: "CONVERT_TEMPLATES_EXECUTE",
      confirmVar: "CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS",
      executeCommandExample: "x",
      env: { EXECUTE: "true", CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS: "true" },
    });
    assert.equal(m.execute, true);
    assert.equal(m.dryRun, false);
  });

  it("script uses batch transactions and conversion tracking", () => {
    assert.match(scriptSrc, /fake_order_template_conversions/);
    assert.match(scriptSrc, /CONFIRM_DELETE_TEMPLATES_AFTER_CONVERSION/);
    assert.match(scriptSrc, /CONFIRM_PRODUCTION_TEMPLATE_CONVERSION/);
    assert.match(scriptSrc, /insertConvertedTemplateAsFakeOrder/);
    assert.doesNotMatch(scriptSrc, /generateTrainingRoundInternal/);
    assert.doesNotMatch(scriptSrc, /fake_order_round_items.*INSERT/i);
  });

  it("delete step only removes templates with conversion records", () => {
    assert.match(scriptSrc, /DELETE FROM fake_order_templates t[\s\S]*fake_order_template_conversions/);
    assert.match(scriptSrc, /fo\.template_id = t\.id/);
  });
});

describe("buildFakeOrderRowFromTemplateForPoolConversion", () => {
  it("maps bidding template with bid range and null template_id intent", () => {
    const out = buildFakeOrderRowFromTemplateForPoolConversion(baseTemplate);
    assert.equal(out.ok, true);
    assert.equal(out.row.sourceType, "template_converted");
    assert.equal(out.row.projectType, "bidding");
    assert.equal(out.row.budget, null);
    assert.ok(out.row.bidBudgetMin > 0);
    assert.ok(out.row.bidBudgetMax >= out.row.bidBudgetMin);
    assert.equal(out.row.currencyCode, "JOD");
    assert.ok(out.row.durationValue >= 3);
  });

  it("maps fixed template when min_budget equals max_budget", () => {
    const out = buildFakeOrderRowFromTemplateForPoolConversion({
      ...baseTemplate,
      min_budget: 100,
      max_budget: 100,
    });
    assert.equal(out.ok, true);
    assert.equal(out.row.projectType, "fixed");
    assert.ok(out.row.budget > 0);
    assert.equal(out.row.bidBudgetMin, null);
    assert.equal(out.row.bidBudgetMax, null);
  });

  it("rejects invalid title/description", () => {
    const out = buildFakeOrderRowFromTemplateForPoolConversion({ ...baseTemplate, title: "x" });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "invalid_title_description");
  });

  it("insertConvertedTemplateAsFakeOrder records conversion and uses template_id NULL", () => {
    assert.match(serviceSrc, /INSERT INTO fake_order_template_conversions/);
    assert.match(serviceSrc, /sourceType: "template_converted"/);
    assert.match(serviceSrc, /NULL,\s*\n\s*'active', TRUE, NULL/);
  });

  it("resolveFakeOrderDbBudgetColumns enforces fixed vs bidding columns", () => {
    const fixed = resolveFakeOrderDbBudgetColumns({ projectType: "fixed", budget: 99, bidMin: 1, bidMax: 2 });
    assert.equal(fixed.budget, 99);
    assert.equal(fixed.bidBudgetMin, null);
    const bidding = resolveFakeOrderDbBudgetColumns({ projectType: "bidding", bidMin: 50, bidMax: 100, budget: 99 });
    assert.equal(bidding.budget, null);
    assert.equal(bidding.bidBudgetMin, 50);
  });
});

describe("no-new-templates enforcement", () => {
  const migration095 = fs.readFileSync(
    path.join(__dirname, "..", "sql", "migrations", "095_block_fake_order_templates_writes.sql"),
    "utf8",
  );
  const controllerSrc = fs.readFileSync(
    path.join(__dirname, "..", "src", "controllers", "adminFakeOrdersController.js"),
    "utf8",
  );

  it("DB migration blocks fake_order_templates insert/update", () => {
    assert.match(migration095, /block_fake_order_templates_write/);
    assert.match(migration095, /BEFORE INSERT ON fake_order_templates/);
    assert.match(migration095, /BEFORE UPDATE ON fake_order_templates/);
  });

  it("health check uses fake_orders pool when templates table is empty", () => {
    assert.match(serviceSrc, /poolRows\[0\]\?\.c/);
    assert.match(serviceSrc, /no_active_templates/);
  });

  it("template POST returns 410 Gone", () => {
    assert.match(controllerSrc, /res\.status\(410\)/);
  });
});
