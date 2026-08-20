/**
 * Phase F1 — frontend financial claims safety wiring.
 * Run: node --test src/phase_f1_financial_claims_safety.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase F1 — Super Admin claims UI", () => {
  it("status change options exclude paid; payment ledger message present", () => {
    const page = read("pages/dashboard/SuperAdminFinancialClaimsPage.jsx");
    assert.match(page, /CLAIM_STATUS_CHANGE_OPTIONS/);
    const changeBlock = page.slice(
      page.indexOf("CLAIM_STATUS_CHANGE_OPTIONS"),
      page.indexOf("PAYOUT_STATUS_OPTIONS"),
    );
    assert.doesNotMatch(changeBlock, /value: "paid"/);
    assert.match(page, /تسجيل دفعة مالية/);
  });
});

describe("Phase F1 — Freelancer claims create", () => {
  it("does not send pricing fields and maps KYC errors", () => {
    const page = read("pages/dashboard/FreelancerFinancialClaimsPage.jsx");
    const createFn = page.slice(page.indexOf("const createClaim"), page.indexOf("return ("));
    assert.doesNotMatch(createFn, /totalPriceSnapshot/);
    assert.doesNotMatch(createFn, /userPercentageSnapshot/);
    assert.match(page, /FREELANCER_KYC_REQUIRED|kycRequired/);
    assert.match(page, /FREELANCER_KYC_PENDING_REVIEW|kycPending/);
    assert.match(page, /FREELANCER_KYC_REJECTED|kycRejected/);
  });

  it("Arabic safety copy exists", () => {
    const ar = read("locales/ar/freelancerDashboard.json");
    assert.match(ar, /لا يمكن إنشاء مطالبة مالية قبل تفعيل الحساب/);
    assert.match(ar, /طلب التفعيل قيد المراجعة/);
    assert.match(ar, /تم رفض طلب التفعيل/);
  });
});
