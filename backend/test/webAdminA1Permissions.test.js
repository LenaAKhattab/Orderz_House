/**
 * Phase Web-Admin-A1 — Admin action endpoints allow admin + super_admin.
 * Static contract tests (no Production DB / migrations / payments).
 *
 * Run: node --test test/webAdminA1Permissions.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/web_admin_a1_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Web-Admin-A1 — backend action guards", () => {
  it("KYC activation review uses requireAdmin (admin + super_admin)", () => {
    const sa = read("src/routes/superAdminFreelancerAccountActivationKycRoutes.js");
    assert.match(sa, /requireAdmin/);
    assert.doesNotMatch(sa, /requireSuperAdmin/);
    assert.match(sa, /freelancer-activation-requests/);
    assert.match(sa, /\/approve/);
    assert.match(sa, /\/reject/);
  });

  it("feedback inbox actions use requireAdmin; topic CRUD stays super_admin", () => {
    const fb = read("src/routes/superAdminFeedbackRoutes.js");
    assert.match(fb, /actionGuard = \[requireAuth, requireAdmin\]/);
    assert.match(fb, /configGuard = \[requireAuth, requireSuperAdmin\]/);
    assert.match(fb, /router\.get\(\s*"\/feedback"/);
    assert.match(fb, /router\.patch\(\s*"\/feedback\/:id"/);
  });

  it("marketplace articles + application review allow admin; Bildazo retry stays SA", () => {
    const articles = read("src/routes/superAdminMarketplaceArticlesRoutes.js");
    assert.match(articles, /requireAdmin/);
    assert.doesNotMatch(articles, /requireSuperAdmin/);

    const apps = read("src/routes/superAdminMarketplaceArticleApplicationsRoutes.js");
    assert.match(apps, /guard = \[requireAuth, requireAdmin\]/);
    assert.match(apps, /bildazoGuard = \[requireAuth, requireSuperAdmin\]/);
  });

  it("pantry admin review uses requireAdmin without pantry permission gate", () => {
    const pantry = read("src/routes/pantryRoutes.js");
    assert.match(pantry, /pantryAdminGuard = \[requireAuth, requireAdmin\]/);
    assert.doesNotMatch(pantry, /PERMISSION_KEYS\.PANTRY/);
  });

  it("requireAdmin is admin + super_admin only", () => {
    const rbac = read("src/middleware/rbacMiddleware.js");
    assert.match(rbac, /function requireAdmin[\s\S]*requireAnyRole\(\["admin", "super_admin"\]\)/);
  });

  it("subscription action routes are role-gated for admin (A1)", () => {
    const routes = read("src/routes/adminSubscriptionsRoutes.js");
    assert.match(routes, /\/subscriptions\/activation-queue[\s\S]*?requireAdmin/);
    assert.match(routes, /\/subscriptions\/assignable-plans[\s\S]*?requireAdmin/);
    assert.match(routes, /\/subscriptions\/assign[\s\S]*?requireAdmin/);
    assert.match(routes, /\/subscriptions\/:id\/company-activate[\s\S]*?requireAdmin/);
    assert.match(routes, /notification-email[\s\S]*?requireSuperAdmin/);
    assert.match(routes, /activation-fee-settings[\s\S]*?requireSuperAdmin/);
  });

  it("freelancer activation campaign/fund routes remain super_admin-only", () => {
    const act = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(act, /requireSuperAdmin/);
    assert.doesNotMatch(act, /requireAdmin\b/);
  });

  it("action-center summary is requireAdmin and mounted under /api/admin", () => {
    const routes = read("src/routes/adminActionCenterRoutes.js");
    assert.match(routes, /requireAuth/);
    assert.match(routes, /requireAdmin/);
    assert.match(routes, /\/action-center\/summary/);
    assert.doesNotMatch(routes, /requireSuperAdmin/);

    const app = read("src/app.js");
    assert.match(app, /adminActionCenterRoutes/);
    assert.match(app, /app\.use\("\/api\/admin", adminActionCenterRoutes\)/);

    const service = read("src/services/adminActionCenterSummaryService.js");
    assert.match(service, /identityPendingCount/);
    assert.match(service, /paidActivationPendingCount/);
    assert.match(service, /Legacy field|legacy only|Web-Admin-A2/i);
    assert.match(service, /paidActivationPendingCount:\s*0/);
    assert.match(service, /packageAssignmentCount/);
    assert.match(service, /pantryPendingCount/);
    assert.match(service, /articlesPendingCount/);
    assert.match(service, /feedbackPendingCount/);
    assert.match(service, /unreadNotificationsCount/);
    assert.match(service, /partialErrors/);
    assert.match(service, /PER_COUNT_TIMEOUT_MS/);
    assert.match(service, /COUNT_STATEMENT_TIMEOUT_MS/);
    assert.match(service, /withDbStatementTimeout/);
    assert.match(service, /set_config\('statement_timeout'/);
    assert.match(service, /safeCount/);
    assert.match(service, /countPendingReviewRequestsForAdmin/);
    assert.doesNotMatch(service, /listActivationRequestsForAdmin/);
    assert.doesNotMatch(service, /safeCount\("paidActivationPendingCount"/);

    const controller = read("src/controllers/adminActionCenterController.js");
    assert.match(controller, /status\(200\)/);
    assert.match(controller, /buildEmptySummary/);

    const kyc = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(kyc, /async function countPendingReviewRequestsForAdmin/);
    assert.match(kyc, /WHERE status = \$1/);
    assert.match(kyc, /pending_review/);
    assert.match(kyc, /COUNT\(\*\)/);
  });
});
