import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
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
import {
  buildMarketplaceReorderIds,
  getMarketplaceAdminMoveMeta,
  sortMarketplacePlansForAdmin,
} from "../../admin/marketplaceMembership/marketplacePlanFormUtils";
import PlanCatalogAdminShell from "../../admin/plans/PlanCatalogAdminShell";
import PlanCatalogActionToolbar from "../../admin/plans/PlanCatalogActionToolbar";
import { PlanCardsGridSkeleton } from "../../admin/plans/PlanCatalogSkeletons";
import { PLAN_CATALOG } from "../../constants/planCatalogs";

export default function SuperAdminMarketplacePlansPage() {
  const { t } = useTranslation();
  const { push } = useToast();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reorderingPlanId, setReorderingPlanId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const displayedPlans = useMemo(() => sortMarketplacePlansForAdmin(plans), [plans]);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await listAdminMarketplaceMembershipPlansRequest({ includeInactive: true });
      setPlans(Array.isArray(res?.data?.plans) ? res.data.plans : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceLoadFailed"));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        message: t("planAdmin.page.marketplaceCreated"),
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceCreateFailed"),
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
        message: t("planAdmin.page.marketplaceUpdated"),
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceUpdateFailed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (plan, nextActive) => {
    if (Boolean(plan.isActive) === Boolean(nextActive)) return;
    setSubmitting(true);
    try {
      const res = await updateMarketplaceMembershipPlanRequest(plan.id, { isActive: nextActive });
      const updated = res?.data?.plan;
      setPlans((prev) =>
        prev.map((item) => {
          if (String(item.id) !== String(plan.id)) return item;
          if (updated && typeof updated === "object") {
            return { ...item, ...updated, isActive: updated.isActive ?? Boolean(nextActive) };
          }
          return { ...item, isActive: Boolean(nextActive) };
        }),
      );
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceUpdateFailed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (plan) => {
    if (!plan?.id) return;
    setSubmitting(true);
    try {
      const res = await updateMarketplaceMembershipPlanRequest(plan.id, { isActive: false });
      const updated = res?.data?.plan;
      setPlans((prev) =>
        prev.map((item) => {
          if (String(item.id) !== String(plan.id)) return item;
          if (updated && typeof updated === "object") {
            return { ...item, ...updated, isActive: false };
          }
          return { ...item, isActive: false };
        }),
      );
      setArchiveTarget(null);
      push({
        type: "success",
        message: t("planAdmin.page.deactivateSuccess"),
      });
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("planAdmin.page.deactivateBlocked"),
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
        message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceReorderFailed"),
      });
    } finally {
      setReorderingPlanId(null);
    }
  };

  return (
    <PlanCatalogAdminShell className="oh-mmp-page" activeCatalog={PLAN_CATALOG.MARKETPLACE_PLANS} hint={t("planAdmin.sections.marketplace.hint")}>
      {error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      <DashboardSection
        title={t("planAdmin.sections.marketplace.title")}
        className="oh-sapl-section--plans oh-sapl-section--tight"
        description={t("planAdmin.sections.marketplace.description")}
        actions={
          <PlanCatalogActionToolbar
            catalog={PLAN_CATALOG.MARKETPLACE_PLANS}
            onCreate={() => setCreateOpen(true)}
            createLabel={t("planAdmin.sections.marketplace.addPlan")}
            extra={
              <Link
                className="btn btn-ghost oh-sapl-action-toolbar__tertiary"
                to="/dashboard/super-admin/marketplace-economy"
              >
                {t("planAdmin.sections.marketplace.workEconomy")}
              </Link>
            }
          />
        }
      >
        {loading ? (
          <PlanCardsGridSkeleton count={4} className="oh-mmp-grid" variant="marketplace" />
        ) : null}

        {!loading && !error && plans.length === 0 ? (
          <DashboardEmptyState
            title={t("planAdmin.sections.marketplace.emptyTitle")}
            description={t("planAdmin.sections.marketplace.emptyDesc")}
            actions={
              <Button type="button" onClick={() => setCreateOpen(true)}>
                {t("planAdmin.sections.marketplace.addPlan")}
              </Button>
            }
          />
        ) : null}

        {!loading && !error && displayedPlans.length > 0 ? (
          <div className="oh-mmp-grid">
            {displayedPlans.map((plan) => {
              const moveMeta = getMarketplaceAdminMoveMeta(plans, plan.id);
              return (
                <MarketplaceMembershipPlanCard
                  key={plan.id}
                  plan={plan}
                  busy={submitting}
                  reordering={reorderingPlanId === String(plan.id)}
                  canMoveUp={moveMeta.canMoveUp}
                  canMoveDown={moveMeta.canMoveDown}
                  onEdit={setEditPlan}
                  onToggleActive={handleToggleActive}
                  onArchive={setArchiveTarget}
                  onMove={handleMove}
                />
              );
            })}
          </div>
        ) : null}
      </DashboardSection>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={t("planAdmin.page.confirmDeactivateTitle")}
        body={t("planAdmin.page.confirmDeactivateBody")}
        confirmLabel={t("planAdmin.page.deactivateConfirm")}
        cancelLabel={t("planAdmin.common.cancel")}
        confirmVariant="danger"
        confirmBusy={submitting}
        onCancel={() => {
          if (!submitting) setArchiveTarget(null);
        }}
        onConfirm={() => void handleArchive(archiveTarget)}
      />

      <MarketplaceMembershipPlanFormModal
        open={createOpen}
        mode="create"
        submitting={submitting}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <MarketplaceMembershipPlanFormModal
        open={Boolean(editPlan)}
        mode="edit"
        initialPlan={editPlan}
        submitting={submitting}
        onClose={() => setEditPlan(null)}
        onSubmit={handleUpdate}
      />
    </PlanCatalogAdminShell>
  );
}
