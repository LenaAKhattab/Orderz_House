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
function readArticlesAr() {
  return JSON.parse(read("locales/ar/articles.json"));
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
    const ar = readArticlesAr();
    assert.doesNotMatch(hub, /DashboardPageHeader/);
    assert.doesNotMatch(hub, /title="المقالات"/);
    assert.match(hub, /hub\.subtitle/);
    assert.match(ar.hub.subtitle, /إدارة مقالات المستقلين، المخزون، التمويل، والتوزيع من مكان واحد/);
    assert.match(hub, /articles-hub-tabs/);
    assert.match(hub, /hub\.tabs\.overview/);
    assert.match(ar.hub.tabs.overview, /نظرة عامة/);
    assert.match(hub, /hub\.tabs\.released/);
    assert.match(ar.hub.tabs.released, /المقالات المنزلة/);
    assert.match(hub, /hub\.tabs\.inventory/);
    assert.match(ar.hub.tabs.inventory, /مخزون المقالات/);
    assert.match(hub, /hub\.tabs\.funding/);
    assert.match(ar.hub.tabs.funding, /صندوق التمويل/);
    assert.match(hub, /articles-hub-kpis/);
    assert.match(hub, /hub\.kpi\.fundBalance/);
    assert.match(ar.hub.kpi.fundBalance, /رصيد الصندوق/);
    assert.match(hub, /hub\.kpi\.inventoryCount/);
    assert.match(ar.hub.kpi.inventoryCount, /مقالات في المخزون/);
    assert.match(hub, /hub\.quick\.title/);
    assert.match(ar.hub.quick.title, /إجراءات سريعة/);
    assert.match(hub, /articles-hub-quick-actions/);
    assert.match(hub, /hub\.quick\.trackArticles/);
    assert.match(ar.hub.quick.trackArticles, /متابعة المقالات/);
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
    const ar = readArticlesAr();
    assert.match(hub, /ensureSuperAdminArticleOperationsSetupRequest/);
    assert.match(hub, /articles-setup-init/);
    assert.match(hub, /hub\.setup\.init/);
    assert.match(ar.hub.setup.init, /تهيئة إعداد المقالات/);
    assert.match(hub, /hub\.setup\.title/);
    assert.match(ar.hub.setup.title, /إعداد المقالات/);
    assert.match(hub, /hub\.setup\.helper/);
    assert.match(ar.hub.setup.helper, /سيتم استخدام إعداد واحد لإدارة الصندوق/);
    assert.match(api, /article-operations\/setup/);
    assert.match(api, /article-operations\/plan-allocations/);
    assert.match(hub, /listSuperAdminActivationPlanAllocationsRequest\(null\)/);
    assert.match(hub, /previewSuperAdminActivationArticleReleaseRequest/);
    assert.match(hub, /runSuperAdminActivationArticleReleaseRequest/);
    assert.doesNotMatch(hub, /campaignId/);
  });

  it("released / inventory / funding panels reuse safe APIs", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    const ar = readArticlesAr();
    assert.match(hub, /listSuperAdminActivationLiveArticlesRequest/);
    assert.match(hub, /MarketplaceArticleApplicationsPanel/);
    assert.match(hub, /listSuperAdminActivationArticleInventoryRequest/);
    assert.match(hub, /getSuperAdminActivationArticleFundRequest/);
    assert.match(hub, /articles-fund-hero/);
    assert.match(hub, /articles-publish-mode/);
    assert.match(hub, /articles-manual-publish-modal/);
    assert.match(hub, /publishMode\.auto|hub\.funding/);
    assert.match(ar.publishMode.auto, /تلقائي/);
    assert.match(ar.publishMode.manual, /يدوي/);
    assert.match(hub, /hub\.quick\.manualPublish/);
    assert.match(ar.hub.quick.manualPublish, /نشر يدوي/);
    assert.match(hub, /hub\.quick\.addBalance/);
    assert.match(ar.hub.quick.addBalance, /إضافة رصيد/);
    assert.match(hub, /hub\.quick\.withdrawBalance/);
    assert.match(ar.hub.quick.withdrawBalance, /خصم رصيد/);
  });

  it("legacy routes redirect into articles hub", () => {
    const legacy = read("pages/dashboard/SuperAdminMarketplaceArticlesPage.jsx");
    const mgmt = read("pages/dashboard/SuperAdminArticleManagementPage.jsx");
    assert.match(legacy, /\/dashboard\/super-admin\/articles/);
    assert.match(mgmt, /\/dashboard\/super-admin\/articles/);
  });

  it("activation page is no longer the primary article ops entry", () => {
    const page = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    const ar = JSON.parse(read("locales/ar/activation.json"));
    assert.doesNotMatch(page, /FreelancerActivationArticleOpsPanel/);
    assert.match(page, /\/dashboard\/super-admin\/articles/);
    assert.match(page, /activation\.page\.openArticles/);
    assert.match(ar.page.openArticles, /فتح المقالات/);
  });

  it("release interval options render and auto release is supported", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    const ar = readArticlesAr();
    assert.match(hub, /articles-release-interval/);
    assert.match(hub, /releaseInterval\.daily/);
    assert.match(ar.releaseInterval.daily, /يوميًا/);
    assert.match(hub, /releaseInterval\.everyOtherDay/);
    assert.match(ar.releaseInterval.everyOtherDay, /يوم بعد يوم/);
    assert.match(hub, /releaseInterval\.every3Days/);
    assert.match(ar.releaseInterval.every3Days, /كل 3 أيام/);
    assert.match(hub, /articles-auto-release-supported/);
    assert.match(hub, /hub\.funding\.runRelease/);
    assert.match(ar.hub.funding.runRelease, /تشغيل إنزال مقالات المخزون/);
    assert.match(hub, /releaseIntervalDays/);
    assert.match(hub, /hub\.funding\.previewRelease/);
    assert.match(ar.hub.funding.previewRelease, /معاينة إنزال مخزون المقالات/);
    assert.match(hub, /articles-not-release-day-msg/);
    assert.match(hub, /hub\.funding\.notReleaseDay/);
    assert.match(ar.hub.funding.notReleaseDay, /ليس يوم إنزال حسب الجدولة الحالية/);
  });

  it("inventory archive appears instead of unsafe delete", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    const ar = readArticlesAr();
    assert.match(hub, /hub\.inventory\.archive/);
    assert.match(ar.hub.inventory.archive, /أرشفة/);
    assert.match(hub, /hub\.inventory\.archiveConfirm/);
    assert.match(ar.hub.inventory.archiveConfirm, /لن يظهر هذا المقال في المخزون الجاهز/);
    assert.match(hub, /status:\s*"archived"/);
    assert.doesNotMatch(hub, />حذف</);
    assert.doesNotMatch(hub, /deleteSuperAdminActivationArticleInventory/);
  });

  it("inventory tab shows single OZ02 marketplace form; legacy activation UI gated off", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    const ar = readArticlesAr();
    assert.match(hub, /articles-hub-panel-inventory/);
    assert.match(hub, /articles-marketplace-create-panel/);
    assert.match(hub, /MarketplaceArticlesAdminPanel inventoryHub/);
    assert.doesNotMatch(hub, /showCreateArticles/);
    assert.match(hub, /hub\.tabs\.inventory/);
    assert.match(ar.hub.tabs.inventory, /مخزون المقالات/);
    assert.match(hub, /hub\.inventory\.helper/);
    assert.match(
      ar.hub.inventory.helper,
      /أضف المقالات التي ستتاح للمستقلين، مع ربطها بصنف بلدازو ومتطلبات الخطة/,
    );
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*=\s*false/);
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*\?\s*\(/);
    assert.match(hub, /articles-inventory-add-form/);
    assert.match(hub, /hub\.inventory\.legacyTitle/);
    assert.match(ar.hub.inventory.legacyTitle, /مخزون التفعيل/);
    assert.match(hub, /draftMarketplaceInventory/);
    assert.match(hub, /hub\.funding\.runRelease/);
  });
});
