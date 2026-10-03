import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Account Restrictions management UI (Users design source)", () => {
  const page = read("pages/dashboard/SuperAdminAccountRestrictionsPage.jsx");
  const users = read("pages/dashboard/SuperAdminUsersPage.jsx");
  const css = read("pages/dashboard/superAdminUsersPage.css");
  const ar = JSON.parse(read("locales/ar/accountRestrictions.json"));
  const en = JSON.parse(read("locales/en/accountRestrictions.json"));

  it("reuses Super Admin Users CSS and airy table shell", () => {
    assert.match(page, /superAdminUsersPage\.css/);
    assert.match(page, /oh-sa-users-table--airy/);
    assert.match(page, /oh-sa-users-list-head/);
    assert.match(page, /oh-sa-users-toolbar__tabs/);
    assert.match(page, /oh-sa-users-person/);
    assert.match(page, /oh-sa-users-drawer/);
    assert.match(page, /oh-sa-users-row-menu/);
    assert.match(css, /\.oh-sa-users-table--airy/);
  });

  it("reuses shared Users page dashboard components", () => {
    for (const token of [
      "DashboardShell",
      "DashboardSection",
      "DashboardEmptyState",
      "DashboardLoadingState",
      "DashboardErrorState",
      "StatusBadge",
      "Pagination",
    ]) {
      assert.match(page, new RegExp(token));
      assert.match(users, new RegExp(token));
    }
    assert.match(page, /ConfirmDialog/);
  });

  it("hides permanent inline create form; Add User opens drawer", () => {
    assert.doesNotMatch(page, /showForm\s*\?/);
    assert.match(page, /addOpen/);
    assert.match(page, /AddRestrictionDrawer/);
    assert.match(page, /accountRestrictions\.addUser/);
    assert.equal(ar.addUser.includes("إضافة مستخدم"), true);
    assert.equal(en.addUser.includes("Add User"), true);
  });

  it("defaults Entire Marketplace / ALL_MARKETPLACE", () => {
    assert.match(page, /scopes:\s*\["ALL_MARKETPLACE"\]/);
    assert.match(page, /scopeMode === "all"/);
    assert.equal(ar.scopeMode.all, "كل السوق");
    assert.equal(en.scopeMode.all, "Entire Marketplace");
  });

  it("uses friendly status labels and required columns", () => {
    for (const key of [
      "user",
      "userId",
      "email",
      "plan",
      "status",
      "scope",
      "addedAt",
      "expiresAt",
      "addedBy",
      "actions",
    ]) {
      assert.ok(ar.columns[key]);
      assert.ok(en.columns[key]);
    }
    assert.equal(ar.statusLabels.ACTIVE, "مقيّد");
    assert.equal(en.statusLabels.ACTIVE, "Restricted");
    assert.equal(ar.statusLabels.REVOKED, "تم رفع القيد");
    assert.equal(ar.restrictionTypeLabel, "تقييد الحساب");
    assert.equal(en.restrictionTypeLabel, "Account Restriction");
    assert.equal(ar.types, undefined);
  });

  it("supports search/select, duration presets, and confirmation", () => {
    assert.match(page, /listSuperAdminUsersRequest/);
    assert.match(page, /pickUser/);
    assert.match(page, /durationId/);
    assert.equal(ar.duration.h24, "24 ساعة");
    assert.equal(en.duration.d7, "7 Days");
    assert.match(ar.addWorkflow.confirmBody, /نطاق/);
    assert.match(en.addWorkflow.confirmBody, /marketplace/i);
  });

  it("integrates Users drawer into the same workflow", () => {
    assert.match(users, /account-restrictions\?add=1&userId=/);
    assert.match(users, /accountRestrictions\.addFromUsers/);
    assert.match(users, /accountRestrictions\.manage/);
    assert.match(page, /searchParams\.get\("add"\)/);
  });

  it("provides active and historical row actions", () => {
    assert.match(page, /viewDetails/);
    assert.match(page, /extend/);
    assert.match(page, /revoke/);
    assert.match(page, /restrictAgain/);
    assert.match(page, /editScopeMode/);
  });
});
