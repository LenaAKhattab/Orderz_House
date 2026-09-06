/**
 * Phase F1 — Financial claims + earned balance safety hardening.
 * Static + pure unit tests. No migrations / production / Stripe / orders rewrite.
 *
 * Run: node --test test/financialClaimsSafetyPhaseF1.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/financial_claims_f1_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CLAIM_STATUSES,
  CLAIM_STATUS_PATCH_ALLOWED,
  FINANCIAL_CLAIM_ERROR_CODES,
  FREELANCER_CLAIM_PRICING_BODY_KEYS,
  assertNoFreelancerPricingFields,
  updateClaimStatusBySuperAdmin,
} = require("../src/services/financialClaimsService");
const {
  ACCOUNT_ACTIVATION_KYC_ERROR_CODES,
} = require("../src/constants/freelancerAccountActivationKyc");
const earned = require("../src/services/freelancerActivationEarnedBalanceService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase F1 — block direct paid status", () => {
  it("paid is not in CLAIM_STATUS_PATCH_ALLOWED", () => {
    assert.ok(!CLAIM_STATUS_PATCH_ALLOWED.includes(CLAIM_STATUSES.PAID));
    assert.ok(CLAIM_STATUS_PATCH_ALLOWED.includes(CLAIM_STATUSES.ACCEPTED));
  });

  it("updateClaimStatusBySuperAdmin rejects paid with PAYMENT_LEDGER_REQUIRED", async () => {
    await assert.rejects(
      () =>
        updateClaimStatusBySuperAdmin({
          actorUserId: 1,
          claimId: 1,
          newStatus: "paid",
        }),
      (err) =>
        err.publicCode === FINANCIAL_CLAIM_ERROR_CODES.PAYMENT_LEDGER_REQUIRED
        && err.statusCode === 409,
    );
  });

  it("validators and payment path still document paid via freelancer-payments", () => {
    const validators = read("src/validators/financialClaimsValidators.js");
    const statusBlockStart = validators.indexOf("const updateFinancialClaimStatusValidators");
    const statusBlockEnd = validators.indexOf("];", statusBlockStart);
    const statusBlock = validators.slice(statusBlockStart, statusBlockEnd);
    assert.match(statusBlock, /requires_in_person_review/);
    assert.doesNotMatch(statusBlock, /"paid"/);
    const svc = read("src/services/financialClaimsService.js");
    assert.match(svc, /createFreelancerPaymentBySuperAdmin/);
    assert.match(svc, /FINANCIAL_CLAIM_PAYMENT_LEDGER_REQUIRED/);
    const routes = read("src/routes/superAdminFinancialClaimsRoutes.js");
    assert.match(routes, /freelancer-payments/);
  });
});

describe("Phase F1 — reject freelancer pricing injection", () => {
  it("lists risky body keys", () => {
    assert.ok(FREELANCER_CLAIM_PRICING_BODY_KEYS.includes("totalPriceSnapshot"));
    assert.ok(FREELANCER_CLAIM_PRICING_BODY_KEYS.includes("userPercentageSnapshot"));
    assert.ok(FREELANCER_CLAIM_PRICING_BODY_KEYS.includes("amount"));
  });

  it("assertNoFreelancerPricingFields rejects totalPriceSnapshot", () => {
    assert.throws(
      () => assertNoFreelancerPricingFields({ mode: "manual", totalPriceSnapshot: 10 }),
      (err) => err.publicCode === FINANCIAL_CLAIM_ERROR_CODES.PRICING_NOT_ALLOWED,
    );
  });

  it("assertNoFreelancerPricingFields rejects percentage fields", () => {
    assert.throws(
      () =>
        assertNoFreelancerPricingFields({
          userPercentageSnapshot: 70,
          companyPercentageSnapshot: 30,
        }),
      (err) => err.publicCode === FINANCIAL_CLAIM_ERROR_CODES.PRICING_NOT_ALLOWED,
    );
  });

  it("assertNoFreelancerPricingFields rejects freelancerAmount", () => {
    assert.throws(
      () => assertNoFreelancerPricingFields({ freelancerAmount: 5 }),
      (err) => err.publicCode === FINANCIAL_CLAIM_ERROR_CODES.PRICING_NOT_ALLOWED,
    );
  });

  it("assertNoFreelancerPricingFields allows non-pricing payload", () => {
    assert.doesNotThrow(() =>
      assertNoFreelancerPricingFields({
        mode: "done_project",
        projectId: 9,
        freelancerNote: "ok",
      }),
    );
  });

  it("create path ignores body pricing and uses trusted order budget only", () => {
    const src = read("src/services/financialClaimsService.js");
    assert.match(src, /assertNoFreelancerPricingFields/);
    assert.match(src, /totalPriceSnapshot = null/);
    assert.match(src, /order\.budget != null \? Number\(order\.budget\)/);
  });
});

describe("Phase F1 — KYC / company approval gate on claim create", () => {
  it("createFinancialClaimForFreelancer calls company approval assert", () => {
    const src = read("src/services/financialClaimsService.js");
    assert.match(src, /assertFreelancerCompanyApprovedForClaims/);
    assert.match(src, /FREELANCER_KYC_REQUIRED/);
    assert.match(src, /FREELANCER_KYC_PENDING_REVIEW/);
    assert.match(src, /FREELANCER_KYC_REJECTED/);
    assert.match(src, /company_approved/);
  });

  it("error codes align with A11 constants", () => {
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
  });
});

describe("Phase F1 — earned balance uses frozen writer amount", () => {
  it("resolveDisplayAmountJod prefers writer_net over live campaign share", () => {
    const amount = earned.resolveDisplayAmountJod({
      writer_net_jod: "0.500",
      ledger_amount_jod: "0.500",
      amount_jod: "0.500",
      activation_campaign_id: 3,
      freelancer_share_jod: "9.999",
    });
    assert.equal(amount, "0.500");
  });

  it("campaign share alone without frozen amount does not invent live share", () => {
    const amount = earned.resolveDisplayAmountJod({
      activation_campaign_id: 3,
      freelancer_share_jod: "1.250",
    });
    assert.equal(amount, "0.000");
  });

  it("source no longer prefers freelancer_share_jod first", () => {
    const src = read("src/services/freelancerActivationEarnedBalanceService.js");
    assert.match(src, /writer_net_jod/);
    assert.match(src, /frozen settlement writer net/i);
    const fn = src.slice(
      src.indexOf("function resolveDisplayAmountJod"),
      src.indexOf("function mapEarnedBalanceEntry"),
    );
    assert.ok(fn.indexOf("writer_net_jod") < fn.indexOf("freelancer_share_jod") || !fn.includes("freelancer_share_jod"));
  });
});

describe("Phase F1 — frontend hardening wiring", () => {
  it("Super Admin status change UI excludes paid", () => {
    const page = read(
      path.join("..", "frontend", "src", "pages", "dashboard", "SuperAdminFinancialClaimsPage.jsx"),
    );
    assert.match(page, /CLAIM_STATUS_CHANGE_OPTIONS/);
    assert.match(page, /تسجيل دفعة مالية/);
    const changeBlock = page.slice(
      page.indexOf("CLAIM_STATUS_CHANGE_OPTIONS"),
      page.indexOf("PAYOUT_STATUS_OPTIONS"),
    );
    assert.doesNotMatch(changeBlock, /value: "paid"/);
  });

  it("freelancer create does not send pricing fields", () => {
    const page = read(
      path.join("..", "frontend", "src", "pages", "dashboard", "FreelancerFinancialClaimsPage.jsx"),
    );
    const createFn = page.slice(page.indexOf("const createClaim"), page.indexOf("return ("));
    assert.doesNotMatch(createFn, /totalPriceSnapshot/);
    assert.doesNotMatch(createFn, /userPercentageSnapshot/);
    assert.match(page, /FREELANCER_KYC_REQUIRED|kycRequired/);
  });
});
