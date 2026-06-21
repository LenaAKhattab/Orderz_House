import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";
import {
  createPlanRequest,
  deletePlanRequest,
  getSuperadminDashboardIntelligenceSubscriptionsRequest,
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
  SORT_LABELS,
} from "../../admin/plans/planMetricTerminology";
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

  const { plans: plansWithStats, statsAvailable, platformContext } = useMemo(() => {
    const merged = mergePlansWithPerformanceStats(plans, subscriptionIntel, { statsFailed });
    if (!statsFailed && merged.statsAvailable) {
      enrichPlansWithPortfolioActions(merged.plans, merged.platformContext);
    }
    return merged;
  }, [plans, subscriptionIntel, statsFailed]);

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
      const [visibleRes, allRes, intelRes] = await Promise.all([
        listAdminPlansRequest(false),
        listAdminPlansRequest(true),
        getSuperadminDashboardIntelligenceSubscriptionsRequest().catch((err) => {
          setIntelError(errorMessage(err));
          return null;
        }),
      ]);
      setPlans(visibleRes?.data?.plans || []);
      const allPlans = allRes?.data?.plans || [];
      setReservedPlanNames(allPlans.map((p) => p.name).filter(Boolean));
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

  const openCreateModal = () => {
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
      await createPlanRequest(normalizeCreatePayload(form, reservedPlanNames, plans));
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
          <Button type="button" className="oh-sapl-header-cta" onClick={openCreateModal}>
            + إنشاء باقة جديدة
          </Button>
        }
      />

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

      {!loading && portfolioStrip.items.length > 0 ? (
        <section className="oh-sapl-portfolio-strip" aria-label={PAGE_COPY.portfolioStripAria}>
          {portfolioStrip.items.map((item) => (
            <div key={item.key} className={`oh-sapl-portfolio-strip__item${item.key === "risk" ? " oh-sapl-portfolio-strip__item--risk" : ""}`}>
              <span className="oh-sapl-portfolio-strip__label">{item.label}</span>
              <span className="oh-sapl-portfolio-strip__value">{item.value}</span>
            </div>
          ))}
        </section>
      ) : null}

      <DashboardSection title="الباقات" className="oh-sapl-section--plans oh-sapl-section--tight">
        {!loading && statsAvailable ? (
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
            {loading ? "…" : `${filteredPlans.length} / ${plans.length}`}
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

        {!loading && plans.length === 0 ? (
          <DashboardEmptyState
            title="لا توجد باقات بعد"
            description="أنشئ أول باقة من زر «إنشاء باقة جديدة»."
            icon={<PlansEmptyIcon />}
            actions={
              <Button type="button" onClick={openCreateModal}>
                إنشاء باقة جديدة
              </Button>
            }
          />
        ) : null}

        {!loading && plans.length > 0 && filteredPlans.length === 0 ? (
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
