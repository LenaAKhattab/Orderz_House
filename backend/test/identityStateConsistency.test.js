/**
 * Identity state consistency — canonical resolver + eligibility independence.
 * Run: node --test test/identityStateConsistency.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/identity_state_consistency_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveCanonicalIdentityState,
  isManualIdentityApproved,
} = require("../src/services/freelancerIdentityGate");
const { isIdentityGateApproved } = require("../src/utils/adminEligibilityGates");
const { evaluateFreelancerTakeOrdersEligibility } = require("../src/services/subscriptionsService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("canonical identity resolver matrix", () => {
  it("CASE A — no KYC / no manual → NOT verified", () => {
    const s = resolveCanonicalIdentityState({});
    assert.equal(s.verified, false);
    assert.equal(s.status, "none");
    assert.equal(s.source, null);
    assert.equal(s.canSubmit, true);
    assert.equal(s.hasPlatformDocuments, false);
    assert.equal(isIdentityGateApproved({ platformStatus: s.platformStatus, manualStatus: s.manualStatus }), false);
  });

  it("CASE B — pending KYC → pending, not verified", () => {
    const s = resolveCanonicalIdentityState({
      platformRow: { status: "pending_review", id_front_file_key: "a", id_back_file_key: "b" },
    });
    assert.equal(s.verified, false);
    assert.equal(s.status, "pending_review");
    assert.equal(s.canSubmit, false);
    assert.equal(s.hasPlatformDocuments, true);
  });

  it("CASE C — rejected KYC → rejected/resubmit", () => {
    const s = resolveCanonicalIdentityState({
      platformRow: {
        status: "rejected",
        rejection_reason: "blurry",
        resubmission_count: 1,
      },
    });
    assert.equal(s.verified, false);
    assert.equal(s.status, "rejected");
    assert.equal(s.canResubmit, true);
    assert.equal(s.rejectionReason, "blurry");
  });

  it("CASE D — approved platform KYC → verified/platform", () => {
    const s = resolveCanonicalIdentityState({
      platformRow: {
        status: "approved",
        id_front_file_key: "f",
        id_back_file_key: "b",
        reviewed_at: "2026-01-01",
      },
    });
    assert.equal(s.verified, true);
    assert.equal(s.source, "platform");
    assert.equal(s.canSubmit, false);
    assert.equal(
      isIdentityGateApproved({ platformStatus: "approved", manualStatus: null }),
      true,
    );
  });

  it("CASE E — manual approved without platform files → verified/manual", () => {
    const s = resolveCanonicalIdentityState({
      manualRow: {
        status: "approved",
        verification_method: "whatsapp",
        verified_at: "2026-01-02",
        revoked_at: null,
      },
    });
    assert.equal(s.verified, true);
    assert.equal(s.source, "manual_admin");
    assert.equal(s.hasPlatformDocuments, false);
    assert.equal(s.verificationMethod, "whatsapp");
  });

  it("CASE F — manual revoked + no approved KYC → NOT verified", () => {
    const revoked = { status: "revoked", revoked_at: "2026-02-01" };
    assert.equal(isManualIdentityApproved(revoked), false);
    const s = resolveCanonicalIdentityState({ manualRow: revoked });
    assert.equal(s.verified, false);
    assert.equal(s.status, "none");
  });

  it("company_approved / membership alone never verify identity", () => {
    // Resolver ignores subscription fields entirely.
    const s = resolveCanonicalIdentityState({ platformRow: null, manualRow: null });
    assert.equal(s.verified, false);
    const packageOnly = evaluateFreelancerTakeOrdersEligibility({
      status: "assigned_not_started",
      activationStatus: "company_approved",
      paymentStatus: "not_required",
    });
    assert.equal(packageOnly.eligible, true);
    assert.equal(packageOnly.reason, "assigned_not_started");
  });
});

describe("activation API + take-orders identity wiring", () => {
  it("getFreelancerAccountActivationStatus exposes identity/accountApproval/membership", () => {
    const src = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(src, /identity:\s*\{/);
    assert.match(src, /accountApproval:\s*\{/);
    assert.match(src, /membership:\s*\{/);
    assert.match(src, /resolveCanonicalIdentityState/);
    assert.match(src, /countdownStarted/);
    // must not treat company_approved as identity verified for canSubmit
    assert.match(src, /canSubmit:\s*identity\.canSubmit/);
  });

  it("submit blocks on identity.verified not company_approved alone", () => {
    const src = read("src/services/freelancerAccountActivationKycService.js");
    const start = src.indexOf("async function submitFreelancerAccountActivationRequest");
    const end = src.indexOf("async function listActivationRequestsForAdmin", start);
    const block = src.slice(start, end);
    assert.match(block, /identity\.verified/);
    assert.doesNotMatch(
      block,
      /activation_status \|\| ""\)\.toLowerCase\(\) === "company_approved"/,
    );
  });

  it("canFreelancerTakeOrders enforces canonical identity gate", () => {
    const src = read("src/services/subscriptionsService.js");
    const start = src.indexOf("async function canFreelancerTakeOrders");
    const end = src.indexOf("function shouldRetainCurrentSubscription", start);
    const block = src.slice(start, end);
    assert.match(block, /getCanonicalIdentityState/);
    assert.match(block, /identity_not_verified/);
  });

  it("financial claims require identity + company approval", () => {
    const src = read("src/services/financialClaimsService.js");
    assert.match(src, /getCanonicalIdentityState/);
    assert.match(src, /identity\.verified/);
  });
});

describe("frontend + flutter no longer infer KYC from company approval", () => {
  it("web activate page uses identity.verified", () => {
    const page = read("../frontend/src/pages/dashboard/FreelancerActivateAccountPage.jsx");
    assert.match(page, /identity\?\.verified/);
    assert.match(page, /approvedManualTitle|approvedIdentityTitle/);
    assert.match(page, /membershipCountdownStarted|membershipWaitingFirstOrder/);
    assert.doesNotMatch(page, /const isApproved = Boolean\(status\?\.isCompanyApproved\)/);
  });

  it("arabic copy separates identity / account / membership", () => {
    const ar = read("../frontend/src/locales/ar/freelancerDashboard.json");
    assert.match(ar, /لم يتم توثيق الهوية بعد/);
    assert.match(ar, /تم التحقق من الهوية إدارياً/);
    assert.match(ar, /تبدأ مدة الاشتراك عند استلام أول طلب حقيقي/);
    assert.match(ar, /اشتراكك نشط ومدة الاشتراك جارية/);
    assert.doesNotMatch(ar, /تم توثيق هويتك وتفعيل حسابك/);
  });

  it("flutter uses isIdentityVerified not isCompanyApproved for success card", () => {
    const screen = read(
      "../mobile/orderzhouse_app/lib/features/freelancer/account_activation/presentation/account_activation_kyc_screen.dart",
    );
    assert.match(screen, /isIdentityVerified/);
    assert.doesNotMatch(screen, /if \(status\.isCompanyApproved\)/);
    const models = read(
      "../mobile/orderzhouse_app/lib/features/freelancer/account_activation/data/account_activation_kyc_models.dart",
    );
    assert.match(models, /isIdentityVerified/);
    assert.match(models, /AccountActivationIdentity/);
  });
});
