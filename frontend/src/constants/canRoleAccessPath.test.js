/**
 * Login redirect guard — must mirror dashboard routes in App.jsx.
 * Run: npm test (from frontend/)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLE, canRoleAccessPath } from "./authRoutes.js";

describe("canRoleAccessPath", () => {
  it("allows non-dashboard paths", () => {
    assert.equal(canRoleAccessPath("/login", ROLE.CLIENT), true);
    assert.equal(canRoleAccessPath("/", ROLE.FREELANCER), true);
  });

  it("allows role home dashboards", () => {
    assert.equal(canRoleAccessPath("/dashboard/client", ROLE.CLIENT), true);
    assert.equal(canRoleAccessPath("/dashboard/freelancer", ROLE.FREELANCER), true);
    assert.equal(canRoleAccessPath("/dashboard/admin", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin", ROLE.SUPER_ADMIN), true);
  });

  it("allows freelancer on institution pool path", () => {
    assert.equal(canRoleAccessPath("/dashboard/freelancer/institution-orders", ROLE.FREELANCER), true);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/institution-orders", ROLE.CLIENT), false);
  });

  it("allows client and freelancer on shared orders browse path", () => {
    assert.equal(canRoleAccessPath("/dashboard/freelancer/orders", ROLE.CLIENT), true);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/orders", ROLE.FREELANCER), true);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/orders/42", ROLE.CLIENT), true);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/orders/42", ROLE.FREELANCER), true);
  });

  it("allows client on canonical marketplace alias path", () => {
    assert.equal(canRoleAccessPath("/dashboard/client/orders", ROLE.CLIENT), true);
    assert.equal(canRoleAccessPath("/dashboard/client/orders/42", ROLE.CLIENT), true);
    assert.equal(canRoleAccessPath("/dashboard/client/orders", ROLE.FREELANCER), false);
  });

  it("denies client on freelancer-only subpaths", () => {
    assert.equal(canRoleAccessPath("/dashboard/freelancer/my-orders", ROLE.CLIENT), false);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/my-orders/9", ROLE.CLIENT), false);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/settings", ROLE.CLIENT), false);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/financial-claims", ROLE.CLIENT), false);
  });

  it("allows nested admin and super-admin routes", () => {
    assert.equal(canRoleAccessPath("/dashboard/admin/orders/create", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/plans", ROLE.SUPER_ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/training-orders/settings", ROLE.SUPER_ADMIN), true);
  });

  it("allows admin role on delegated super-admin paths (page permission enforced separately)", () => {
    assert.equal(canRoleAccessPath("/dashboard/super-admin/admins", ROLE.ADMIN), true);
  });

  it("restricts Super Admin plans management to super_admin", () => {
    assert.equal(canRoleAccessPath("/dashboard/super-admin/plans", ROLE.SUPER_ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/plans", ROLE.ADMIN), false);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/plans", ROLE.FREELANCER), false);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/plans", ROLE.CLIENT), false);
  });

  it("denies cross-role dashboard access", () => {
    assert.equal(canRoleAccessPath("/dashboard/admin/orders", ROLE.FREELANCER), false);
    assert.equal(canRoleAccessPath("/dashboard/client/my-orders", ROLE.FREELANCER), false);
    assert.equal(canRoleAccessPath("/dashboard/freelancer", ROLE.CLIENT), false);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/plans", ROLE.CLIENT), false);
  });
});
