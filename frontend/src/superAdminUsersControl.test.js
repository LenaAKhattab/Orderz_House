import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = __dirname;

function read(rel) {
  return readFileSync(join(srcRoot, rel), "utf8");
}

describe("Super Admin Users Control Center architecture", () => {
  it("registers nav route label for users control", () => {
    const nav = read("constants/superAdminNav.js");
    assert.match(nav, /key:\s*["']users["']/);
    assert.match(nav, /to:\s*["']\/dashboard\/super-admin\/users["']/);
    assert.match(nav, /labelKey:\s*["']dashboard\.nav\.superAdmin\.users["']/);
    assert.match(nav, /usersControl/);
  });

  it("page requires Arabic reason UI for sensitive actions", () => {
    const page = read("pages/dashboard/SuperAdminUsersPage.jsx");
    assert.match(page, /المستخدمون/);
    assert.match(page, /إدارة حسابات المستخدمين، الهويات، الباقات، والدورات من مكان واحد/);
    assert.match(page, /سبب الإجراء/);
    assert.match(page, /سبب الإجراء مطلوب/);
    assert.match(page, /protectedPath/);
    assert.match(page, /نظرة عامة/);
    assert.match(page, /سجل الإدارة/);
    assert.match(page, /oh-sa-users-/);
  });

  it("API client exposes users-control request helpers", () => {
    const api = read("services/api.js");
    for (const name of [
      "getSuperAdminUsersStatsRequest",
      "listSuperAdminUsersRequest",
      "getSuperAdminUserDetailRequest",
      "patchSuperAdminUserAccountRequest",
      "patchSuperAdminUserIdentityRequest",
      "patchSuperAdminUserMembershipRequest",
      "patchSuperAdminUserTrainingRequest",
      "postSuperAdminUsersBulkActionsRequest",
      "listAdminPlansRequest",
    ]) {
      assert.match(api, new RegExp(`export const ${name}`));
    }
    assert.match(api, /\/super-admin\/users\/stats/);
    assert.match(api, /\/super-admin\/users\/bulk-actions/);
  });

  it("App route and lazy page are wired for super_admin only", () => {
    const app = read("App.jsx");
    const lazy = read("routes/lazyPages.js");
    assert.match(lazy, /SuperAdminUsersPage/);
    assert.match(app, /SuperAdminUsersPage/);
    assert.match(app, /\/dashboard\/super-admin\/users/);
    assert.match(app, /RequireRole/);
    assert.match(app, /ROLE\.SUPER_ADMIN/);
    assert.doesNotMatch(
      app.slice(app.indexOf("/dashboard/super-admin/users"), app.indexOf("/dashboard/super-admin/users") + 450),
      /RequireStaffPage/,
    );
  });
});
