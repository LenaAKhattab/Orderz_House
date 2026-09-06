/**
 * Phase 0C — Super Admin manual Bildazo author link UI contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";
import {
  BILDAZO_ADMIN_STATUS_FILTERS,
  canSubmitManualLink,
} from "./constants/bildazoAuthorAdmin.js";
import { isBildazoAuthorLinked } from "./constants/bildazoAuthorTerms.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Super Admin Bildazo author links page", () => {
  it("renders pending filters and manual link dialog contracts", () => {
    assert.ok(BILDAZO_ADMIN_STATUS_FILTERS.some((item) => item.value === "pending_new_account"));
    const page = read("pages/dashboard/SuperAdminBildazoAuthorLinksPage.jsx");
    assert.match(page, /ربط حسابات Bildazo/);
    assert.match(page, /data-testid="bildazo-admin-filters"/);
    assert.match(page, /data-testid="bildazo-manual-link-dialog"/);
    assert.match(page, /أؤكد أنني تحققت من ملكية حساب Bildazo قبل الربط/);
    assert.match(page, /حساب الكاتب مرتبط/);
    assert.match(page, /disabled=\{!canSubmit \|\| saving\}/);
    assert.doesNotMatch(page, /type=["']password["']/);
    assert.doesNotMatch(page, /تم إنشاء الحساب/);
  });

  it("manual link dialog requires confirmation checkbox and an identifier", () => {
    assert.equal(
      canSubmitManualLink({ bildazoPublicId: "w-1", confirmVerified: false }),
      false,
    );
    assert.equal(canSubmitManualLink({ confirmVerified: true }), false);
    assert.equal(
      canSubmitManualLink({ bildazoPublicId: "w-1", confirmVerified: true }),
      true,
    );
    assert.equal(
      canSubmitManualLink({
        bildazoProfileUrl: "https://bildazo.com/u/w-1",
        confirmVerified: true,
      }),
      true,
    );
  });

  it("client/freelancer nav does not show the Super Admin page", () => {
    const freelancerNav = read("constants/freelancerNav.js");
    const clientNav = read("constants/clientNav.js");
    assert.doesNotMatch(freelancerNav, /bildazo-author-links/);
    assert.doesNotMatch(clientNav, /bildazo-author-links/);
    assert.equal(
      canRoleAccessPath("/dashboard/super-admin/bildazo-author-links", ROLE.FREELANCER),
      false,
    );
    assert.equal(canRoleAccessPath("/dashboard/super-admin/bildazo-author-links", ROLE.CLIENT), false);
    assert.equal(
      canRoleAccessPath("/dashboard/super-admin/bildazo-author-links", ROLE.SUPER_ADMIN),
      true,
    );
  });

  it("sidebar contains ربط حسابات Bildazo for Super Admin", () => {
    const nav = read("constants/superAdminNav.js");
    assert.match(nav, /\/dashboard\/super-admin\/bildazo-author-links/);
    assert.match(nav, /dashboard\.nav\.superAdmin\.bildazoAuthorLinks/);
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/super-admin\/bildazo-author-links"/);
    assert.match(app, /SuperAdminBildazoAuthorLinksPage/);
  });

  it("freelancer article page linked state renders compact account widget", () => {
    const widget = read("components/freelancer/FreelancerBildazoLinkedAccountWidget.jsx");
    assert.match(widget, /data-testid="bildazo-linked-profile"/);
    assert.match(widget, /حساب Bildazo مرتبط/);
    assert.match(widget, /link\?\.linked\?\.bildazoProfileUrl/);
    assert.equal(isBildazoAuthorLinked({ status: "linked" }), true);
  });
});
