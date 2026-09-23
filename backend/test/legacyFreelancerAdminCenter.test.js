/**
 * Legacy Freelancer Admin Center — static/unit tests (no DB).
 * Run: node --test test/legacyFreelancerAdminCenter.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_admin_center_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-admin-center-test-secret16";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("migration 190 admin center", () => {
  const sql = read("sql/migrations/190_legacy_freelancer_admin_center.sql");

  it("is additive and records schema_migrations", () => {
    assert.match(sql, /190_legacy_freelancer_admin_center/);
    assert.match(sql, /legacy_entry_method/);
    assert.match(sql, /must_change_password/);
    assert.match(sql, /legacy_freelancer_identity_documents/);
    assert.match(sql, /legacy_freelancer_document_types/);
    assert.match(sql, /CONTRACTOR_AGREEMENT/);
    assert.match(sql, /TRAINING_AGREEMENT/);
    assert.match(sql, /legacy_freelancer_historical_money_received/);
    assert.match(sql, /legacy_freelancer_package_assignments/);
    assert.match(sql, /legacy_freelancers\.manage/);
    assert.doesNotMatch(sql, /^\s*DROP\s+TABLE\b/im);
    assert.doesNotMatch(sql, /^\s*TRUNCATE\b/im);
  });

  it("does not mutate Campaign 2 / tokens", () => {
    assert.doesNotMatch(sql, /secure_token_hash/);
    assert.doesNotMatch(sql, /regenerate/);
  });

  it("does not edit migration 189 file contents requirement", () => {
    const m189 = read("sql/migrations/189_legacy_freelancer_member_id.sql");
    assert.match(m189, /freelancer_member_id/);
    assert.doesNotMatch(m189, /legacy_entry_method/);
  });
});

describe("admin service wiring", () => {
  const svc = read("src/services/legacyFreelancerAdminService.js");
  const routes = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
  const auth = read("src/services/authService.js");
  const rbac = read("src/middleware/rbacMiddleware.js");
  const invite = read("src/services/legacyFreelancerInviteService.js");

  it("exports manual create, package, bulk, money, identity", () => {
    assert.match(svc, /createManualLegacyFreelancer/);
    assert.match(svc, /assignPackage/);
    assert.match(svc, /bulkAssignPackage/);
    assert.match(svc, /addHistoricalMoney/);
    assert.match(svc, /must_change_password/);
    assert.match(svc, /ADMIN_MANUAL/);
    assert.match(svc, /bcrypt\.hash\(nationalId/);
    assert.doesNotMatch(svc, /require\(["']stripe["']\)/i);
    assert.doesNotMatch(svc, /markActivationFeePaidOffline/);
    assert.doesNotMatch(svc, /stripe\.checkout/i);
  });

  it("routes expose freelancers admin endpoints under legacy_freelancers.manage", () => {
    assert.match(routes, /legacy_freelancers\.manage/);
    assert.match(routes, /requireAnyRole\(\["admin", "super_admin"\]\)/);
    assert.match(routes, /requirePermission/);
    assert.doesNotMatch(routes, /requireSuperAdmin/);
    assert.match(routes, /\/legacy-freelancers/);
    assert.match(routes, /bulk-package/);
    assert.match(routes, /historical-money/);
    assert.match(routes, /legacy-document-types/);
    assert.match(routes, /document-requirements/);
  });

  it("package assignment keeps has_first_order false for dated entitlements", () => {
    assert.match(invite, /has_first_order/);
    assert.match(invite, /VALUES \(\$1,\$2,\$3,\$4,\$5,FALSE,NULL,\$6,\$7/);
    assert.doesNotMatch(invite, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,TRUE/);
  });

  it("auth exposes mustChangePassword and clears on password change", () => {
    assert.match(auth, /mustChangePassword/);
    assert.match(auth, /must_change_password/);
  });

  it("rbac blocks APIs when must_change_password except allowlist", () => {
    assert.match(rbac, /PASSWORD_CHANGE_ALLOWLIST/);
    assert.match(rbac, /mustChangePassword/);
    assert.match(rbac, /MUST_CHANGE_PASSWORD/);
    assert.ok(rbac.includes("auth") && rbac.includes("logout"));
    assert.ok(rbac.includes("profile") && rbac.includes("password"));
  });

  it("invite registration sets SHARED_INVITE and identity; ignores public signed docs", () => {
    assert.match(invite, /SHARED_INVITE/);
    assert.match(invite, /require_id_front|requireIdFront/);
    assert.match(invite, /idFront/);
    assert.match(invite, /Do NOT persist signed docs from public registration/);
    assert.match(invite, /documentRequirements:\s*\[\]/);
    assert.match(invite, /workFields|normalizeLegacyWorkFields/);
  });

  it("package assignment uses LEGACY_ADMIN_ASSIGNMENT and not Stripe", () => {
    assert.match(invite, /LEGACY_ADMIN_ASSIGNMENT|legacy_freelancer_package_assignments/);
    assert.match(svc, /LEGACY_ADMIN_ASSIGNMENT|LEGACY_BULK_ASSIGNMENT/);
  });
});

describe("frontend admin center tabs", () => {
  it("page uses tabs and freelancers panel", () => {
    const page = read("../frontend/src/pages/dashboard/SuperAdminLegacyFreelancerInvitesPage.jsx");
    assert.match(page, /الفريلانسرز القدامى|LegacyFreelancersPanel/);
    assert.match(page, /حملات الدعوة|LegacyCampaignsPanel/);
    assert.match(page, /الأوراق والعقود|LegacyDocumentsPanel/);
  });

  it("join page supports identity and work fields; no public signed-contract UI", () => {
    const join = read("../frontend/src/pages/LegacyFreelancerJoinPage.jsx");
    assert.match(join, /requireIdFront|idFront|الهوية/);
    assert.match(join, /مجال العمل/);
    assert.match(join, /content_writing|LEGACY_WORK_FIELDS/);
    assert.match(join, /رقم الهاتف \*/);
    assert.match(join, /\+9627XXXXXXXX/);
    assert.match(join, /FormData|multipart/i);
    assert.doesNotMatch(join, /عقد مقاولة/);
    assert.doesNotMatch(join, /عقد تدريب/);
    assert.doesNotMatch(join, /documentRequirements/);
    assert.doesNotMatch(join, /signedDocumentTypeIds/);
    assert.doesNotMatch(join, /countryCode|مفتاح الدولة|phoneCountryCode/);
  });

  it("AuthGuards redirect mustChangePassword users", () => {
    const guards = read("../frontend/src/components/auth/AuthGuards.jsx");
    assert.match(guards, /mustChangePassword/);
  });
});

describe("financial isolation constants", () => {
  it("historical money table comment and no wallet writes in admin service", () => {
    const sql = read("sql/migrations/190_legacy_freelancer_admin_center.sql");
    assert.match(sql, /Does NOT affect wallets/);
    const svc = read("src/services/legacyFreelancerAdminService.js");
    assert.doesNotMatch(svc, /work_token|bid_credit|stripe\.checkout/i);
  });
});
