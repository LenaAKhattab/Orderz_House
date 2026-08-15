import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
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
import DefaultPlanCatalogControl from "../../admin/plans/DefaultPlanCatalogSelector";
import PlanCatalogAdminShell from "../../admin/plans/PlanCatalogAdminShell";
import { PlanCardsGridSkeleton } from "../../admin/plans/PlanCatalogSkeletons";
import { SECTION_COPY } from "../../admin/plans/planMetricTerminology";
import { PLAN_CATALOG } from "../../constants/planCatalogs";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";

export default function SuperAdminMarketplacePlansPage() {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const { push } = useToast();
  const sectionCopy = SECTION_COPY.marketplace;

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
      setError(getSafeApiErrorMessage(err) || (isEn ? "Could not load plan catalog data." : "تعذر تحميل بيانات الباقات"));
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
    <PlanCatalogAdminShell
      className="oh-mmp-page"
      activeCatalog={PLAN_CATALOG.MARKETPLACE_PLANS}
      isEn={isEn}
      hint={isEn ? sectionCopy.hintEn : sectionCopy.hintAr}
    >
      {error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      <DashboardSection
        title={isEn ? sectionCopy.en : sectionCopy.ar}
        className="oh-sapl-section--plans oh-sapl-section--tight"
        description={
          isEn
            ? "Pay As You Work, Active, Pro, Elite — managed by tier code."
            : "Pay As You Work و Active و Pro و Elite — تُدار عبر رمز الباقة."
        }
        actions={
          <div className="oh-sapl-section-heading-actions">
            <DefaultPlanCatalogControl catalog={PLAN_CATALOG.MARKETPLACE_PLANS} isEn={isEn} />
            <Link className="btn btn-secondary" to="/dashboard/super-admin/marketplace-economy">
              {isEn ? "Work economy settings" : "إعدادات اقتصاد العمل"}
            </Link>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {isEn ? "+ Add plan" : "+ إضافة باقة"}
            </Button>
          </div>
        }
      >
        {loading ? (
          <PlanCardsGridSkeleton count={4} className="oh-mmp-grid" variant="marketplace" isEn={isEn} />
        ) : null}

        {!loading && !error && plans.length === 0 ? (
          <DashboardEmptyState
            title={isEn ? sectionCopy.emptyTitleEn : sectionCopy.emptyTitleAr}
            description={isEn ? sectionCopy.emptyDescEn : sectionCopy.emptyDescAr}
            actions={
              <Button type="button" onClick={() => setCreateOpen(true)}>
                {isEn ? "+ Add plan" : "+ إضافة باقة"}
              </Button>
            }
          />
        ) : null}

        {!loading && !error && plans.length > 0 ? (
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
        ) : null}
      </DashboardSection>

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
    </PlanCatalogAdminShell>
  );
}
