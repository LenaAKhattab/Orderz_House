/**
 * Plan-level Account Restrictions UI wiring + Users parity.
 * Run: node --test src/accountRestrictionsPlansUi.test.js
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

describe("Account Restrictions Plans tab", () => {
  const page = read("pages/dashboard/SuperAdminAccountRestrictionsPage.jsx");
  const panel = read("pages/dashboard/SuperAdminAccountRestrictionsPlansPanel.jsx");
  const users = read("pages/dashboard/SuperAdminUsersPage.jsx");

  it("1-2 Users and Plans tabs render on the management page", () => {
    assert.match(page, /accountRestrictions\.primaryTabs\.users/);
    assert.match(page, /accountRestrictions\.primaryTabs\.plans/);
    assert.match(page, /primaryTab === "plans"/);
    assert.match(page, /SuperAdminAccountRestrictionsPlansPanel/);
  });

  it("3 no stray plan-summary markup outside drawer/table cells", () => {
    assert.doesNotMatch(panel, /oh-sa-users-search-results/);
    assert.doesNotMatch(panel, /oh-sa-users-search-result[^-]/);
    assert.doesNotMatch(panel, /oh-sa-users-drawer-root/);
    assert.doesNotMatch(panel, /oh-sa-users-drawer-backdrop/);
    assert.doesNotMatch(panel, /oh-sa-users-drawer__head"/);
    assert.doesNotMatch(panel, /oh-sa-users-drawer__form/);
    assert.doesNotMatch(panel, /oh-sa-users-drawer__footer/);
    assert.doesNotMatch(panel, /oh-sa-restr-scope-mode/);
    assert.doesNotMatch(panel, /oh-sa-restr-scope-checks/);
  });

  it("4-5 row menu reuses Users portal component pattern", () => {
    assert.match(panel, /className="oh-sa-users-row-menu"/);
    assert.match(panel, /oh-sa-users-row-menu__trigger/);
    assert.match(panel, /oh-sa-users-row-menu__panel/);
    assert.match(panel, /createPortal/);
    assert.match(panel, /document\.body/);
    assert.match(panel, /Escape/);
    assert.match(users, /oh-sa-users-row-menu__panel/);
    assert.match(users, /createPortal/);
  });

  it("6-8 Restrict Plan drawer uses Users drawer shell", () => {
    assert.match(panel, /className="oh-sa-users-drawer"/);
    assert.match(panel, /oh-sa-users-drawer__backdrop/);
    assert.match(panel, /oh-sa-users-drawer__panel/);
    assert.match(panel, /oh-sa-users-drawer__header/);
    assert.match(panel, /oh-sa-users-drawer__body/);
    assert.match(panel, /oh-sa-users-drawer__close/);
    assert.match(panel, /oh-sa-users-drawer__sub/);
    assert.match(users, /oh-sa-users-drawer__panel/);
    assert.match(panel, /accountRestrictions\.plans\.restrictPlan/);
  });

  it("9-11 form controls stay inside Users field wrappers", () => {
    assert.match(panel, /oh-sa-users-field/);
    assert.match(panel, /oh-sa-restr-radio-row/);
    assert.match(panel, /oh-sa-restr-custom-scopes/);
    assert.match(panel, /oh-sa-restr-search-results/);
    assert.match(panel, /oh-sa-users-actions-row--primary/);
    assert.match(panel, /scopes: \["ALL_MARKETPLACE"\]/);
    assert.match(panel, /scopeMode === "custom"/);
  });

  it("12-15 reason validation, duration, cancel/close", () => {
    assert.match(panel, /form\.reasonRequired/);
    assert.match(panel, /internalReason/);
    assert.match(panel, /DURATION_OPTIONS/);
    assert.match(panel, /datetime-local/);
    assert.match(panel, /closeAdd/);
    assert.match(panel, /form\.cancel/);
    assert.match(panel, /ConfirmDialog/);
  });

  it("16-19 RTL/LTR via logical inset + Users CSS import", () => {
    assert.match(page, /superAdminUsersPage\.css/);
    const usersCss = read("pages/dashboard/superAdminUsersPage.css");
    assert.match(usersCss, /inset-inline-end:\s*0/);
    assert.match(usersCss, /\[dir="rtl"\] \.oh-sa-users-drawer__panel/);
    assert.match(usersCss, /z-index:\s*1200/);
    assert.match(usersCss, /\.oh-sa-users-row-menu__panel[\s\S]*z-index:\s*80/);
  });

  it("20 API integration unchanged", () => {
    const api = read("services/api.js");
    assert.match(api, /listSuperAdminPlanRestrictionsRequest/);
    assert.match(api, /createSuperAdminPlanRestrictionRequest/);
    assert.match(api, /revokeSuperAdminPlanRestrictionRequest/);
    assert.match(api, /\/account-restrictions\/plans/);
    assert.match(panel, /createSuperAdminPlanRestrictionRequest/);
    assert.match(panel, /listSuperAdminPlanRestrictionsRequest/);
  });

  it("table shell and empty/loading/error states match Users", () => {
    assert.match(panel, /oh-sa-users-table--airy/);
    assert.match(panel, /DashboardEmptyState/);
    assert.match(panel, /DashboardLoadingState/);
    assert.match(panel, /DashboardErrorState/);
    assert.match(panel, /StatusBadge/);
    assert.doesNotMatch(panel, /freelancer_account_restrictions/);
  });

  it("i18n covers plan columns and impact confirmation", () => {
    const ar = read("locales/ar/accountRestrictions.json");
    const en = read("locales/en/accountRestrictions.json");
    assert.match(ar, /إضافة باقة إلى القيود/);
    assert.match(ar, /المتأثرون حالياً/);
    assert.match(ar, /تقييد الباقة/);
    assert.match(en, /Restrict Plan/);
    assert.match(en, /Currently affected/);
    assert.match(ar, /غير مقيّدة/);
    assert.match(en, /Not Restricted/);
  });
});
