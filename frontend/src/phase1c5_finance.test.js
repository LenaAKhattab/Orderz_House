/**
 * Phase 1C.5 — finance, claims, subscriptions, financial-user contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Phase 1C.5 finance routes", () => {
  it("financial-user redirect and my-bonuses are financial_user only", () => {
    const app = read("App.jsx");
    assert.match(
      app,
      /path="\/dashboard\/financial-user"[\s\S]{0,120}Navigate to="\/dashboard\/my-bonuses"/,
    );
    assert.equal(canRoleAccessPath("/dashboard/my-bonuses", ROLE.FINANCIAL_USER), true);
    assert.equal(canRoleAccessPath("/dashboard/my-bonuses", ROLE.CLIENT), false);
    assert.equal(canRoleAccessPath("/dashboard/my-bonuses", ROLE.FREELANCER), false);
    assert.equal(canRoleAccessPath("/dashboard/my-bonuses", ROLE.ADMIN), false);
  });

  it("client and freelancer cannot open admin finance pages", () => {
    const paths = [
      "/dashboard/super-admin/financial-center",
      "/dashboard/super-admin/financial-center/employees/1",
      "/dashboard/super-admin/financial-claims",
      "/dashboard/super-admin/subscriptions",
      "/dashboard/super-admin/subscriptions/activation",
      "/dashboard/admin/subscriptions",
    ];
    for (const p of paths) {
      assert.equal(canRoleAccessPath(p, ROLE.CLIENT), false, p);
      assert.equal(canRoleAccessPath(p, ROLE.FREELANCER), false, p);
    }
  });

  it("admin subscription activation remains staff-accessible; financial center is staff+permission at path level", () => {
    assert.equal(canRoleAccessPath("/dashboard/admin/subscriptions", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/admin/subscriptions", ROLE.CLIENT), false);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/subscriptions/activation", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/financial-center", ROLE.SUPER_ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/financial-center", ROLE.ADMIN), true);
  });

  it("admin financial claims amounts are official JOD without FX checkout", () => {
    const src = read("pages/dashboard/SuperAdminFinancialClaimsPage.jsx");
    assert.match(src, /د\.أ/);
    assert.doesNotMatch(src, /startCheckout|JodMoneyDisplay/);
    assert.match(src, /if \(actionBusy \|\| !statusModal\.claim/);
    assert.match(src, /statusModal\.status === "rejected"/);
  });

  it("financial center ledger formatter is JOD د.أ not approximate FX", () => {
    const src = read("pages/dashboard/financialCenter/financialCenterDisplayUtils.jsx");
    assert.match(src, /currency = "د\.أ"/);
    assert.doesNotMatch(src, /formatApproximateCurrency|startCheckout/);
  });

  it("approximate currency remains display-only on JodMoneyDisplay", () => {
    const src = read("components/money/JodMoneyDisplay.jsx");
    assert.match(src, /display-only/);
    assert.doesNotMatch(src, /startCheckout/);
  });

  it("activation activate is guarded against duplicate clicks", () => {
    const src = read("pages/dashboard/AdminSubscriptionsActivationPage.jsx");
    assert.match(src, /if \(submittingId\) return/);
    assert.match(src, /listAssignablePlansAdminRequest/);
    assert.doesNotMatch(src, /training.package|TRAINING_PACKAGES|startCheckout/i);
  });

  it("training packages page is not used as subscription activation catalog", () => {
    const activation = read("pages/dashboard/AdminSubscriptionsActivationPage.jsx");
    const subs = read("pages/dashboard/SuperAdminSubscriptionsPage.jsx");
    assert.doesNotMatch(activation, /SuperAdminTrainingPackagesPage|training_packages/);
    assert.doesNotMatch(subs, /SuperAdminTrainingPackagesPage|training_packages/);
  });

  it("freelancer claims page has no admin approve/reject", () => {
    const src = read("pages/dashboard/FreelancerFinancialClaimsPage.jsx");
    assert.doesNotMatch(src, /updateSuperAdminFinancialClaimStatusRequest/);
    assert.doesNotMatch(src, /createSuperAdminFreelancerPaymentRequest/);
  });

  it("client financial page has no admin claim actions", () => {
    const src = read("pages/dashboard/ClientFinancialPage.jsx");
    assert.doesNotMatch(src, /updateSuperAdminFinancialClaimStatusRequest|financial-center/);
  });
});
