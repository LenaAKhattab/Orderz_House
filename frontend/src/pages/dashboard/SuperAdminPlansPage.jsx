import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";
import {
  createPlanRequest,
  deletePlanRequest,
  listAdminPlanPagesRequest,
  listAdminPlansRequest,
  updatePlanPageRequest,
  updatePlanRequest,
} from "../../services/api";
import AdminPlanCard from "../../admin/plans/AdminPlanCard";
import PlanCreateModal from "../../admin/plans/PlanCreateModal";
import PlanEditModal from "../../admin/plans/PlanEditModal";
import PlanPageMetadataPanel from "../../admin/plans/PlanPageMetadataPanel";
import { filterPlans } from "../../admin/plans/planDisplayUtils";
import { getInitialPlanFormState } from "../../admin/plans/planFormConstants";
import {
  PAGE_COPY,
  SECTION_COPY,
} from "../../admin/plans/planMetricTerminology";
import {
  PLAN_ADMIN_SECTION,
  buildPlanPagesIndex,
  filterPlansByAdminSection,
  getDefaultPlanPage,
  getSpecialPlanPages,
  isCanonicalSubscriptionPlan,
  parsePlanAdminSection,
} from "../../admin/plans/planAdminSections";
import { useTranslation } from "../../i18n/LanguageProvider";
import { suggestPlanInternalName } from "../../admin/plans/planNameAuto";
import { canSubmitCreate, normalizeCreatePayload } from "../../admin/plans/planPayloadUtils";
import {
  buildPlanReorderPatches,
  getPlanDisplayOrderMeta,
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

const SALE_ERROR_MESSAGES = {
  INVALID_SALE_PERCENTAGE: "نسبة الخصم يجب أن تكون أكبر من 0 وأقل من 100.",
  SALE_REASON_REQUIRED: "يرجى إدخال سبب الخصم.",
  SALE_NOT_ALLOWED_ON_FREE_PLAN: "لا يمكن تفعيل خصم نسبة مئوية على باقة مجانية أو بلا مبلغ مستحق.",
  SALE_EFFECTIVE_AMOUNT_INVALID: "الخصم ينتج مبلغاً غير صالح للدفع.",
};

function errorMessage(err) {
  const code = err?.response?.data?.code;
  if (code && SALE_ERROR_MESSAGES[code]) return SALE_ERROR_MESSAGES[code];

  const apiMsg = err?.response?.data?.message;
  if (apiMsg) return apiMsg;

  if (err?.code === "ECONNABORTED") {
    return "انتهت مهلة الطلب، حاول مجددًا.";
  }
  if (!err?.response) {
    return "تعذر الاتصال بالخادم. تأكد أن الخادم يعمل ثم حاول مجددًا.";
  }
  return "تعذر تنفيذ العملية. حاول مجدداً.";
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
  const [reservedPlanNames, setReservedPlanNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pageMetaSubmitting, setPageMetaSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [reorderingPlanId, setReorderingPlanId] = useState(null);

  const [form, setForm] = useState(getInitialPlanFormState);
  const [editPlan, setEditPlan] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const planPagesById = useMemo(() => buildPlanPagesIndex(planPages), [planPages]);
  const specialPlanPages = useMemo(() => getSpecialPlanPages(planPages), [planPages]);
  const defaultPlanPage = useMemo(() => getDefaultPlanPage(planPages), [planPages]);

  const canCreate = useMemo(
    () => canSubmitCreate(form, { planPagesById }),
    [form, planPagesById],
  );

  const canonicalPlans = useMemo(
    () => plans.filter((plan) => isCanonicalSubscriptionPlan(plan)),
    [plans],
  );

  const generatedInternalName = useMemo(() => {
    if (form.title.trim().length < 2) return "";
    return suggestPlanInternalName(form.title, reservedPlanNames);
  }, [form.title, reservedPlanNames]);

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

  const filteredPlans = useMemo(() => {
    const filtered = filterPlans(scopedPlans, { search });
    return [...filtered].sort((a, b) => {
      const diff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
      return diff !== 0 ? diff : Number(a.id) - Number(b.id);
    });
  }, [scopedPlans, search]);

  const canReorderPlans = useMemo(() => !String(search || "").trim(), [search]);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [visibleRes, allRes, pagesRes] = await Promise.all([
        listAdminPlansRequest(false),
        listAdminPlansRequest(true),
        listAdminPlanPagesRequest().catch(() => null),
      ]);
      setPlans(visibleRes?.data?.plans || []);
      const allPlans = allRes?.data?.plans || [];
      setReservedPlanNames(allPlans.map((p) => p.name).filter(Boolean));
      setPlanPages(pagesRes?.data?.pages || []);
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

  const savePlanPageMetadata = async (patch) => {
    if (!selectedPlanPage?.id) return;
    setError("");
    setPageMetaSubmitting(true);
    try {
      await updatePlanPageRequest(selectedPlanPage.id, patch);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPageMetaSubmitting(false);
    }
  };

  const openEdit = (plan) => setEditPlan(plan);

  const movePlanInDisplayOrder = useCallback(
    async (plan, direction) => {
      const patches = buildPlanReorderPatches(scopedPlans, plan.id, direction);
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
    [scopedPlans, refresh],
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
            <Link
              to="/dashboard/super-admin/marketplace-plans"
              className="oh-sapl-section-toggle__tab oh-sapl-section-toggle__tab-link"
              role="tab"
              aria-selected={false}
            >
              {isEn ? "Work memberships" : "باقات العمل"}
            </Link>
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

      {activeSection === PLAN_ADMIN_SECTION.PAGES && selectedPlanPage ? (
        <PlanPageMetadataPanel
          page={selectedPlanPage}
          isEn={isEn}
          submitting={pageMetaSubmitting}
          onSave={savePlanPageMetadata}
        />
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

      <DashboardSection title={sectionLabel} className="oh-sapl-section--plans oh-sapl-section--tight">
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
          <StatusBadge tone="neutral" className="oh-sapl-toolbar-compact__count">
            {loading ? "…" : `${filteredPlans.length} / ${scopedPlans.length}`}
          </StatusBadge>
        </div>

        {!canReorderPlans ? (
          <p className="oh-sapl-order-hint oh-sapl-order-hint--muted m-0">
            امسح البحث لإظهار أسهم ترتيب الباقات.
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
          <DashboardEmptyState title="لا توجد نتائج" description="جرّب تغيير البحث." />
        ) : null}

        {!loading && filteredPlans.length > 0 ? (
          <div className="oh-sapl-cards">
            {filteredPlans.map((p) => {
              const orderMeta = getPlanDisplayOrderMeta(scopedPlans, p.id);
              const reorderBusy = reorderingPlanId != null;
              return (
              <AdminPlanCard
                key={p.id}
                plan={p}
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
        planPages={planPages}
        canonicalPlans={canonicalPlans}
      />

      <PlanEditModal
        plan={editPlan}
        open={Boolean(editPlan)}
        submitting={submitting}
        onClose={() => setEditPlan(null)}
        onSave={saveEdit}
        planPages={planPages}
        canonicalPlans={canonicalPlans}
      />
    </DashboardShell>
  );
};

export default SuperAdminPlansPage;
