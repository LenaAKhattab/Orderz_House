/**
 * Super Admin plans soft-delete / archive UI.
 * Run: node --test src/admin/plans/planArchiveUi.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("plan archive / delete UI", () => {
  it("AdminPlanCard renders icon-only delete with accessible label", () => {
    const card = read("admin/plans/AdminPlanCard.jsx");
    assert.match(card, /Trash2/);
    assert.match(card, /data-testid="plan-card-delete"/);
    assert.match(card, /title="تعطيل الباقة"/);
    assert.match(card, /oh-sapl-card__action--icon/);
    assert.doesNotMatch(card, />\s*حذف\s*</);
  });

  it("plans page opens ConfirmDialog and archives via PATCH", () => {
    const page = read("pages/dashboard/SuperAdminPlansPage.jsx");
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /تأكيد حذف الباقة/);
    assert.match(page, /تعطيل الباقة/);
    assert.match(page, /setDeleteTarget/);
    assert.match(page, /archivePlanRequest/);
    assert.match(page, /تم تعطيل الباقة بنجاح/);
    assert.doesNotMatch(page, /window\.confirm/);
    assert.match(page, /لن يتم حذف الاشتراكات أو السجلات القديمة/);
  });

  it("api exposes archivePlanRequest", () => {
    const api = read("services/api.js");
    assert.match(api, /export const archivePlanRequest/);
    assert.match(api, /\/admin\/plans\/\$\{id\}\/archive/);
  });

  it("marketplace membership card uses safe archive trash icon", () => {
    const card = read("admin/marketplaceMembership/MarketplaceMembershipPlanCard.jsx");
    const page = read("pages/dashboard/SuperAdminMarketplacePlansPage.jsx");
    assert.match(card, /data-testid="marketplace-plan-card-delete"/);
    assert.match(card, /onArchive/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /handleArchive/);
    assert.match(page, /isActive: false/);
    assert.doesNotMatch(page, /deleteMarketplaceMembershipPlan|DELETE FROM marketplace/);
  });
});
