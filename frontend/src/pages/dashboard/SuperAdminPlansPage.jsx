import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import PlanEditModal from "../../admin/plans/PlanEditModal";
import PlanFormSection from "../../admin/plans/PlanFormSection";
import PlanExtendedFields from "../../admin/plans/PlanExtendedFields";
import PlanCollapsibleSection from "../../admin/plans/PlanCollapsibleSection";
import { computePlanKpis, filterPlans } from "../../admin/plans/planDisplayUtils";
import {
  computePlanBadges,
  computePlansBusinessSummary,
  computePortfolioInsightStrip,
  mergePlansWithPerformanceStats,
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
  KPI_LABELS,
  METRIC_SCOPE_NOTE,
  PAGE_COPY,
  SORT_LABELS,
  SUMMARY_LABELS,
} from "../../admin/plans/planMetricTerminology";
import { suggestPlanInternalName } from "../../admin/plans/planNameAuto";
import { canSubmitCreate, normalizeCreatePayload } from "../../admin/plans/planPayloadUtils";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardFormCard from "../../components/dashboard/DashboardFormCard";
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
  const createAnchorRef = useRef(null);
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
  const [sortMode, setSortMode] = useState(SORT_MODES.revenue);
  const [decisionFilter, setDecisionFilter] = useState(DECISION_FILTERS.all);

  const [form, setForm] = useState(getInitialPlanFormState);
  const [editPlan, setEditPlan] = useState(null);

  const canCreate = useMemo(() => canSubmitCreate(form), [form]);

  const generatedInternalName = useMemo(() => {
    if (form.title.trim().length < 2) return "";
    return suggestPlanInternalName(form.title, reservedPlanNames);
  }, [form.title, reservedPlanNames]);

  const catalogKpis = useMemo(() => computePlanKpis(plans), [plans]);

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

  const businessSummary = useMemo(
    () => computePlansBusinessSummary(plansWithStats, { statsAvailable, statsFailed, platformContext }),
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
      setSubscriptionIntel(intelRes);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scrollToCreate = () => {
    createAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetForm = () => {
    setForm(getInitialPlanFormState());
  };

  const createPlan = async () => {
    setError("");
    setSubmitting(true);
    try {
      await createPlanRequest(normalizeCreatePayload(form, reservedPlanNames));
      setForm(getInitialPlanFormState());
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

  return (
    <DashboardShell className="oh-sapl-page">
      <DashboardPageHeader
        className="oh-sapl-header oh-sapl-header--compact"
        eyebrow="لوحة المدير الأعلى"
        title={PAGE_COPY.title}
        description={PAGE_COPY.description}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.plans")}
        actions={
          <Button type="button" className="oh-sapl-header-cta" onClick={scrollToCreate}>
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

      {intelError && !error ? (
        <p className="oh-sapl-intel-notice" role="alert">
          تعذر تحميل بيانات الأداء — المؤشرات تعرض «تعذر تحميل البيانات».{" "}
          <button type="button" className="oh-sapl-intel-notice__btn" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </p>
      ) : null}

      <section className="oh-sapl-summary-bar" aria-label={PAGE_COPY.summaryAria}>
        <div className="oh-sapl-summary-bar__item">
          <span className="oh-sapl-summary-bar__label" title={KPI_LABELS?.currentSubscriptions?.title}>
            {SUMMARY_LABELS.totalCurrentSubs}
          </span>
          <strong className="oh-sapl-summary-bar__value">{loading ? "…" : businessSummary.totalSubscribers.display}</strong>
        </div>
        <div className="oh-sapl-summary-bar__item">
          <span className="oh-sapl-summary-bar__label" title={KPI_LABELS?.paidSubscriptionValue?.title}>
            {SUMMARY_LABELS.totalPaidValue}
          </span>
          <strong className="oh-sapl-summary-bar__value">{loading ? "…" : businessSummary.totalRevenue.display}</strong>
        </div>
        <div className="oh-sapl-summary-bar__item oh-sapl-summary-bar__item--wide">
          <span className="oh-sapl-summary-bar__label">{SUMMARY_LABELS.topUsage}</span>
          <strong className="oh-sapl-summary-bar__value oh-sapl-summary-bar__value--text">
            {loading ? "…" : businessSummary.topPlanByUsage.display}
          </strong>
        </div>
        <div className="oh-sapl-summary-bar__item oh-sapl-summary-bar__item--wide">
          <span className="oh-sapl-summary-bar__label">{SUMMARY_LABELS.topPaidValue}</span>
          <strong className="oh-sapl-summary-bar__value oh-sapl-summary-bar__value--text">
            {loading ? "…" : businessSummary.topPlanByRevenue.display}
          </strong>
          {!loading && businessSummary.topRevenueShare?.display ? (
            <span className="oh-sapl-summary-bar__sub">{businessSummary.topRevenueShare.display}</span>
          ) : null}
        </div>
        {!loading && statsAvailable ? (
          <p className="oh-sapl-summary-bar__scope help m-0">{METRIC_SCOPE_NOTE}</p>
        ) : null}
      </section>

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

      <p className="oh-sapl-catalog-meta help m-0">
        {loading ? null : (
          <>
            {catalogKpis.active} نشطة · {catalogKpis.storeVisible} في المتجر · {catalogKpis.total} إجمالي القوالب
          </>
        )}
      </p>

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
            <option value={SORT_MODES.revenue}>{SORT_LABELS.revenue}</option>
            <option value={SORT_MODES.subscribers}>{SORT_LABELS.subscribers}</option>
            <option value={SORT_MODES.active}>{SORT_LABELS.active}</option>
            <option value={SORT_MODES.attention}>{SORT_LABELS.attention}</option>
          </select>
          <StatusBadge tone="neutral" className="oh-sapl-toolbar-compact__count">
            {loading ? "…" : `${filteredPlans.length} / ${plans.length}`}
          </StatusBadge>
        </div>

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
              <Button type="button" onClick={scrollToCreate}>
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
            {filteredPlans.map((p) => (
              <AdminPlanCard
                key={p.id}
                plan={p}
                badge={planBadges.get(String(p.id)) || null}
                platformContext={platformContext}
                submitting={submitting}
                onActiveChange={setPlanActive}
                onEdit={() => openEdit(p)}
                onManageDetails={() => openEdit(p)}
                onDelete={() => void softDelete(p)}
              />
            ))}
          </div>
        ) : null}
      </DashboardSection>

      <PlanCollapsibleSection
        ref={createAnchorRef}
        id="oh-sapl-create"
        title="إنشاء باقة جديدة"
        description="قالب اشتراك جديد — المعرف الداخلي يُولَّد تلقائياً من العنوان."
        defaultOpen={false}
        className="oh-sapl-create-section"
      >
        <DashboardFormCard>
          <div className="oh-sapl-form oh-sapl-form--wide">
            <PlanFormSection title="المعلومات الأساسية" hint="العنوان يظهر للمستقلين؛ المعرف الداخلي يُشتق تلقائياً.">
              <div className="oh-sapl-field">
                <span className="oh-sapl-field__label">العنوان</span>
                <input
                  className="oh-sapl-input"
                  value={form.title}
                  onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
                  placeholder="باقة احترافية للمستقلين"
                  disabled={submitting}
                />
                {generatedInternalName ? (
                  <p className="oh-sapl-name-preview">
                    <span className="oh-sapl-name-preview__label">المعرف الداخلي:</span>{" "}
                    <code className="oh-sapl-name-preview__code">{generatedInternalName}</code>
                  </p>
                ) : (
                  <p className="oh-sapl-name-preview oh-sapl-name-preview--muted">أدخل عنواناً (حرفان على الأقل).</p>
                )}
              </div>
              <div className="oh-sapl-field">
                <span className="oh-sapl-field__label">وصف مختصر</span>
                <textarea
                  className="oh-sapl-input oh-sapl-input--textarea"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                  placeholder="اختياري"
                  disabled={submitting}
                />
              </div>
            </PlanFormSection>

            <PlanExtendedFields form={form} setForm={setForm} submitting={submitting} />

            <div className="oh-sapl-actions">
              <Button type="button" variant="secondary" disabled={submitting} onClick={resetForm}>
                مسح الحقول
              </Button>
              <Button type="button" disabled={submitting || !canCreate} onClick={() => void createPlan()}>
                حفظ وإضافة الباقة
              </Button>
            </div>
          </div>
        </DashboardFormCard>
      </PlanCollapsibleSection>

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
