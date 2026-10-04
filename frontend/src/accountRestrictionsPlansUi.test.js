/**
 * Plan-level Account Restrictions UI wiring.
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
  it("primary Users/Plans tabs and plans panel reuse Users table shell", () => {
    const page = read("pages/dashboard/SuperAdminAccountRestrictionsPage.jsx");
    const panel = read("pages/dashboard/SuperAdminAccountRestrictionsPlansPanel.jsx");
    assert.match(page, /accountRestrictions\.primaryTabs\.users/);
    assert.match(page, /accountRestrictions\.primaryTabs\.plans/);
    assert.match(page, /primaryTab === "plans"/);
    assert.match(panel, /oh-sa-users-table--airy/);
    assert.match(panel, /oh-sa-users-drawer/);
    assert.match(panel, /StatusBadge/);
    assert.match(panel, /ConfirmDialog/);
    assert.doesNotMatch(panel, /freelancer_account_restrictions/);
  });

  it("i18n covers plan columns and impact confirmation", () => {
    const ar = read("locales/ar/accountRestrictions.json");
    const en = read("locales/en/accountRestrictions.json");
    assert.match(ar, /إضافة باقة إلى القيود/);
    assert.match(ar, /المتأثرون حالياً/);
    assert.match(en, /Restrict Plan/);
    assert.match(en, /Currently affected/);
    assert.match(ar, /غير مقيّدة/);
    assert.match(en, /Not Restricted/);
  });

  it("api helpers for plan restrictions exist", () => {
    const api = read("services/api.js");
    assert.match(api, /listSuperAdminPlanRestrictionsRequest/);
    assert.match(api, /createSuperAdminPlanRestrictionRequest/);
    assert.match(api, /revokeSuperAdminPlanRestrictionRequest/);
    assert.match(api, /\/account-restrictions\/plans/);
  });
});
