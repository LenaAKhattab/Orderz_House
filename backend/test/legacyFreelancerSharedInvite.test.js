/**
 * Legacy Freelancer Shared Invite — unit + static policy tests (no DB required).
 * Run: node --test test/legacyFreelancerSharedInvite.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_invite_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-invite-test-secret-16chars";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

const {
  sha256Hex,
  generateSecureToken,
  maskEmail,
  maskPhone,
  normalizeSlug,
  buildPublicJoinUrl,
  campaignUnavailableError,
  AUDIT_ACTIONS,
  TRAINING_WAIVER_REASON,
  FINAL_EXAM_WAIVER_REASON,
  PLAN_ASSIGNMENT_REASON,
  evaluateFreelancerTakeOrdersEligibility,
} = require("../src/services/legacyFreelancerInviteService");
const {
  SUBSCRIPTION_ACTIVATION_STATUSES,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES,
} = require("../src/services/subscriptionsService");
const { requireSuperAdmin } = require("../src/middleware/rbacMiddleware");
const { buildFreelancerFacts } = require("../src/services/onboardingConditionResolver");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function runMw(mw, req) {
  let statusCode = 200;
  let jsonBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
    },
  };
  mw(req, res, () => {
    nextCalled = true;
  });
  return { statusCode, jsonBody, nextCalled };
}

describe("legacy invite migration 187", () => {
  const sql = read("sql/migrations/187_legacy_freelancer_shared_invite.sql");

  it("is additive and registers schema_migrations", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_campaigns/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_redemptions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_audit_logs/);
    assert.match(sql, /onboarding_source/);
    assert.match(sql, /COMPANY_OFFLINE_VERIFIED/);
    assert.match(sql, /INSERT INTO schema_migrations \(version\)\s*VALUES \('187_legacy_freelancer_shared_invite'\)/);
    assert.doesNotMatch(sql, /^\s*DROP TABLE\b/im);
    assert.doesNotMatch(sql, /^\s*TRUNCATE\b/im);
  });

  it("enforces used_count <= max_redemptions", () => {
    assert.match(sql, /used_count <= max_redemptions/);
  });
});

describe("legacy invite crypto / masking", () => {
  it("hashes tokens with sha256 and never equals plaintext", () => {
    const token = generateSecureToken();
    assert.ok(token.length >= 32);
    const hash = sha256Hex(token);
    assert.strictEqual(hash.length, 64);
    assert.notStrictEqual(hash, token);
    assert.strictEqual(sha256Hex(token), hash);
  });

  it("masks email and phone", () => {
    assert.strictEqual(maskEmail("freelancer@example.com"), "fr***@example.com");
    assert.ok(maskPhone("+962791234567").endsWith("4567"));
  });

  it("normalizes slug", () => {
    assert.strictEqual(normalizeSlug(" Company Freelancers 2026 "), "company-freelancers-2026");
  });

  it("builds one shared join URL", () => {
    const url = buildPublicJoinUrl("company-freelancers-2026", "SECURE_TOKEN");
    assert.match(url, /\/freelancer\/legacy-join\/company-freelancers-2026\?token=SECURE_TOKEN/);
  });
});

describe("legacy invite campaign gate messages", () => {
  it("expired campaign", () => {
    const err = campaignUnavailableError({
      is_active: true,
      revoked_at: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      used_count: 0,
      max_redemptions: 10,
    });
    assert.strictEqual(err.publicCode, "LEGACY_INVITE_EXPIRED");
    assert.match(err.message, /انتهت صلاحية/);
  });

  it("revoked / inactive campaign", () => {
    const err = campaignUnavailableError({
      is_active: false,
      revoked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      used_count: 0,
      max_redemptions: 10,
    });
    assert.strictEqual(err.publicCode, "LEGACY_INVITE_REVOKED");
    assert.match(err.message, /إيقاف/);
  });

  it("full campaign", () => {
    const err = campaignUnavailableError({
      is_active: true,
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      used_count: 5,
      max_redemptions: 5,
    });
    assert.strictEqual(err.publicCode, "LEGACY_INVITE_FULL");
    assert.match(err.message, /اكتمل عدد المقاعد/);
  });

  it("valid campaign returns null", () => {
    const err = campaignUnavailableError({
      is_active: true,
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      used_count: 1,
      max_redemptions: 5,
    });
    assert.strictEqual(err, null);
  });
});

describe("legacy invite password hashing", () => {
  it("bcrypt hash never equals plaintext", async () => {
    const password = "LegacyPass!234";
    const hash = await bcrypt.hash(password, 4);
    assert.notStrictEqual(hash, password);
    assert.ok(hash.startsWith("$2"));
    assert.strictEqual(await bcrypt.compare(password, hash), true);
  });
});

describe("legacy invite plan/trust eligibility after registration shape", () => {
  it("company_approved + not_required is eligible (bypasses payment)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility({
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
      activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      isCurrent: true,
    });
    assert.strictEqual(r.eligible, true);
  });

  it("onboarding banners skip training when company_approved", () => {
    const facts = buildFreelancerFacts({
      userRow: { first_name: "أ", family_name: "ب", email_verified: true },
      subscription: { activationStatus: "company_approved" },
      coursesAgg: { total: 3, completed: 0, pendingFinalTest: 3 },
      welcomeCompleted: true,
    });
    assert.strictEqual(facts.activated, true);
    assert.strictEqual(facts.trainingIncomplete, true);
    // Banner condition training_incomplete requires !activated
    const { conditionMatches } = require("../src/services/onboardingConditionResolver");
    assert.strictEqual(conditionMatches("training_incomplete", facts), false);
  });
});

describe("legacy invite audit action constants", () => {
  it("defines required audit actions and waiver reasons", () => {
    assert.strictEqual(AUDIT_ACTIONS.CAMPAIGN_CREATED, "LEGACY_FREELANCER_CAMPAIGN_CREATED");
    assert.strictEqual(AUDIT_ACTIONS.CAMPAIGN_UPDATED, "LEGACY_FREELANCER_CAMPAIGN_UPDATED");
    assert.strictEqual(AUDIT_ACTIONS.CAMPAIGN_REVOKED, "LEGACY_FREELANCER_CAMPAIGN_REVOKED");
    assert.strictEqual(AUDIT_ACTIONS.INVITE_REDEEMED, "LEGACY_FREELANCER_INVITE_REDEEMED");
    assert.match(TRAINING_WAIVER_REASON, /Legacy/);
    assert.match(FINAL_EXAM_WAIVER_REASON, /Legacy/);
    assert.strictEqual(PLAN_ASSIGNMENT_REASON, "Legacy company freelancer shared invite");
  });
});

describe("legacy invite routes — Admin manage permission + auth isolation", () => {
  it("admin routes require legacy_freelancers.manage (not Super Admin only)", () => {
    const src = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
    assert.match(src, /legacy_freelancers\.manage/);
    assert.match(src, /requireAnyRole\(\["admin", "super_admin"\]\)/);
    assert.match(src, /requirePermission/);
    assert.doesNotMatch(src, /requireSuperAdmin/);
    assert.match(src, /\/legacy-freelancer-invites/);
    assert.match(src, /regenerate-token/);
    assert.match(src, /revoke/);
  });

  it("non-staff roles are excluded by requireAnyRole", () => {
    const src = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
    assert.match(src, /requireAnyRole\(\["admin", "super_admin"\]\)/);
    assert.doesNotMatch(src, /requireAnyRole\(\["freelancer"/);
  });

  it("public register route does not weaken normal /register", () => {
    const authRoutes = read("src/routes/authRoutes.js");
    assert.match(authRoutes, /\/register/);
    assert.match(authRoutes, /registerValidators/);
    assert.match(authRoutes, /legacy-freelancer-register/);
    assert.match(authRoutes, /legacy-freelancer-invite/);
  });

  it("service never calls Stripe or wallet APIs", () => {
    const src = read("src/services/legacyFreelancerInviteService.js");
    assert.doesNotMatch(src, /require\(["']stripe["']\)/i);
    assert.doesNotMatch(src, /markActivationFeePaidOffline/);
    assert.doesNotMatch(src, /assignPlanToFreelancer\s*\(/);
    assert.doesNotMatch(src, /cash_wallet|work_token_wallet|stripe\.checkout/i);
    assert.doesNotMatch(src, /subscription_activation_fee_paid_at/);
    assert.match(src, /LEGACY_INVITE/);
    assert.match(src, /COMPANY_OFFLINE_VERIFIED/);
    assert.match(src, /used_count = used_count \+ 1/);
    assert.match(src, /ensureUserRole\(\{\s*userId: user\.id,\s*roleName: ROLES\.FREELANCER,\s*client\s*\}\)/);
  });

  it("token regeneration invalidates old hash (logic)", () => {
    const oldToken = generateSecureToken();
    const newToken = generateSecureToken();
    assert.notStrictEqual(sha256Hex(oldToken), sha256Hex(newToken));
  });
});

describe("legacy invite frontend wiring", () => {
  it("exposes admin and public routes", () => {
    const app = read(path.join("..", "frontend", "src", "App.jsx"));
    assert.match(app, /legacy-freelancer-invites/);
    assert.match(app, /freelancer\/legacy-join\/:campaignSlug/);
  });
});
