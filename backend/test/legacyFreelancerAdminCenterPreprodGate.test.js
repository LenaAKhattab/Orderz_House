/**
 * Legacy Admin Center — package semantics + RBAC static/unit tests.
 * Run via: npm run test:legacy-freelancer-invite
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_admin_preprod_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-admin-preprod-test-secret16";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("migration 191 package semantics", () => {
  const sql = read("sql/migrations/191_legacy_admin_package_semantics.sql");

  it("is additive and relaxes check for admin dated entitlement without first order", () => {
    assert.match(sql, /191_legacy_admin_package_semantics/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS freelancer_subscriptions_check/);
    assert.match(sql, /ADD CONSTRAINT freelancer_subscriptions_check/);
    assert.match(sql, /source = 'admin'/);
    assert.match(sql, /payment_status = 'not_required'/);
    assert.match(sql, /has_first_order = FALSE/);
    assert.match(sql, /first_order_date IS NULL/);
    assert.match(sql, /legacy_freelancer_package_assignments/);
    assert.doesNotMatch(sql, /^\s*TRUNCATE\b/im);
    assert.doesNotMatch(sql, /^\s*DROP\s+TABLE\b/im);
  });

  it("does not edit 189/190 files", () => {
    const m189 = read("sql/migrations/189_legacy_freelancer_member_id.sql");
    const m190 = read("sql/migrations/190_legacy_freelancer_admin_center.sql");
    assert.ok(m189.includes("freelancer_member_id"));
    assert.ok(m190.includes("legacy_freelancer_package_assignments"));
    assert.doesNotMatch(m189, /191_legacy/);
    assert.doesNotMatch(m190, /freelancer_subscriptions_check/);
  });
});

describe("Legacy package assignment semantics (no fake first order)", () => {
  const invite = read("src/services/legacyFreelancerInviteService.js");
  const subs = read("src/services/subscriptionsService.js");
  const admin = read("src/services/legacyFreelancerAdminService.js");

  it("dated admin assign inserts has_first_order=FALSE and null first_order_date", () => {
    assert.match(invite, /VALUES \(\$1,\$2,\$3,\$4,\$5,FALSE,NULL,\$6,\$7,TRUE/);
    assert.match(invite, /LEGACY_ADMIN_ASSIGNMENT/);
    assert.match(invite, /legacy_freelancer_package_assignments/);
    assert.doesNotMatch(invite, /require\(["']stripe["']\)/i);
  });

  it("records real first order later without wiping admin entitlement dates", () => {
    assert.match(subs, /Admin\/company dated entitlement \(Case 3\)/);
    assert.match(subs, /SET has_first_order = TRUE/);
    assert.match(subs, /first_order_date = \$2/);
    assert.match(subs, /actual_start_date IS NOT NULL/);
    assert.match(subs, /expiry_date IS NOT NULL/);
  });

  it("admin package / bulk / money paths stay non-financial", () => {
    assert.doesNotMatch(admin, /require\(["']stripe["']\)/i);
    assert.doesNotMatch(admin, /markActivationFeePaidOffline/);
    assert.doesNotMatch(admin, /cash_wallet|work_token_ledger|stripe\.checkout/i);
    assert.match(admin, /LEGACY_BULK_ASSIGNMENT|bulkAssignPackage/);
    assert.match(admin, /addHistoricalMoney/);
    assert.match(admin, /legacy_freelancer_historical_money_received/);
  });

  it("subscriptions UI treats hasFirstOrder independently of actualStartDate", () => {
    const ui = read("../frontend/src/pages/dashboard/SuperAdminSubscriptionsList.jsx");
    assert.match(ui, /hasFirstOrder \|\| sub\?\.firstOrderDate/);
    assert.doesNotMatch(ui, /hasFirstOrder \|\| sub\?\.firstOrderDate \|\| sub\?\.actualStartDate/);
  });
});

describe("Legacy Admin Center RBAC", () => {
  const routes = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
  const perms = read("src/constants/dashboardPermissions.js");
  const fePerms = read("../frontend/src/constants/dashboardPermissions.js");
  const app = read("../frontend/src/App.jsx");
  const nav = read("../frontend/src/constants/superAdminNav.js");

  it("API guard is admin|super_admin + legacy_freelancers.manage", () => {
    assert.match(routes, /LEGACY_MANAGE_PERMISSION = "legacy_freelancers\.manage"/);
    assert.match(routes, /requireAnyRole\(\["admin", "super_admin"\]\)/);
    assert.match(routes, /requirePermission\(LEGACY_MANAGE_PERMISSION\)/);
    assert.doesNotMatch(routes, /requireSuperAdmin/);
  });

  it("permission is assignable to Admin accounts", () => {
    assert.match(perms, /legacy_freelancers\.manage/);
    assert.match(perms, /LEGACY_FREELANCERS_MANAGE/);
    assert.match(fePerms, /LEGACY_FREELANCERS_MANAGE_PERMISSION/);
    assert.match(fePerms, /legacy_freelancers\.manage/);
  });

  it("neutral UI route /dashboard/legacy-freelancers with backward redirect", () => {
    assert.match(app, /\/dashboard\/legacy-freelancers/);
    assert.match(app, /LEGACY_FREELANCERS_MANAGE_PERMISSION/);
    assert.match(app, /Navigate to="\/dashboard\/legacy-freelancers"/);
    assert.match(nav, /to: "\/dashboard\/legacy-freelancers"/);
    assert.match(nav, /permission: "legacy_freelancers\.manage"/);
  });

  it("sensitive endpoints share the same guard (list/detail/create/bulk/money/identity)", () => {
    for (const needle of [
      "/legacy-freelancers",
      "bulk-package",
      "historical-money",
      "identity/:side",
      "signed-documents",
      "package",
    ]) {
      assert.ok(routes.includes(needle), `missing route fragment ${needle}`);
    }
    assert.match(routes, /const guard = \[/);
    assert.match(routes, /const writeGuard = \[\.\.\.guard/);
  });
});
