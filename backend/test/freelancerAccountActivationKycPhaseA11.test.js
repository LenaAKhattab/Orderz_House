/**
 * Phase A11 — Freelancer account activation KYC review.
 * Static + pure unit tests. Does not apply migrations / touch production.
 *
 * Run: node --test test/freelancerAccountActivationKycPhaseA11.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_kyc_a11_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ACCOUNT_ACTIVATION_KYC_ERROR_CODES,
  ACCOUNT_ACTIVATION_KYC_MAX_BYTES,
  ACCOUNT_ACTIVATION_KYC_ALLOWED_MIME,
  ACCOUNT_ACTIVATION_KYC_TERMS_VERSION,
} = require("../src/constants/freelancerAccountActivationKyc");
const service = require("../src/services/freelancerAccountActivationKycService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A11 — migration and isolation", () => {
  it("migration 176 creates private KYC request table", () => {
    const sql = read("sql/migrations/176_freelancer_account_activation_kyc_a11.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_account_activation_requests/);
    assert.match(sql, /pending_review/);
    assert.match(sql, /id_front_file_key/);
    assert.match(sql, /id_back_file_key/);
    assert.match(sql, /rejection_reason/);
    assert.match(sql, /faar_one_pending_per_freelancer_uidx/);
    assert.doesNotMatch(sql, /public_url|https?:\/\//i);
  });

  it("does not import Stripe / PayTabs / ordersService / Bid Credits / Pantry / Bildazo modules", () => {
    const svc = read("src/services/freelancerAccountActivationKycService.js");
    assert.doesNotMatch(svc, /require\(["'].*stripe/i);
    assert.doesNotMatch(svc, /require\(["'].*paytabs/i);
    assert.doesNotMatch(svc, /require\(["'].*ordersService/i);
    assert.doesNotMatch(svc, /require\(["'].*pantry/i);
    assert.doesNotMatch(svc, /require\(["'].*bildazo/i);
    assert.doesNotMatch(svc, /require\(["'].*bidCredit/i);
    const ctrl = read("src/controllers/freelancerAccountActivationKycController.js");
    assert.doesNotMatch(ctrl, /require\(["'].*stripe|paytabs|ordersService/i);
  });
});

describe("Phase A11 — API wiring", () => {
  it("freelancer + super-admin routes mounted", () => {
    const app = read("src/app.js");
    assert.match(app, /freelancerAccountActivationKycRoutes/);
    assert.match(app, /superAdminFreelancerAccountActivationKycRoutes/);

    const fr = read("src/routes/freelancerAccountActivationKycRoutes.js");
    assert.match(fr, /requireFreelancer/);
    assert.match(fr, /\/account-activation"/);
    assert.match(fr, /\/account-activation\/submit/);
    assert.match(fr, /idFront/);
    assert.match(fr, /idBack/);

    const sa = read("src/routes/superAdminFreelancerAccountActivationKycRoutes.js");
    assert.match(sa, /requireAdmin/);
    assert.doesNotMatch(sa, /requireSuperAdmin/);
    assert.match(sa, /freelancer-activation-requests/);
    assert.match(sa, /\/approve/);
    assert.match(sa, /\/reject/);
    assert.match(sa, /files\/:side/);
  });

  it("self-activate gates behind KYC; approval path exists", () => {
    const sub = read("src/services/subscriptionsService.js");
    assert.match(sub, /activateAccountAfterKycApproval/);
    assert.match(sub, /ACCOUNT_ACTIVATION_REQUIRES_KYC_REVIEW|SELF_ACTIVATE_DISABLED/);
    assert.match(sub, /freelancer_kyc_activation_approved/);
    const kyc = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(kyc, /activateAccountAfterKycApproval/);
    assert.match(kyc, /company_pending/);
    assert.match(kyc, /company_rejected/);
  });

  it("Cloudinary KYC upload uses authenticated / private local keys", () => {
    const up = read("src/services/cloudinaryUploadService.js");
    assert.match(up, /uploadKycIdBuffer/);
    assert.match(up, /authenticated/);
    assert.match(up, /local:kyc|uploads[/\\]kyc|orderz\/kyc/i);
  });

  it("admin KYC file endpoint streams bytes and does not 302 to Cloudinary", () => {
    const ctrl = read("src/controllers/freelancerAccountActivationKycController.js");
    assert.match(ctrl, /fetchAdminKycFileBytes/);
    assert.match(ctrl, /Cache-Control/);
    assert.match(ctrl, /private, no-store/);
    assert.match(ctrl, /X-Content-Type-Options/);
    assert.match(ctrl, /nosniff/);
    assert.doesNotMatch(ctrl, /res\.redirect/);
    assert.doesNotMatch(ctrl, /signed_url/);

    const svc = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(svc, /fetchAdminKycFileBytes/);
    assert.match(svc, /cloudinary_authenticated/);
    assert.match(svc, /Server-side fetch only/);
    assert.doesNotMatch(svc, /kind: "signed_url"/);

    const sa = read("src/routes/superAdminFreelancerAccountActivationKycRoutes.js");
    assert.match(sa, /requireAuth/);
    assert.match(sa, /requireAdmin/);
    assert.match(sa, /files\/:side/);
  });
});

describe("Phase A11 — constants and validation messages", () => {
  it("allows jpeg/png/webp and 5MB max", () => {
    assert.deepEqual([...ACCOUNT_ACTIVATION_KYC_ALLOWED_MIME], [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    assert.equal(ACCOUNT_ACTIVATION_KYC_MAX_BYTES, 5 * 1024 * 1024);
    assert.ok(ACCOUNT_ACTIVATION_KYC_TERMS_VERSION);
  });

  it("Arabic validation messages present in service/middleware", () => {
    const svc = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(svc, /يرجى رفع صورة الهوية من الأمام/);
    assert.match(svc, /يرجى رفع صورة الهوية من الخلف/);
    assert.match(svc, /يجب الموافقة على شروط تفعيل الحساب/);
    assert.match(svc, /سبب الرفض مطلوب/);
    const mw = read("src/middleware/accountActivationKycUploadMiddleware.js");
    assert.match(mw, /JPEG أو PNG أو WebP/);
    assert.match(mw, /5 ميغابايت/);
  });

  it("error codes cover required scenarios", () => {
    for (const key of [
      "FRONT_REQUIRED",
      "BACK_REQUIRED",
      "TERMS_REQUIRED",
      "INVALID_FILE_TYPE",
      "FILE_TOO_LARGE",
      "PENDING_EXISTS",
      "REJECTION_REASON_REQUIRED",
      "SELF_ACTIVATE_DISABLED",
    ]) {
      assert.ok(ACCOUNT_ACTIVATION_KYC_ERROR_CODES[key], key);
    }
  });
});

describe("Phase A11 — response mapping privacy", () => {
  it("freelancer map hides admin notes and file keys", () => {
    const row = {
      id: 1,
      freelancer_user_id: 2,
      status: "rejected",
      rejection_reason: "الصورة غير واضحة",
      admin_notes: "internal secret",
      terms_accepted_at: new Date(),
      terms_version: "v1",
      submitted_at: new Date(),
      reviewed_at: new Date(),
      resubmission_count: 1,
      created_at: new Date(),
      updated_at: new Date(),
      id_front_file_key: "local:kyc/2/front.jpg",
      id_back_file_key: "local:kyc/2/back.jpg",
      id_front_original_name: "front.jpg",
      id_back_original_name: "back.jpg",
    };
    const freel = service.mapRequestRow(row, { forAdmin: false });
    const admin = service.mapRequestRow(row, { forAdmin: true });
    assert.equal(freel.rejectionReason, "الصورة غير واضحة");
    assert.equal(freel.adminNotes, undefined);
    assert.equal(freel.idFrontFileKey, undefined);
    assert.equal(freel.hasFrontImage, true);
    assert.equal(admin.adminNotes, "internal secret");
    assert.equal(admin.idFrontOriginalName, "front.jpg");
  });

  it("rejectActivationRequest requires non-empty reason", async () => {
    await assert.rejects(
      () =>
        service.rejectActivationRequest({
          requestId: 1,
          actorUserId: 9,
          rejectionReason: "   ",
        }),
      (err) =>
        err.publicCode === ACCOUNT_ACTIVATION_KYC_ERROR_CODES.REJECTION_REASON_REQUIRED,
    );
  });
});

describe("Phase A11 — Activation Engine eligibility still company_approved only", () => {
  it("A1 eligibility reads company_approved", () => {
    const src = read("src/services/freelancerActivationEngineService.js");
    assert.match(
      src,
      /String\(rows\[0\]\?\.activation_status \|\| ""\)\.toLowerCase\(\) === "company_approved"/,
    );
  });
});

describe("Phase A11.1 — KYC hardening / bypass gates", () => {
  it("self-activate cannot approve directly", () => {
    const src = read("src/services/subscriptionsService.js");
    const start = src.indexOf("async function selfActivateFreelancerAccount");
    const end = src.indexOf("async function activateAccountAfterKycApproval", start);
    const block = src.slice(start, end);
    assert.match(block, /SELF_ACTIVATE_DISABLED|ACCOUNT_ACTIVATION_REQUIRES_KYC_REVIEW/);
    assert.doesNotMatch(block, /activation_status = 'company_approved'/);
  });

  it("company-activate requires assertCompanyApprovalAllowed", () => {
    const src = read("src/services/subscriptionsService.js");
    const start = src.indexOf("async function activateCompanyApprovalForSubscription");
    const end = src.indexOf("async function ensureMarketplaceMembershipForSelfActivate", start);
    const block = src.slice(start, end);
    assert.match(block, /assertCompanyApprovalAllowed/);
    assert.match(block, /KYC_ADMIN_OVERRIDE|super_admin_override/);
  });

  it("admin plan assignment no longer auto-approves", () => {
    const src = read("src/services/subscriptionsService.js");
    const start = src.indexOf("async function assignPlanToFreelancer");
    const end = src.indexOf("async function getCurrentSubscriptionForFreelancer", start);
    const block = src.slice(start, end);
    assert.match(block, /COMPANY_PENDING/);
    assert.doesNotMatch(
      block,
      /SUBSCRIPTION_ACTIVATION_STATUSES\.COMPANY_APPROVED/,
    );
  });

  it("assertCompanyApprovalAllowed maps pending/rejected/required codes", async () => {
    assert.equal(
      ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FREELANCER_KYC_REQUIRED,
      "FREELANCER_KYC_REQUIRED",
    );
    assert.equal(
      ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FREELANCER_KYC_PENDING_REVIEW,
      "FREELANCER_KYC_PENDING_REVIEW",
    );
    assert.equal(
      ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FREELANCER_KYC_REJECTED,
      "FREELANCER_KYC_REJECTED",
    );

    const gateSrc = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(gateSrc, /async function assertCompanyApprovalAllowed/);
    assert.match(gateSrc, /FREELANCER_KYC_PENDING_REVIEW/);
    assert.match(gateSrc, /OVERRIDE_FORBIDDEN/);
  });

  it("staff override without super_admin is forbidden; skip gate allowed for KYC path", async () => {
    const gateSrc = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(
      gateSrc,
      /role !== "super_admin"[\s\S]*OVERRIDE_FORBIDDEN/,
    );

    const skipped = await service.assertCompanyApprovalAllowed({
      freelancerUserId: 1,
      skipKycGate: true,
    });
    assert.equal(skipped.mode, "skip");
  });

  it("uploads/kyc is gitignored and not public static", () => {
    const gi = fs.readFileSync(path.join(root, "..", ".gitignore"), "utf8");
    assert.match(gi, /backend\/uploads/);
    const app = read("src/app.js");
    assert.doesNotMatch(app, /express\.static\([^\)]*uploads/);
    assert.match(app, /never expose via public static/i);
    const sa = read("src/routes/superAdminFreelancerAccountActivationKycRoutes.js");
    assert.match(sa, /requireAdmin/);
    assert.doesNotMatch(sa, /requireSuperAdmin/);
    assert.match(sa, /files\/:side/);
  });

  it("KYC approve remains primary path via activateAccountAfterKycApproval", () => {
    const kyc = read("src/services/freelancerAccountActivationKycService.js");
    assert.match(kyc, /activateAccountAfterKycApproval/);
    const sub = read("src/services/subscriptionsService.js");
    assert.match(sub, /async function activateAccountAfterKycApproval/);
  });
});
