import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";
import {
  createPlanRequest,
  deletePlanRequest,
  listAdminPlansRequest,
  updatePlanRequest,
} from "../../services/api";
import AdminPlanCard from "../../admin/plans/AdminPlanCard";
import PlanEditModal from "../../admin/plans/PlanEditModal";
import PlanFormSection from "../../admin/plans/PlanFormSection";
import PlanExtendedFields from "../../admin/plans/PlanExtendedFields";
import { getInitialPlanFormState } from "../../admin/plans/planFormConstants";
import { suggestPlanInternalName } from "../../admin/plans/planNameAuto";
import { canSubmitCreate, normalizeCreatePayload } from "../../admin/plans/planPayloadUtils";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardFormCard from "../../components/dashboard/DashboardFormCard";
import DashboardToolbar from "../../components/dashboard/DashboardToolbar";
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
  /** All `name` values (incl. soft-deleted) for unique auto-generated internal keys */
  const [reservedPlanNames, setReservedPlanNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState(getInitialPlanFormState);

  const [editPlan, setEditPlan] = useState(null);

  const canCreate = useMemo(() => canSubmitCreate(form), [form]);

  const generatedInternalName = useMemo(() => {
    if (form.title.trim().length < 2) return "";
    return suggestPlanInternalName(form.title, reservedPlanNames);
  }, [form.title, reservedPlanNames]);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [visibleRes, allRes] = await Promise.all([listAdminPlansRequest(false), listAdminPlansRequest(true)]);
      setPlans(visibleRes?.data?.plans || []);
      const allPlans = allRes?.data?.plans || [];
      setReservedPlanNames(allPlans.map((p) => p.name).filter(Boolean));
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

  return (
    <DashboardShell>
      <DashboardPageHeader
        eyebrow="لوحة المدير الأعلى"
        title="إدارة الباقات"
        description="إنشاء قوالب الباقات، التحكم بالظهور والشراء الذاتي، والمدة والسعر. متاح للمدير الأعلى فقط — البيانات من قاعدة البيانات دون تغيير هيكل الـ API."
        breadcrumbs={superAdminBreadcrumbs("الباقات")}
        actions={
          <Button type="button" variant="secondary" onClick={scrollToCreate}>
            إضافة باقة
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

      <DashboardSection
        ref={createAnchorRef}
        id="oh-sapl-create"
        title="إنشاء باقة جديدة"
        description="يُولَّد المعرف الداخلي (snake_case) تلقائياً من العنوان، مع تجنّب التعارض مع أي باقة حالية أو محذوفة."
      >
        <DashboardFormCard>
          <div className="oh-sapl-form">
            <PlanFormSection title="المعلومات الأساسية" hint="العنوان يظهر للمستخدمين؛ المعرف الداخلي يُشتق تلقائياً ولا يُعدَّل لاحقاً من الواجهة.">
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
                    <span className="oh-sapl-name-preview__label">المعرف الداخلي (تلقائي):</span>{" "}
                    <code className="oh-sapl-name-preview__code">{generatedInternalName}</code>
                  </p>
                ) : (
                  <p className="oh-sapl-name-preview oh-sapl-name-preview--muted">أدخل عنواناً (حرفان على الأقل) لعرض المعرف المقترح.</p>
                )}
              </div>
              <div className="oh-sapl-field">
                <span className="oh-sapl-field__label">وصف مختصر</span>
                <textarea
                  className="oh-sapl-input oh-sapl-input--textarea"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                  placeholder="اختياري — يظهر حيث تُعرض تفاصيل الباقة"
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
      </DashboardSection>

      <DashboardSection
        title="الباقات الحالية"
        description="تعديل كامل من نافذة «تعديل» — تشغيل سريع من المفتاح على البطاقة."
      >
        <DashboardToolbar>
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <StatusBadge tone="neutral">{plans.length} باقة</StatusBadge>
            <div className="oh-sapl-toolbar__slot">فلترة / بحث (جاهز لاحقاً)</div>
          </div>
        </DashboardToolbar>

        {loading ? (
          <DashboardLoadingState label="جارٍ تحميل الباقات…">
            <AdminInlineGridSkeleton count={4} />
          </DashboardLoadingState>
        ) : null}

        {!loading && plans.length === 0 ? (
          <DashboardEmptyState
            title="لا توجد باقات بعد"
            description="أنشئ أول باقة من النموذج أعلاه لتظهر هنا."
            icon={<PlansEmptyIcon />}
          />
        ) : null}

        {!loading && plans.length > 0 ? (
          <div className="oh-sapl-cards">
            {plans.map((p) => (
              <AdminPlanCard
                key={p.id}
                plan={p}
                submitting={submitting}
                onActiveChange={setPlanActive}
                onEdit={() => setEditPlan(p)}
                onDelete={() => void softDelete(p)}
              />
            ))}
          </div>
        ) : null}
      </DashboardSection>

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
