/**
 * Super Admin Users Control Center — architecture + safety unit tests.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/sa_users_control_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "superAdminUsersControlRoutes.js"),
  "utf8",
);
const serviceSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "superAdminUsersControlService.js"),
  "utf8",
);
const validatorsSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "validators", "superAdminUsersControlValidators.js"),
  "utf8",
);
const appSrc = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const migrationSrc = fs.readFileSync(
  path.join(__dirname, "..", "sql", "migrations", "186_super_admin_user_control_audit.sql"),
  "utf8",
);

describe("super admin users control — routes & permissions", () => {
  it("mounts under /api/super-admin and requires super admin", () => {
    assert.match(appSrc, /superAdminUsersControlRoutes/);
    assert.match(appSrc, /app\.use\("\/api\/super-admin",\s*superAdminUsersControlRoutes\)/);
    assert.match(routesSrc, /requireSuperAdmin/);
    assert.match(routesSrc, /requireAuth/);
    assert.doesNotMatch(routesSrc, /requireAnyRole\(\["admin"/);
  });

  it("registers list/detail and sensitive action routes", () => {
    assert.match(routesSrc, /router\.get\("\/users"/);
    assert.match(routesSrc, /router\.get\("\/users\/:userId"/);
    assert.match(routesSrc, /\/users\/:userId\/account/);
    assert.match(routesSrc, /\/users\/:userId\/identity/);
    assert.match(routesSrc, /\/users\/:userId\/membership/);
    assert.match(routesSrc, /\/users\/:userId\/training/);
    assert.match(routesSrc, /\/users\/bulk-actions/);
  });
});

describe("super admin users control — validators require reason", () => {
  it("requires reason for account/identity/membership/training/bulk", () => {
    assert.match(validatorsSrc, /reasonBody/);
    assert.match(validatorsSrc, /patchAccountValidators/);
    assert.match(validatorsSrc, /patchIdentityValidators/);
    assert.match(validatorsSrc, /patchMembershipValidators/);
    assert.match(validatorsSrc, /patchTrainingValidators/);
    assert.match(validatorsSrc, /bulkActionsValidators/);
    assert.match(validatorsSrc, /isLength\(\{\s*min:\s*3/);
  });

  it("forbids password on account patch validator", () => {
    assert.match(validatorsSrc, /password[\s\S]*not\(\)\.exists/);
  });
});

describe("super admin users control — safety architecture", () => {
  it("does not expose password_hash or stripe secrets in service source contracts", () => {
    assert.match(serviceSrc, /password_hash|SENSITIVE|stripSecrets|never exposes/i);
    assert.match(serviceSrc, /stripe_customer_id/);
    assert.match(serviceSrc, /protectedPath/);
    assert.doesNotMatch(serviceSrc, /SELECT\s+\*\s+FROM\s+users\s+WHERE\s+id\s*=\s*\$1\s+LIMIT\s+1[\s\S]{0,200}password_hash/);
  });

  it("audits sensitive actions and requires reason helper", () => {
    assert.match(serviceSrc, /writeAudit/);
    assert.match(serviceSrc, /super_admin_user_control_audit_logs/);
    assert.match(serviceSrc, /requireReason/);
    assert.match(serviceSrc, /REASON_REQUIRED/);
    assert.match(serviceSrc, /LAST_SUPER_ADMIN/);
    assert.match(serviceSrc, /CANNOT_DEMOTE_SELF/);
  });

  it("does not invent Stripe payments from membership patch", () => {
    assert.match(serviceSrc, /assignPlanToFreelancer/);
    assert.doesNotMatch(serviceSrc, /stripe\.checkout\.sessions|createCheckoutSession/);
    assert.doesNotMatch(serviceSrc, /UPDATE\s+financial_/i);
    assert.doesNotMatch(serviceSrc, /wallet_balance|settlement_balance/i);
  });

  it("training overrides are marked as admin override", () => {
    assert.match(serviceSrc, /ADMIN_OVERRIDE/);
    assert.match(serviceSrc, /mark_course_completed|mark_final_test_passed/);
  });
});

describe("super admin users control — migration 186 additive", () => {
  it("creates audit table without destructive ops", () => {
    assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS super_admin_user_control_audit_logs/);
    assert.match(migrationSrc, /186_super_admin_user_control_audit/);
    assert.doesNotMatch(migrationSrc, /DROP TABLE/);
    assert.doesNotMatch(migrationSrc, /DELETE FROM users/i);
  });
});

describe("super admin users control — requireReason unit", () => {
  it("rejects short reason and accepts valid reason", () => {
    const { requireReason } = require("../src/services/superAdminUsersControlService");
    assert.throws(() => requireReason("ab"), /سبب|REASON|3/i);
    assert.equal(requireReason("سبب كافٍ للاختبار"), "سبب كافٍ للاختبار");
  });
});

describe("super admin users control — course helpers", () => {
  it("detects pending final tests and completed status", () => {
    const {
      aggregateCoursesForAdmin,
      isCourseFinalTestPending,
    } = require("../src/utils/superAdminUsersCourseHelpers");
    const pending = {
      isTestingEnabled: true,
      courseCompletedAt: null,
      progress: { completedLessons: 5, totalLessons: 5 },
    };
    assert.equal(isCourseFinalTestPending(pending), true);
    const agg = aggregateCoursesForAdmin([pending]);
    assert.equal(agg.pendingFinalTest, 1);
    assert.equal(agg.status, "pending_final_test");
  });
});
