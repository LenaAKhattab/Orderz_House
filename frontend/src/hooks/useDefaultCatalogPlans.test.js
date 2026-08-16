/**
 * Admin-controlled default plan catalog — frontend wiring.
 * Run: node --test src/hooks/useDefaultCatalogPlans.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import {
  PLAN_CATALOG,
  DEFAULT_PLAN_CATALOG_INITIAL_VALUE,
  isPlanCatalog,
} from "../constants/planCatalogs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("plan catalog constants", () => {
  it("uses stable ids matching the three existing Admin systems", () => {
    assert.equal(PLAN_CATALOG.MAIN_PLANS, "main_plans");
    assert.equal(PLAN_CATALOG.PAGE_PLANS, "page_plans");
    assert.equal(PLAN_CATALOG.MARKETPLACE_PLANS, "marketplace_plans");
    assert.equal(DEFAULT_PLAN_CATALOG_INITIAL_VALUE, PLAN_CATALOG.MARKETPLACE_PLANS);
    assert.equal(isPlanCatalog("الباقات الرئيسية"), false);
    assert.equal(isPlanCatalog("marketplace_plans"), true);
  });
});

describe("public /plans and freelancer plans resolve from one setting", () => {
  it("usePlansPage reads the default catalog resolver instead of a hardcoded catalog", () => {
    const src = read("hooks/usePlansPage.js");
    assert.match(src, /useDefaultCatalogPlans/);
    assert.match(src, /enabled:\s*!slug/);
    assert.match(src, /getPublicPlanPageBySlugRequest/);
    assert.match(src, /legacy_page_package/);
    assert.doesNotMatch(src, /listPublicMarketplaceMembershipPlansRequest/);
  });

  it("useDefaultCatalogPlans fetches setting then the selected existing catalog", () => {
    const hook = read("hooks/useDefaultCatalogPlans.js");
    const fetch = read("lib/planCatalog/fetchPlansForCatalog.js");
    assert.match(hook, /fetchResolvedDefaultCatalogPlans/);
    assert.match(fetch, /getPublicDefaultPlanCatalogRequest/);
    assert.match(fetch, /listPublicMarketplaceMembershipPlansRequest/);
    assert.match(fetch, /listPublicPlansRequest/);
    assert.match(fetch, /listPublicSpecialPagePlansRequest/);
    assert.match(fetch, /INVALID_DEFAULT_PLAN_CATALOG/);
    assert.doesNotMatch(fetch, /mergeApiPlansWithCatalog/);
  });

  it("Freelancer plans page uses the same default catalog hook", () => {
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.match(page, /useFreelancerPlansScreen/);
    assert.match(page, /fetchPublicPlans:\s*false/);
    assert.doesNotMatch(page, /listPublicPlansRequest/);
  });

  it("useDefaultCatalogPlans does not force-refresh into a full skeleton when cache exists", () => {
    const hook = read("hooks/useDefaultCatalogPlans.js");
    assert.match(hook, /refreshing/);
    assert.match(hook, /catalogResolved/);
    assert.match(hook, /generationRef/);
    assert.doesNotMatch(hook, /force:\s*true/);
  });

  it("default catalog resolver can prefetch the last known catalog in parallel", () => {
    const fetch = read("lib/planCatalog/fetchPlansForCatalog.js");
    assert.match(fetch, /readLastDefaultCatalog|LAST_DEFAULT_CATALOG_KEY/);
    assert.match(fetch, /Promise\.all/);
    assert.match(fetch, /prefetch/);
  });

  it("setting failure does not silently fall back to legacy GET /plans", () => {
    const hook = read("hooks/useDefaultCatalogPlans.js");
    assert.match(hook, /setPlans\(\[\]\)/);
    assert.match(hook, /setError/);
    assert.doesNotMatch(hook, /listPublicPlansRequest/);
    const plansPage = read("pages/Plans.jsx");
    assert.match(plansPage, /auth-form-error/);
    assert.match(plansPage, /loading \|\| !error/);
  });

  it("Training toggle remains independent of the three Admin catalogs", () => {
    const page = read("pages/Plans.jsx");
    assert.match(page, /PlansCategoryToggle/);
    assert.match(page, /TrainingPlansSection/);
    assert.match(page, /PLANS_CATEGORY\.TRAINING/);
    const training = read("constants/trainingPlansCatalog.js");
    assert.match(training, /Separate from Marketplace Membership/);
  });

  it("marketplace CTA stays on membership flow; no Work Token UI", () => {
    const card = read("components/plans/PlanCard.jsx");
    const fetch = read("lib/planCatalog/fetchPlansForCatalog.js");
    assert.match(card, /isMarketplaceMembership/);
    assert.match(card, /\/dashboard\/freelancer\/plans/);
    assert.match(card, /plans\.cta\.viewMembership/);
    assert.doesNotMatch(card, /createFreelancerSubscriptionCheckoutRequest/);
    assert.match(fetch, /mapMarketplaceMembershipPlansForPublicPlans/);
    assert.doesNotMatch(fetch, /includedTokensPerCycle|Work Token/i);
    const freelancer = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.doesNotMatch(freelancer, /FreelancerWorkTokenWalletCard|Work Token/i);
  });
});

describe("Super Admin default catalog button UX", () => {
  it("uses a per-catalog set-as-default button with confirmation and empty-catalog block", () => {
    const sel = read("admin/plans/DefaultPlanCatalogSelector.jsx");
    const page = read("pages/dashboard/SuperAdminPlansPage.jsx");
    const marketplace = read("pages/dashboard/SuperAdminMarketplacePlansPage.jsx");
    assert.match(sel, /function DefaultPlanCatalogControl/);
    assert.match(sel, /تعيين كافتراضي/);
    assert.match(sel, /DEFAULT_PLAN_CATALOG_TAB_BADGE/);
    assert.match(sel, /BADGE_AR = DEFAULT_PLAN_CATALOG_TAB_BADGE\.ar/);
    assert.match(sel, /عرض هذه الباقات للمستخدمين/);
    assert.doesNotMatch(sel, /oh-sapl-default-control__helper/);
    assert.doesNotMatch(sel, /الافتراضي حاليًا/);
    assert.match(sel, /تعيين هذه الباقات كافتراضية؟/);
    assert.match(sel, /صفحة الباقات العامة ولوحة المستقل/);
    assert.match(sel, /لا يمكن تعيين هذا القسم كافتراضي لأنه لا يحتوي على باقات مفعلة/);
    assert.match(sel, /updateAdminDefaultPlanCatalogRequest/);
    assert.match(sel, /useAdminDefaultPlanCatalog/);
    assert.match(sel, /applyPayload/);
    assert.doesNotMatch(sel, /getAdminDefaultPlanCatalogRequest/);
    const ctx = read("admin/plans/DefaultPlanCatalogAdminContext.jsx");
    assert.match(ctx, /getAdminDefaultPlanCatalogRequest/);
    assert.match(ctx, /DefaultPlanCatalogAdminProvider/);
    assert.match(sel, /invalidatePublicPlansCache/);
    assert.match(sel, /تم تعيين "/);
    assert.doesNotMatch(sel, /data-default-plan-catalog-selector/);
    assert.doesNotMatch(sel, /role="radiogroup"/);
    assert.doesNotMatch(sel, /DashboardSection/);
    assert.doesNotMatch(page, /<DefaultPlanCatalogSelector/);
    assert.doesNotMatch(page, /DefaultCatalogTabBadge/);
    assert.doesNotMatch(page, /الباقات الافتراضية للمستخدمين/);
    assert.match(page, /PlanCatalogActionToolbar/);
    assert.match(page, /PlanCatalogAdminShell/);
    assert.match(page, /catalogIdForAdminSection/);
    assert.match(page, /PLAN_ADMIN_SECTION\.PAGES/);
    assert.match(marketplace, /PlanCatalogActionToolbar/);
    assert.match(marketplace, /PlanCatalogAdminShell/);
    assert.match(marketplace, /PLAN_CATALOG\.MARKETPLACE_PLANS/);
    assert.doesNotMatch(marketplace, /DefaultCatalogTabBadge/);
    assert.doesNotMatch(page, /isSuperAdmin\s*\?\s*\(/);
    assert.doesNotMatch(page, /isSuperAdminUser/);
  });

  it("non-default catalogs remain independently manageable", () => {
    const page = read("pages/dashboard/SuperAdminPlansPage.jsx");
    assert.match(page, /listAdminPlansRequest/);
    assert.match(page, /filterPlansByAdminSection/);
    assert.doesNotMatch(page, /listAdminMarketplaceMembershipPlansRequest/);
    const marketplace = read("pages/dashboard/SuperAdminMarketplacePlansPage.jsx");
    const copy = read("admin/plans/planMetricTerminology.js");
    assert.match(marketplace, /listAdminMarketplaceMembershipPlansRequest/);
    assert.match(marketplace, /SECTION_COPY\.marketplace/);
    assert.match(copy, /إدارة باقات العمل/);
    assert.match(copy, /Work membership plans/);
  });

  it("uses one shared catalog shell and navigation for all three admin pages", () => {
    const nav = read("admin/plans/planCatalogNav.js");
    const tabs = read("admin/plans/PlanCatalogNavigation.jsx");
    const shell = read("admin/plans/PlanCatalogAdminShell.jsx");
    const page = read("pages/dashboard/SuperAdminPlansPage.jsx");
    const marketplace = read("pages/dashboard/SuperAdminMarketplacePlansPage.jsx");
    const labels = read("constants/planCatalogs.js");
    assert.match(nav, /PLAN_CATALOG_NAV/);
    assert.match(labels, /الباقات الرئيسية/);
    assert.match(labels, /باقات الصفحات/);
    assert.match(labels, /باقات العمل/);
    assert.match(nav, /باقات التدريب/);
    assert.match(nav, /\/dashboard\/super-admin\/plans\?section=core/);
    assert.match(nav, /\/dashboard\/super-admin\/plans\?section=pages/);
    assert.match(nav, /\/dashboard\/super-admin\/marketplace-plans/);
    assert.match(nav, /\/dashboard\/super-admin\/training-packages/);
    assert.match(nav, /إدارة الباقات والاشتراكات/);
    assert.match(shell, /PLAN_CATALOG_ADMIN_TITLE/);
    assert.match(shell, /PlanCatalogNavigation/);
    assert.match(shell, /dashboard\.breadcrumbs\.managePlans/);
    assert.match(tabs, /orderPlanCatalogNav/);
    assert.match(tabs, /PLAN_CATALOG_NAV/);
    assert.match(tabs, /معروض الآن/);
    assert.match(tabs, /data-shown-now-badge/);
    assert.match(tabs, /aria-selected=\{selected\}/);
    assert.match(shell, /DefaultPlanCatalogAdminProvider/);
    assert.match(page, /PlanCatalogAdminShell/);
    assert.match(marketplace, /PlanCatalogAdminShell/);
    assert.doesNotMatch(page, /oh-sapl-section-toggle__tab/);
    assert.doesNotMatch(marketplace, /oh-sapl-section-toggle__tab/);
    assert.doesNotMatch(marketplace, /كل أقسام الباقات/);
    assert.doesNotMatch(page, /معروض الآن/);
    assert.doesNotMatch(marketplace, /معروض الآن/);
    assert.match(page, /PlanCatalogActionToolbar/);
    assert.match(marketplace, /PlanCatalogActionToolbar/);
    const toolbar = read("admin/plans/PlanCatalogActionToolbar.jsx");
    assert.match(toolbar, /oh-sapl-section-heading-actions/);
    assert.match(toolbar, /oh-sapl-action-toolbar__create/);
    assert.match(toolbar, /DefaultPlanCatalogControl/);
    assert.match(toolbar, /PublicPlansContentAdminControl/);
    const createIdx = toolbar.indexOf("oh-sapl-action-toolbar__create");
    const defaultIdx = toolbar.indexOf("<DefaultPlanCatalogControl");
    const contentIdx = toolbar.indexOf("<PublicPlansContentAdminControl");
    assert.ok(createIdx > 0 && createIdx < defaultIdx && defaultIdx < contentIdx);
  });

  it("uses shaped skeletons instead of plain loading copy", () => {
    const sel = read("admin/plans/DefaultPlanCatalogSelector.jsx");
    const skeletons = read("admin/plans/PlanCatalogSkeletons.jsx");
    const page = read("pages/dashboard/SuperAdminPlansPage.jsx");
    const marketplace = read("pages/dashboard/SuperAdminMarketplacePlansPage.jsx");
    const css = read("admin/plans/super-admin-plans.css");
    assert.match(sel, /DefaultPlanControlSkeleton/);
    assert.match(sel, /تعذر تحميل بيانات الباقات/);
    assert.match(sel, /إعادة المحاولة/);
    assert.doesNotMatch(sel, /جارٍ التحميل|Loading…/);
    assert.match(skeletons, /function DefaultPlanControlSkeleton/);
    assert.match(skeletons, /function PlanCatalogNavSkeleton/);
    assert.match(skeletons, /function PlanCardSkeleton/);
    assert.match(skeletons, /function PlanCardsGridSkeleton/);
    assert.match(skeletons, /oh-sapl-card--skeleton/);
    const tabs = read("admin/plans/PlanCatalogNavigation.jsx");
    assert.match(tabs, /PlanCatalogNavSkeleton/);
    const card = read("admin/plans/AdminPlanCard.jsx");
    const marketplaceCard = read("admin/marketplaceMembership/MarketplaceMembershipPlanCard.jsx");
    assert.doesNotMatch(card, /معروض الآن/);
    assert.doesNotMatch(marketplaceCard, /معروض الآن/);
    assert.match(page, /PlanCardsGridSkeleton/);
    assert.match(marketplace, /PlanCardsGridSkeleton/);
    assert.doesNotMatch(page, /DashboardLoadingState|AdminInlineGridSkeleton|جارٍ تحميل الباقات/);
    assert.doesNotMatch(marketplace, /DashboardLoadingState/);
    assert.match(css, /oh-sapl-skel-pulse/);
    assert.match(css, /oh-sapl-default-control__skel/);
    assert.match(css, /oh-sapl-action-toolbar__tertiary/);
    assert.doesNotMatch(css, /oh-sapl-default-control__helper/);
    assert.match(css, /\.oh-sapl-section-heading-actions \.btn[\s\S]*min-height: 36px/);
  });
});
