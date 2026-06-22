import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";
import {
  createPlanRequest,
  deletePlanRequest,
  getSuperadminDashboardIntelligenceSubscriptionsRequest,
  listAdminPlanPagesRequest,
  listAdminPlansRequest,
  updatePlanRequest,
} from "../../services/api";
import AdminPlanCard from "../../admin/plans/AdminPlanCard";
import PlanCreateModal from "../../admin/plans/PlanCreateModal";
import PlanEditModal from "../../admin/plans/PlanEditModal";
import { filterPlans } from "../../admin/plans/planDisplayUtils";
import {
  computePlanBadges,
  computePortfolioInsightStrip,
  mergePlansWithPerformanceStats,
  normalizeSubscriptionsIntelligenceResponse,
  sortPlansForDisplay,
  SORT_MODES,
} from "../../admin/plans/planPerformanceUtils";
import PlanPortfolioActionBar from "../../admin/plans/PlanPortfolioActionBar";
import {
  computePortfolioActionChips,
  computePortfolioSummarySentence,
  DECISION_FILTERS,
  enrichPlansWithPortfolioActions,
  filterPlansByDecision,
} from "../../admin/plans/planPortfolioActions";
import { getInitialPlanFormState } from "../../admin/plans/planFormConstants";
import {
  PAGE_COPY,
  SECTION_COPY,
  SORT_LABELS,
} from "../../admin/plans/planMetricTerminology";
import {
  PLAN_ADMIN_SECTION,
  buildPlanPagesIndex,
  filterPlansByAdminSection,
  getDefaultPlanPage,
  getSpecialPlanPages,
  parsePlanAdminSection,
} from "../../admin/plans/planAdminSections";
import { useTranslation } from "../../i18n/LanguageProvider";
import { suggestPlanInternalName } from "../../admin/plans/planNameAuto";
import { canSubmitCreate, normalizeCreatePayload } from "../../admin/plans/planPayloadUtils";
import {
  buildPlanReorderPatches,
  getPlanDisplayOrderMeta,
  plansListFiltersAreDefault,
} from "../../admin/plans/planOrderUtils";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import "../../admin/plans/super-admin-plans.css";

function errorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  return apiMsg || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function PlansEmptyIcon() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path d="M16 28h16M20 20h8M18 32h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

const SuperAdminPlansPage = () => {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = parsePlanAdminSection(searchParams.get("section"));
  const selectedPageId = activeSection === PLAN_ADMIN_SECTION.PAGES ? searchParams.get("pageId") || "" : "";
  const [planPages, setPlanPages] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subscriptionIntel, setSubscriptionIntel] = useState(null);
  const [intelError, setIntelError] = useState("");
  const [reservedPlanNames, setReservedPlanNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [selfPurchaseFilter, setSelfPurchaseFilter] = useState("all");
  const [sortMode, setSortMode] = useState(SORT_MODES.display);
  const [decisionFilter, setDecisionFilter] = useState(DECISION_FILTERS.all);
  const [reorderingPlanId, setReorderingPlanId] = useState(null);

  const [form, setForm] = useState(getInitialPlanFormState);
  const [editPlan, setEditPlan] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const canCreate = useMemo(() => canSubmitCreate(form), [form]);

  const generatedInternalName = useMemo(() => {
    if (form.title.trim().length < 2) return "";
    return suggestPlanInternalName(form.title, reservedPlanNames);
  }, [form.title, reservedPlanNames]);

  const statsFailed = Boolean(intelError);

  const planPagesById = useMemo(() => buildPlanPagesIndex(planPages), [planPages]);
  const specialPlanPages = useMemo(() => getSpecialPlanPages(planPages), [planPages]);
  const defaultPlanPage = useMemo(() => getDefaultPlanPage(planPages), [planPages]);

  const sectionPlans = useMemo(
    () => filterPlansByAdminSection(plans, activeSection, planPagesById),
    [plans, activeSection, planPagesById],
  );

  const scopedPlans = useMemo(() => {
    if (activeSection !== PLAN_ADMIN_SECTION.PAGES || !selectedPageId) return sectionPlans;
    return sectionPlans.filter((plan) => String(plan.planPageId) === String(selectedPageId));
  }, [sectionPlans, activeSection, selectedPageId]);

  const sectionCopy = SECTION_COPY[activeSection];
  const sectionLabel = isEn ? sectionCopy.en : sectionCopy.ar;
  const sectionHint = isEn ? sectionCopy.hintEn : sectionCopy.hintAr;

  const { plans: plansWithStats, statsAvailable, platformContext } = useMemo(() => {
    const merged = mergePlansWithPerformanceStats(scopedPlans, subscriptionIntel, { statsFailed });
    if (!statsFailed && merged.statsAvailable && activeSection === PLAN_ADMIN_SECTION.CORE) {
      enrichPlansWithPortfolioActions(merged.plans, merged.platformContext);
    }
    return merged;
  }, [scopedPlans, subscriptionIntel, statsFailed, activeSection]);

  const portfolioActionChips = useMemo(
    () => (statsAvailable && !statsFailed ? computePortfolioActionChips(plansWithStats, platformContext) : []),
    [plansWithStats, statsAvailable, statsFailed, platformContext],
  );

  const portfolioSummarySentence = useMemo(
    () => (statsAvailable && !statsFailed ? computePortfolioSummarySentence(plansWithStats, platformContext) : null),
    [plansWithStats, statsAvailable, statsFailed, platformContext],
  );

  const planBadges = useMemo(() => computePlanBadges(plansWithStats), [plansWithStats]);

  const portfolioStrip = useMemo(
    () =>
      computePortfolioInsightStrip(plansWithStats, {
        statsAvailable,
        statsFailed,
        platformContext,
      }),
    [plansWithStats, statsAvailable, statsFailed, platformContext],
  );

  const handleActionChipClick = useCallback((key) => {
    setDecisionFilter((prev) => (prev === key ? DECISION_FILTERS.all : key));
  }, []);

  const filteredPlans = useMemo(() => {
    const filtered = filterPlans(plansWithStats, {
      search,
      status: statusFilter,
      visibility: visibilityFilter,
      selfPurchase: selfPurchaseFilter,
    });
    const byDecision = filterPlansByDecision(filtered, decisionFilter, platformContext);
    return sortPlansForDisplay(byDecision, sortMode);
  }, [
    plansWithStats,
    search,
    statusFilter,
    visibilityFilter,
    selfPurchaseFilter,
    decisionFilter,
    platformContext,
    sortMode,
  ]);

  const canReorderPlans = useMemo(
    () =>
      sortMode === SORT_MODES.display &&
      plansListFiltersAreDefault({
        search,
        statusFilter,
        visibilityFilter,
        selfPurchaseFilter,
        decisionFilter,
      }),
    [sortMode, search, statusFilter, visibilityFilter, selfPurchaseFilter, decisionFilter],
  );

  const refresh = useCallback(async () => {
    setError("");
    setIntelError("");
    setLoading(true);
    try {
      const [visibleRes, allRes, intelRes, pagesRes] = await Promise.all([
        listAdminPlansRequest(false),
        listAdminPlansRequest(true),
        getSuperadminDashboardIntelligenceSubscriptionsRequest().catch((err) => {
          setIntelError(errorMessage(err));
          return null;
        }),
        listAdminPlanPagesRequest().catch(() => null),
      ]);
      setPlans(visibleRes?.data?.plans || []);
      const allPlans = allRes?.data?.plans || [];
      setReservedPlanNames(allPlans.map((p) => p.name).filter(Boolean));
      setPlanPages(pagesRes?.data?.pages || []);
      if (intelRes) {
        const { intel, sectionError } = normalizeSubscriptionsIntelligenceResponse(intelRes);
        setSubscriptionIntel(intel);
        if (sectionError) {
          setIntelError(typeof sectionError === "string" ? sectionError : "تعذر تحميل بيانات الاشتراكات.");
        }
      } else {
        setSubscriptionIntel(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedPlanPage = useMemo(
    () => specialPlanPages.find((page) => String(page.id) === String(selectedPageId)) || null,
    [specialPlanPages, selectedPageId],
  );

  const setActiveSection = (nextSection) => {
    const next = parsePlanAdminSection(nextSection);
    const params = new URLSearchParams(searchParams);
    params.set("section", next);
    if (next === PLAN_ADMIN_SECTION.CORE) {
      params.delete("pageId");
    }
    setSearchParams(params, { replace: true });
  };

  const handlePageFilterChange = (event) => {
    const next = event.target.value;
    const params = new URLSearchParams(searchParams);
    params.set("section", PLAN_ADMIN_SECTION.PAGES);
    if (!next) {
      params.delete("pageId");
    } else {
      params.set("pageId", next);
    }
    setSearchParams(params, { replace: true });
  };

  const openCreateModal = () => {
    const initial = getInitialPlanFormState();
    if (activeSection === PLAN_ADMIN_SECTION.PAGES) {
      initial.planPageId = selectedPageId || String(specialPlanPages[0]?.id || "");
    } else if (defaultPlanPage?.id) {
      initial.planPageId = String(defaultPlanPage.id);
      initial.subscriptionPlanId = "";
    }
    setForm(initial);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setForm(getInitialPlanFormState());
  };

  const createPlan = async () => {
    setError("");
    setSubmitting(true);
    try {
      const targetPageId =
        activeSection === PLAN_ADMIN_SECTION.PAGES
          ? selectedPageId || form.planPageId || specialPlanPages[0]?.id || null
          : defaultPlanPage?.id || form.planPageId || null;

      if (activeSection === PLAN_ADMIN_SECTION.PAGES && !targetPageId) {
        setError(isEn ? "Select a plan page before creating a page plan." : "اختر صفحة باقات قبل إنشاء باقة للصفحات.");
        return;
      }

      await createPlanRequest(
        normalizeCreatePayload(form, reservedPlanNames, scopedPlans, {
          planPageId: targetPageId,
        }),
      );
      setForm(getInitialPlanFormState());
      setCreateModalOpen(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const setPlanActive = async (plan, nextActive) => {
    if (Boolean(plan.isActive) === Boolean(nextActive)) return;
    setError("");
    setSubmitting(true);
    try {
      await updatePlanRequest(plan.id, { isActive: Boolean(nextActive) });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const softDelete = async (plan) => {
    if (!window.confirm(`حذف الباقة «${plan.title}»؟ لا يمكن التراجع من الواجهة.`)) return;
    setError("");
    setSubmitting(true);
    try {
      await deletePlanRequest(plan.id);
      if (editPlan?.id === plan.id) setEditPlan(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async (payload) => {
    if (!editPlan) return;
    setError("");
    setSubmitting(true);
    try {
      await updatePlanRequest(editPlan.id, payload);
      setEditPlan(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (plan) => setEditPlan(plan);

  const movePlanInDisplayOrder = useCallback(
    async (plan, direction) => {
      const patches = buildPlanReorderPatches(plansWithStats, plan.id, direction);
      if (!patches?.length) return;

      setError("");
      setReorderingPlanId(String(plan.id));
      try {
        await Promise.all(patches.map((patch) => updatePlanRequest(patch.id, { sortOrder: patch.sortOrder })));
        await refresh();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setReorderingPlanId(null);
      }
    },
    [plansWithStats, refresh],
  );

  return (
    <DashboardShell className="oh-sapl-page">
      <DashboardPageHeader
        className="oh-sapl-header oh-sapl-header--compact"
        eyebrow="لوحة المدير الأعلى"
        title={PAGE_COPY.title}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.plans")}
        actions={
          <div className="oh-sapl-header-actions">
            <Button type="button" variant="secondary" as={Link} to="/dashboard/super-admin/plan-pages">
              صفحات الباقات
            </Button>
            <Button type="button" className="oh-sapl-header-cta" onClick={openCreateModal}>
              + إنشاء باقة جديدة
            </Button>
          </div>
        }
      />

      {planPages.length > 0 ? (
        <div className="oh-sapl-section-toggle">
          <div className="oh-sapl-section-toggle__tabs" role="tablist" aria-label={isEn ? "Plan sections" : "أقسام الباقات"}>
            <button
              type="button"
              role="tab"
              className="oh-sapl-section-toggle__tab"
              aria-selected={activeSection === PLAN_ADMIN_SECTION.CORE}
              onClick={() => setActiveSection(PLAN_ADMIN_SECTION.CORE)}
            >
              {isEn ? SECTION_COPY.core.en : SECTION_COPY.core.ar}
            </button>
            <button
              type="button"
              role="tab"
              className="oh-sapl-section-toggle__tab"
              aria-selected={activeSection === PLAN_ADMIN_SECTION.PAGES}
              onClick={() => setActiveSection(PLAN_ADMIN_SECTION.PAGES)}
            >
              {isEn ? SECTION_COPY.pages.en : SECTION_COPY.pages.ar}
            </button>
          </div>
          <p className="oh-sapl-section-toggle__hint">{sectionHint}</p>
        </div>
      ) : null}

      {activeSection === PLAN_ADMIN_SECTION.PAGES && specialPlanPages.length > 0 ? (
        <div className="oh-sapl-page-filter-inline">
          <label>
            <span>{isEn ? SECTION_COPY.pages.pageFilterLabelEn : SECTION_COPY.pages.pageFilterLabelAr}</span>
            <select value={selectedPageId} onChange={handlePageFilterChange}>
              <option value="">{isEn ? SECTION_COPY.pages.pageFilterAllEn : SECTION_COPY.pages.pageFilterAllAr}</option>
              {specialPlanPages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                  {page.slug ? ` (/plans/${page.slug})` : ""}
                </option>
              ))}
            </select>
          </label>
          {selectedPlanPage ? (
            <p className="oh-sapl-section-toggle__hint" style={{ margin: 0 }}>
              {isEn
                ? `Showing plans for: ${selectedPlanPage.title}`
                : `تعرض باقات صفحة: ${selectedPlanPage.title}`}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <DashboardErrorState
          message={error}
          actions={
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : null}

      {!loading && activeSection === PLAN_ADMIN_SECTION.CORE && portfolioStrip.items.length > 0 ? (
        <section className="oh-sapl-portfolio-strip" aria-label={PAGE_COPY.portfolioStripAria}>
          {portfolioStrip.items.map((item) => (
            <div key={item.key} className={`oh-sapl-portfolio-strip__item${item.key === "risk" ? " oh-sapl-portfolio-strip__item--risk" : ""}`}>
              <span className="oh-sapl-portfolio-strip__label">{item.label}</span>
              <span className="oh-sapl-portfolio-strip__value">{item.value}</span>
            </div>
          ))}
        </section>
      ) : null}

      <DashboardSection title={sectionLabel} className="oh-sapl-section--plans oh-sapl-section--tight">
        {!loading && activeSection === PLAN_ADMIN_SECTION.CORE && statsAvailable ? (
          <PlanPortfolioActionBar
            chips={portfolioActionChips}
            summarySentence={portfolioSummarySentence}
            decisionFilter={decisionFilter}
            onDecisionFilterChange={setDecisionFilter}
            onChipClick={handleActionChipClick}
            disabled={loading}
          />
        ) : null}

        <div className="oh-sapl-toolbar-compact" role="search">
          <input
            type="search"
            className="oh-sapl-toolbar-compact__search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بعنوان الباقة…"
            disabled={loading}
            aria-label="بحث"
          />
          <select
            className="oh-sapl-toolbar-compact__select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={loading}
            aria-label="الحالة"
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشطة</option>
            <option value="inactive">معطلة</option>
          </select>
          <select
            className="oh-sapl-toolbar-compact__select"
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            disabled={loading}
            aria-label="الظهور"
          >
            <option value="all">كل الظهور</option>
            <option value="visible">ظاهرة</option>
            <option value="hidden">مخفية</option>
          </select>
          <select
            className="oh-sapl-toolbar-compact__select"
            value={selfPurchaseFilter}
            onChange={(e) => setSelfPurchaseFilter(e.target.value)}
            disabled={loading}
            aria-label="الشراء الذاتي"
          >
            <option value="all">الشراء الذاتي</option>
            <option value="allowed">متاح</option>
            <option value="blocked">غير متاح</option>
          </select>
          <select
            className="oh-sapl-toolbar-compact__select oh-sapl-toolbar-compact__sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            disabled={loading}
            aria-label="ترتيب العرض"
          >
            <option value={SORT_MODES.display}>{SORT_LABELS.display}</option>
            <option value={SORT_MODES.revenue}>{SORT_LABELS.revenue}</option>
            <option value={SORT_MODES.subscribers}>{SORT_LABELS.subscribers}</option>
            <option value={SORT_MODES.active}>{SORT_LABELS.active}</option>
            <option value={SORT_MODES.attention}>{SORT_LABELS.attention}</option>
          </select>
          <StatusBadge tone="neutral" className="oh-sapl-toolbar-compact__count">
            {loading ? "…" : `${filteredPlans.length} / ${scopedPlans.length}`}
          </StatusBadge>
        </div>

        {!canReorderPlans && sortMode !== SORT_MODES.display ? (
          <p className="oh-sapl-order-hint oh-sapl-order-hint--muted m-0">
            لترتيب الباقات، اختر «ترتيب الظهور» من قائمة الترتيب.
          </p>
        ) : !canReorderPlans &&
          !plansListFiltersAreDefault({
            search,
            statusFilter,
            visibilityFilter,
            selfPurchaseFilter,
            decisionFilter,
          }) ? (
          <p className="oh-sapl-order-hint oh-sapl-order-hint--muted m-0">
            امسح البحث والفلاتر لإظهار أسهم ترتيب الباقات.
          </p>
        ) : null}

        {loading ? (
          <DashboardLoadingState label="جارٍ تحميل الباقات…">
            <AdminInlineGridSkeleton count={4} />
          </DashboardLoadingState>
        ) : null}

        {!loading && scopedPlans.length === 0 ? (
          <DashboardEmptyState
            title={isEn ? sectionCopy.emptyTitleEn : sectionCopy.emptyTitleAr}
            description={isEn ? sectionCopy.emptyDescEn : sectionCopy.emptyDescAr}
            icon={<PlansEmptyIcon />}
            actions={
              <Button type="button" onClick={openCreateModal}>
                {isEn ? "Create plan" : "إنشاء باقة جديدة"}
              </Button>
            }
          />
        ) : null}

        {!loading && scopedPlans.length > 0 && filteredPlans.length === 0 ? (
          <DashboardEmptyState title="لا توجد نتائج" description="جرّب تغيير البحث أو عوامل التصفية." />
        ) : null}

        {!loading && filteredPlans.length > 0 ? (
          <div className="oh-sapl-cards">
            {filteredPlans.map((p) => {
              const orderMeta = getPlanDisplayOrderMeta(plansWithStats, p.id);
              const reorderBusy = reorderingPlanId != null;
              return (
              <AdminPlanCard
                key={p.id}
                plan={p}
                badge={planBadges.get(String(p.id)) || null}
                platformContext={platformContext}
                submitting={submitting}
                showOrderControls={canReorderPlans}
                canMoveUp={orderMeta.canMoveUp}
                canMoveDown={orderMeta.canMoveDown}
                reorderBusy={reorderBusy}
                onMoveUp={() => void movePlanInDisplayOrder(p, "up")}
                onMoveDown={() => void movePlanInDisplayOrder(p, "down")}
                onActiveChange={setPlanActive}
                onEdit={() => openEdit(p)}
                onDelete={() => void softDelete(p)}
              />
            );
            })}
          </div>
        ) : null}
      </DashboardSection>

      <PlanCreateModal
        open={createModalOpen}
        submitting={submitting}
        form={form}
        setForm={setForm}
        generatedInternalName={generatedInternalName}
        canCreate={canCreate}
        onClose={closeCreateModal}
        onCreate={createPlan}
        onReset={resetForm}
      />

      <PlanEditModal
        plan={editPlan}
        open={Boolean(editPlan)}
        submitting={submitting}
        onClose={() => setEditPlan(null)}
        onSave={saveEdit}
      />
    </DashboardShell>
  );
};

export default SuperAdminPlansPage;
