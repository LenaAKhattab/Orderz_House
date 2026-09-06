/**
 * Soft-delete / archive plans — code contract (no DB).
 * Run: node --test test/planSoftDeleteArchive.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("plan soft delete / archive", () => {
  it("softDeletePlan sets deleted_at and deactivates without hard DELETE", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/plansService.js"),
      "utf8",
    );
    assert.match(src, /async function softDeletePlan/);
    assert.match(src, /deleted_at = NOW\(\)/);
    assert.match(src, /is_active = FALSE/);
    assert.match(src, /is_visible = FALSE/);
    assert.doesNotMatch(src, /DELETE FROM plans/);
  });

  it("routes expose archive PATCH and soft DELETE for staff with plans permission", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/routes/adminPlansRoutes.js"),
      "utf8",
    );
    assert.match(routes, /\/plans\/:id\/archive/);
    assert.match(routes, /router\.delete\("\/plans\/:id"/);
    assert.match(routes, /plansController\.deletePlan/);
    assert.match(routes, /requireAnyRole\(\["admin", "super_admin"\]\)/);
    assert.match(routes, /PERMISSION_KEYS\.PLANS/);
  });

  it("delete controller returns Arabic success and plan payload", () => {
    const ctrl = fs.readFileSync(
      path.join(__dirname, "../src/controllers/plansController.js"),
      "utf8",
    );
    assert.match(ctrl, /تم تعطيل الباقة بنجاح/);
    assert.match(ctrl, /data: \{ plan \}/);
  });

  it("public catalog listing excludes soft-deleted / inactive plans", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/plansService.js"),
      "utf8",
    );
    assert.match(src, /deleted_at IS NULL/);
    assert.match(src, /is_active = TRUE/);
  });
});
