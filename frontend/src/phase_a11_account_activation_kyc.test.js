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
    assert.match(ar, /توثيق الهوية/);
    assert.match(ar, /ارفع صور الهوية لإكمال تفعيل الحساب/);
    assert.match(ar, /لن يتم تفعيل الحساب مباشرة/);
    assert.match(ar, /إرسال طلب توثيق الهوية/);
    assert.match(ar, /طلب توثيق الهوية قيد المراجعة/);
    assert.match(ar, /إعادة إرسال طلب توثيق الهوية/);
    assert.match(ar, /اضغط لاختيار الصورة/);
    assert.match(ar, /تغيير الصورة/);
  });

  it("menu and page label identity verification for discovery", () => {
    const dashAr = read("locales/ar/dashboard.json");
    const dashEn = read("locales/en/dashboard.json");
    const page = read("pages/dashboard/FreelancerActivateAccountPage.jsx");
    const layout = read("layouts/FreelancerDashboardLayout.jsx");
    assert.match(dashAr, /"activateAccount": "توثيق الهوية"/);
    assert.match(dashEn, /"activateAccount": "Identity verification"/);
    assert.match(layout, /activate-account/);
    assert.match(layout, /activateAccount/);
    assert.match(page, /kyc\.pageTitle/);
    assert.match(page, /kyc\.uploadHint/);
    assert.equal(canRoleAccessPath("/dashboard/freelancer/activate-account", ROLE.FREELANCER), true);
  });
});

describe("Phase A11 — KYC upload card UI", () => {
  it("uses custom upload cards instead of bare file inputs", () => {
    const page = read("pages/dashboard/FreelancerActivateAccountPage.jsx");
    const css = read("pages/dashboard/shared/account-pages.css");
    assert.match(page, /oh-kyc-upload/);
    assert.match(page, /oh-kyc-upload__dropzone/);
    assert.match(page, /oh-kyc-upload__input/);
    assert.match(page, /chooseImage|changeImage|removeImage/);
    assert.match(css, /\.oh-kyc-upload/);
    assert.match(css, /\.oh-kyc-upload__dropzone/);
    assert.doesNotMatch(page, /oh-account-label[\s\S]*type=["']file["']/);
  });
});

describe("Phase A11 — Super Admin review UI", () => {
  it("list/detail page has approve/reject and both images", () => {
    const page = read("pages/dashboard/SuperAdminFreelancerActivationRequestsPage.jsx");
    const ar = read("locales/ar/activation.json");
    assert.match(page, /activation\.requests\.approve/);
    assert.match(page, /activation\.requests\.reject/);
    assert.match(page, /activation\.requests\.rejectReasonLabel|activation\.requests\.rejectionReason/);
    assert.match(page, /activation\.requests\.adminNotes/);
    assert.match(page, /activation\.requests\.idFront/);
    assert.match(page, /activation\.requests\.idBack/);
    assert.match(ar, /"approve": "قبول التفعيل"/);
    assert.match(ar, /رفض التفعيل|رفض/);
    assert.match(page, /approveSuperAdminFreelancerActivationRequestRequest/);
    assert.match(page, /rejectSuperAdminFreelancerActivationRequestRequest/);
    assert.match(page, /fetchSuperAdminFreelancerActivationKycFileBlob/);
    assert.match(page, /AbortController/);
    assert.match(page, /revokeObjectURL/);
    assert.match(page, /activation\.requests\.kycNotFound/);
    assert.match(page, /activation\.requests\.kycForbidden/);
    assert.match(page, /activation\.requests\.kycLoadFailed/);
    assert.doesNotMatch(page, /res\.cloudinary\.com|cloudinary\.com\/.*authenticated/);
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

  it("KYC file blob helper stays same-origin and disables redirects", () => {
    const api = read("services/api.js");
    assert.match(api, /fetchSuperAdminFreelancerActivationKycFileBlob/);
    assert.match(
      api,
      /\/super-admin\/freelancer-activation-requests\/\$\{encodeURIComponent\(id\)\}\/files/,
    );
    assert.match(api, /responseType:\s*"blob"/);
    assert.match(api, /maxRedirects:\s*0/);
    assert.match(api, /disposition:\s*"inline"/);
    assert.doesNotMatch(api, /res\.cloudinary\.com/);
  });

  it("api helpers exist", () => {
    const api = read("services/api.js");
    assert.match(api, /\/freelancer\/account-activation/);
    assert.match(api, /\/freelancer\/account-activation\/submit/);
    assert.match(api, /\/super-admin\/freelancer-activation-requests/);
  });
});
