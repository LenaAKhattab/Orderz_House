/**
 * Phase A11 — Freelancer account activation KYC frontend wiring.
 * Run: node --test src/phase_a11_account_activation_kyc.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase A11 — freelancer activate-account KYC UI", () => {
  it("shows front/back upload, terms, submit, and state copy", () => {
    const page = read("pages/dashboard/FreelancerActivateAccountPage.jsx");
    assert.match(page, /idFront|kyc-id-front/);
    assert.match(page, /idBack|kyc-id-back/);
    assert.match(page, /submitFreelancerAccountActivationRequest/);
    assert.match(page, /getFreelancerAccountActivationRequest/);
    assert.match(page, /pending_review/);
    assert.match(page, /rejectionReason/);
    assert.match(page, /resubmitCta|kyc\.resubmitCta/);
    assert.match(page, /approvedTitle|kyc\.approvedTitle/);
    assert.doesNotMatch(page, /adminNotes/);
  });

  it("A11.1 — no old immediate self-activate call remains", () => {
    const page = read("pages/dashboard/FreelancerActivateAccountPage.jsx");
    assert.doesNotMatch(page, /selfActivateFreelancerAccountRequest/);
    assert.doesNotMatch(page, /\/subscription\/activate-account/);
    assert.match(page, /getFreelancerAccountActivationRequest/);
    assert.match(page, /submitFreelancerAccountActivationRequest/);
  });

  it("Arabic KYC copy keys exist", () => {
    const ar = read("locales/ar/freelancerDashboard.json");
    assert.match(ar, /تفعيل حساب المستقل/);
    assert.match(ar, /لن يتم تفعيل الحساب مباشرة/);
    assert.match(ar, /إرسال طلب التفعيل/);
    assert.match(ar, /طلبك قيد المراجعة/);
    assert.match(ar, /إعادة إرسال طلب التفعيل/);
  });
});

describe("Phase A11 — Super Admin review UI", () => {
  it("list/detail page has approve/reject and both images", () => {
    const page = read("pages/dashboard/SuperAdminFreelancerActivationRequestsPage.jsx");
    assert.match(page, /قبول التفعيل/);
    assert.match(page, /رفض التفعيل/);
    assert.match(page, /سبب الرفض/);
    assert.match(page, /ملاحظات داخلية/);
    assert.match(page, /صورة الهوية الأمامية/);
    assert.match(page, /صورة الهوية الخلفية/);
    assert.match(page, /approveSuperAdminFreelancerActivationRequestRequest/);
    assert.match(page, /rejectSuperAdminFreelancerActivationRequestRequest/);
  });

  it("route and nav are Super Admin only", () => {
    const app = read("App.jsx");
    assert.match(app, /freelancer-activation-requests/);
    assert.match(app, /SuperAdminFreelancerActivationRequestsPage/);
    assert.equal(
      canRoleAccessPath("/dashboard/super-admin/freelancer-activation-requests", ROLE.SUPER_ADMIN),
      true,
    );
    assert.equal(
      canRoleAccessPath("/dashboard/super-admin/freelancer-activation-requests", ROLE.FREELANCER),
      false,
    );
    assert.equal(
      canRoleAccessPath("/dashboard/super-admin/freelancer-activation-requests", ROLE.ADMIN),
      false,
    );
  });

  it("api helpers exist", () => {
    const api = read("services/api.js");
    assert.match(api, /\/freelancer\/account-activation/);
    assert.match(api, /\/freelancer\/account-activation\/submit/);
    assert.match(api, /\/super-admin\/freelancer-activation-requests/);
  });
});
