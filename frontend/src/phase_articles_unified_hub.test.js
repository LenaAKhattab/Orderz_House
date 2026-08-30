import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canRoleAccessPath, ROLE } from "./constants/authRoutes.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Super Admin unified المقالات hub", () => {
  it("sidebar shows المقالات directly below بيت المونة", () => {
    const nav = read("constants/superAdminNav.js");
    assert.match(
      nav,
      /itemKeys:\s*\["internalRequests",\s*"trainingRequests",\s*"pantry",\s*"articles"\]/,
    );
    assert.match(nav, /to:\s*"\/dashboard\/super-admin\/articles"/);
    const usersSection = nav.match(
      /id:\s*"usersSubscriptions"[\s\S]*?itemKeys:\s*\[([^\]]+)\]/,
    );
    assert.ok(usersSection);
    assert.doesNotMatch(usersSection[1], /\barticleManagement\b/);
    assert.doesNotMatch(usersSection[1], /"freelancerActivation"/);
    assert.doesNotMatch(usersSection[1], /\bfreelancerActivation\b(?!Requests)/);
    const ar = read("locales/ar/dashboard.json");
    assert.match(ar, /"articles": "المقالات"/);
  });

  it("route /dashboard/super-admin/articles is Super Admin only", () => {
    assert.equal(canRoleAccessPath("/dashboard/super-admin/articles", ROLE.SUPER_ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/articles", ROLE.FREELANCER), false);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/articles", ROLE.ADMIN), false);
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/super-admin\/articles"/);
    assert.match(app, /SuperAdminArticlesHubPage/);
  });

  it("hub renders four Arabic tabs and overview KPIs", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.doesNotMatch(hub, /DashboardPageHeader/);
    assert.doesNotMatch(hub, /title="المقالات"/);
    assert.match(hub, /إدارة مقالات المستقلين، المخزون، التمويل، والتوزيع من مكان واحد/);
    assert.match(hub, /articles-hub-tabs/);
    assert.match(hub, /نظرة عامة/);
    assert.match(hub, /المقالات المنزلة/);
    assert.match(hub, /مخزون المقالات/);
    assert.match(hub, /صندوق التمويل/);
    assert.match(hub, /articles-hub-kpis/);
    assert.match(hub, /رصيد الصندوق/);
    assert.match(hub, /مقالات في المخزون/);
    assert.match(hub, /إجراءات سريعة/);
    assert.match(hub, /articles-hub-quick-actions/);
    assert.match(hub, /متابعة المقالات/);
    assert.doesNotMatch(hub, />Overview<|>Released Articles<|>Funding</);
  });

  it("does not show campaign selector or activation request links", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.doesNotMatch(hub, /حملة التفعيل المرتبطة/);
    assert.doesNotMatch(hub, /طلبات تفعيل المستقلين/);
    assert.doesNotMatch(hub, /اختر حملة/);
    assert.doesNotMatch(hub, /articles-hub-campaign-select/);
    assert.doesNotMatch(hub, /articles-hub-campaign/);
    assert.doesNotMatch(hub, /listSuperAdminActivationCampaignsRequest/);
    assert.doesNotMatch(hub, /createSuperAdminActivationCampaignRequest/);
    assert.doesNotMatch(hub, /تغيير الحملة|إدارة الحملة|إنشاء حملة/);
    assert.doesNotMatch(hub, /إعداد حملة المقالات/);
    assert.doesNotMatch(hub, /Freelancer Activation Engine/);
    assert.doesNotMatch(hub, /\bCampaign\b/);
  });

  it("uses single default article-operations setup without campaign selection", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    const api = read("services/api.js");
    assert.match(hub, /ensureSuperAdminArticleOperationsSetupRequest/);
    assert.match(hub, /articles-setup-init/);
    assert.match(hub, /تهيئة إعداد المقالات/);
    assert.match(hub, /إعداد المقالات/);
    assert.match(hub, /سيتم استخدام إعداد واحد لإدارة الصندوق/);
    assert.match(api, /article-operations\/setup/);
    assert.match(api, /article-operations\/plan-allocations/);
    assert.match(hub, /listSuperAdminActivationPlanAllocationsRequest\(null\)/);
    assert.match(hub, /previewSuperAdminActivationArticleReleaseRequest/);
    assert.match(hub, /runSuperAdminActivationArticleReleaseRequest/);
    assert.doesNotMatch(hub, /campaignId/);
  });

  it("released / inventory / funding panels reuse safe APIs", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /listSuperAdminActivationLiveArticlesRequest/);
    assert.match(hub, /MarketplaceArticleApplicationsPanel/);
    assert.match(hub, /listSuperAdminActivationArticleInventoryRequest/);
    assert.match(hub, /getSuperAdminActivationArticleFundRequest/);
    assert.match(hub, /articles-fund-hero/);
    assert.match(hub, /articles-publish-mode/);
    assert.match(hub, /articles-manual-publish-modal/);
    assert.match(hub, /تلقائي/);
    assert.match(hub, /يدوي/);
    assert.match(hub, /نشر يدوي/);
    assert.match(hub, /إضافة رصيد/);
    assert.match(hub, /خصم رصيد/);
  });

  it("legacy routes redirect into articles hub", () => {
    const legacy = read("pages/dashboard/SuperAdminMarketplaceArticlesPage.jsx");
    const mgmt = read("pages/dashboard/SuperAdminArticleManagementPage.jsx");
    assert.match(legacy, /\/dashboard\/super-admin\/articles/);
    assert.match(mgmt, /\/dashboard\/super-admin\/articles/);
  });

  it("activation page is no longer the primary article ops entry", () => {
    const page = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.doesNotMatch(page, /FreelancerActivationArticleOpsPanel/);
    assert.match(page, /\/dashboard\/super-admin\/articles/);
    assert.match(page, /فتح المقالات/);
  });

  it("release interval options render and auto release is supported", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /articles-release-interval/);
    assert.match(hub, /يوميًا/);
    assert.match(hub, /يوم بعد يوم/);
    assert.match(hub, /كل 3 أيام/);
    assert.match(hub, /articles-auto-release-supported/);
    assert.match(hub, /تشغيل إنزال مقالات المخزون/);
    assert.match(hub, /releaseIntervalDays/);
    assert.match(hub, /معاينة إنزال مخزون المقالات/);
    assert.match(hub, /articles-not-release-day-msg/);
    assert.match(hub, /ليس يوم إنزال حسب الجدولة الحالية/);
  });

  it("inventory archive appears instead of unsafe delete", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /أرشفة/);
    assert.match(hub, /لن يظهر هذا المقال في المخزون الجاهز/);
    assert.match(hub, /status:\s*"archived"/);
    assert.doesNotMatch(hub, />حذف</);
    assert.doesNotMatch(hub, /deleteSuperAdminActivationArticleInventory/);
  });

  it("inventory tab shows single OZ02 marketplace form; legacy activation UI gated off", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /articles-hub-panel-inventory/);
    assert.match(hub, /articles-marketplace-create-panel/);
    assert.match(hub, /MarketplaceArticlesAdminPanel inventoryHub/);
    assert.doesNotMatch(hub, /showCreateArticles/);
    assert.match(hub, /مخزون المقالات/);
    assert.match(
      hub,
      /أضف المقالات التي ستتاح للمستقلين، مع ربطها بصنف بلدازو ومتطلبات الخطة/,
    );
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*=\s*false/);
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*\?\s*\(/);
    assert.match(hub, /articles-inventory-add-form/);
    assert.match(hub, /مخزون التفعيل/);
    assert.match(hub, /draftMarketplaceInventory/);
    assert.match(hub, /تشغيل إنزال مقالات المخزون/);
  });
});
