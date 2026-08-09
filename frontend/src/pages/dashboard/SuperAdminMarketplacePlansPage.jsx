import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  createMarketplaceMembershipPlanRequest,
  listAdminMarketplaceMembershipPlansRequest,
  reorderMarketplaceMembershipPlansRequest,
  updateMarketplaceMembershipPlanRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import MarketplaceMembershipPlanCard from "../../admin/marketplaceMembership/MarketplaceMembershipPlanCard";
import MarketplaceMembershipPlanFormModal from "../../admin/marketplaceMembership/MarketplaceMembershipPlanFormModal";
import { buildMarketplaceReorderIds } from "../../admin/marketplaceMembership/marketplacePlanFormUtils";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";

export default function SuperAdminMarketplacePlansPage() {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const { push } = useToast();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reorderingPlanId, setReorderingPlanId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await listAdminMarketplaceMembershipPlansRequest({ includeInactive: true });
      setPlans(Array.isArray(res?.data?.plans) ? res.data.plans : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || (isEn ? "Failed to load plans." : "تعذر تحميل الباقات."));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async (payload) => {
    setSubmitting(true);
    try {
      await createMarketplaceMembershipPlanRequest(payload);
      setCreateOpen(false);
      push({
        type: "success",
        message: isEn ? "Plan created." : "تم إنشاء الباقة.",
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Create failed." : "فشل الإنشاء."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (payload) => {
    if (!editPlan?.id) return;
    setSubmitting(true);
    try {
      await updateMarketplaceMembershipPlanRequest(editPlan.id, payload);
      setEditPlan(null);
      push({
        type: "success",
        message: isEn ? "Plan updated." : "تم تحديث الباقة.",
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Update failed." : "فشل التحديث."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (plan, nextActive) => {
    setSubmitting(true);
    try {
      await updateMarketplaceMembershipPlanRequest(plan.id, { isActive: nextActive });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Update failed." : "فشل التحديث."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMove = async (plan, direction) => {
    const orderedIds = buildMarketplaceReorderIds(plans, plan.id, direction);
    if (!orderedIds) return;
    setReorderingPlanId(String(plan.id));
    try {
      const res = await reorderMarketplaceMembershipPlansRequest({ orderedIds });
      if (Array.isArray(res?.data?.plans)) {
        setPlans(res.data.plans);
      } else {
        await refresh();
      }
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Reorder failed." : "فشل إعادة الترتيب."),
      });
    } finally {
      setReorderingPlanId(null);
    }
  };

  return (
    <DashboardShell className="oh-mmp-page">
      <DashboardPageHeader
        eyebrow={isEn ? "Super admin" : "لوحة المدير الأعلى"}
        title={isEn ? "Work membership plans" : "إدارة باقات العمل"}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.marketplacePlans")}
        actions={
          <>
            <Link className="btn btn-secondary" to="/dashboard/super-admin/marketplace-economy">
              {isEn ? "Work economy settings" : "إعدادات اقتصاد العمل"}
            </Link>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {isEn ? "+ Add plan" : "+ إضافة باقة"}
            </Button>
          </>
        }
      />

      <p className="oh-mmp-notice">
        {isEn
          ? "These plans belong to the new marketplace work system and are independent of Main packages and Plan pages."
          : "هذه الباقات خاصة بنظام العمل الجديد في السوق، وهي مستقلة عن الباقات الرئيسية وباقات الصفحات."}
      </p>

      {loading ? <DashboardLoadingState /> : null}
      {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      {!loading && !error ? (
        <DashboardSection
          title={isEn ? "Catalog" : "الكتالوج"}
          description={
            isEn
              ? "Pay As You Work, Active, Pro, Elite — managed by tier code."
              : "Pay As You Work و Active و Pro و Elite — تُدار عبر رمز الباقة."
          }
        >
          {plans.length === 0 ? (
            <DashboardEmptyState
              title={isEn ? "No marketplace plans yet" : "لا توجد باقات عمل بعد"}
              description={
                isEn
                  ? "Apply the Phase 1 migration, then refresh — or create a plan."
                  : "طبّق ترحيل المرحلة 1 ثم حدّث الصفحة — أو أنشئ باقة."
              }
            />
          ) : (
            <div className="oh-mmp-grid">
              {plans.map((plan, index) => (
                <MarketplaceMembershipPlanCard
                  key={plan.id}
                  plan={plan}
                  isEn={isEn}
                  busy={submitting}
                  reordering={reorderingPlanId === String(plan.id)}
                  canMoveUp={index > 0}
                  canMoveDown={index < plans.length - 1}
                  onEdit={setEditPlan}
                  onToggleActive={handleToggleActive}
                  onMove={handleMove}
                />
              ))}
            </div>
          )}
        </DashboardSection>
      ) : null}

      <MarketplaceMembershipPlanFormModal
        open={createOpen}
        mode="create"
        isEn={isEn}
        submitting={submitting}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <MarketplaceMembershipPlanFormModal
        open={Boolean(editPlan)}
        mode="edit"
        initialPlan={editPlan}
        isEn={isEn}
        submitting={submitting}
        onClose={() => setEditPlan(null)}
        onSubmit={handleUpdate}
      />
    </DashboardShell>
  );
}
