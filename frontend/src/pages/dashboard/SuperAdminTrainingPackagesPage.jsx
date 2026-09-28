import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  createAdminTrainingPackageRequest,
  listAdminTrainingPackagesRequest,
  reorderAdminTrainingPackagesRequest,
  updateAdminTrainingPackageRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import PlanCatalogAdminShell from "../../admin/plans/PlanCatalogAdminShell";
import { PlanCardsGridSkeleton } from "../../admin/plans/PlanCatalogSkeletons";
import "../../i18n/planAdminResources";
import { TRAINING_PACKAGES_NAV_ID } from "../../admin/plans/planCatalogNav";
import TrainingPackageAdminCard from "../../admin/trainingPackages/TrainingPackageAdminCard";
import TrainingPackageFormModal from "../../admin/trainingPackages/TrainingPackageFormModal";
import { buildTrainingReorderCodes } from "../../admin/trainingPackages/trainingPackageFormUtils";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";

export default function SuperAdminTrainingPackagesPage() {
  const { t } = useTranslation();
  const { push } = useToast();

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reorderingCode, setReorderingCode] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPkg, setEditPkg] = useState(null);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await listAdminTrainingPackagesRequest();
      setPackages(Array.isArray(res?.data?.packages) ? res.data.packages : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("planAdmin.sections.training.loadFailed"));
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async (payload) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await createAdminTrainingPackageRequest(payload);
      setCreateOpen(false);
      push({ type: "success", message: t("planAdmin.trainingActions.created") });
      await refresh();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceCreateFailed") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (payload) => {
    if (!editPkg?.code || submitting) return;
    setSubmitting(true);
    try {
      await updateAdminTrainingPackageRequest(editPkg.code, payload);
      setEditPkg(null);
      push({ type: "success", message: t("planAdmin.trainingActions.updated") });
      await refresh();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceUpdateFailed") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleVisible = async (pkg, nextVisible) => {
    setSubmitting(true);
    try {
      await updateAdminTrainingPackageRequest(pkg.code, { isVisible: nextVisible });
      await refresh();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceUpdateFailed") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMove = async (pkg, direction) => {
    const orderedCodes = buildTrainingReorderCodes(packages, pkg.code, direction);
    if (!orderedCodes) return;
    setReorderingCode(pkg.code);
    try {
      const res = await reorderAdminTrainingPackagesRequest({ orderedCodes });
      if (Array.isArray(res?.data?.packages)) setPackages(res.data.packages);
      else await refresh();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || t("planAdmin.page.marketplaceReorderFailed") });
    } finally {
      setReorderingCode(null);
    }
  };

  return (
    <PlanCatalogAdminShell
      className="oh-mmp-page"
      activeCatalog={TRAINING_PACKAGES_NAV_ID}
      hint={t("planAdmin.sections.training.hint")}
    >
      {error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      <DashboardSection
        title={t("planAdmin.sections.training.title")}
        className="oh-sapl-section--plans oh-sapl-section--tight"
        description={t("planAdmin.sections.training.hint")}
        actions={
          <div className="oh-sapl-section-heading-actions">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t("planAdmin.trainingActions.createPackage")}
            </Button>
          </div>
        }
      >
        {loading ? <PlanCardsGridSkeleton count={3} className="oh-mmp-grid" variant="marketplace" /> : null}

        {!loading && !error && packages.length === 0 ? (
          <DashboardEmptyState
            title={t("planAdmin.sections.training.emptyTitle")}
            description={t("planAdmin.sections.training.emptyDesc")}
          />
        ) : null}

        {!loading && !error && packages.length > 0 ? (
          <div className="oh-mmp-grid">
            {packages.map((pkg, index) => (
              <TrainingPackageAdminCard
                key={pkg.code}
                pkg={pkg}
                busy={submitting}
                reordering={reorderingCode === pkg.code}
                canMoveUp={index > 0}
                canMoveDown={index < packages.length - 1}
                onEdit={setEditPkg}
                onToggleVisible={handleToggleVisible}
                onMove={handleMove}
              />
            ))}
          </div>
        ) : null}
      </DashboardSection>

      <TrainingPackageFormModal
        open={createOpen}
        mode="create"
        submitting={submitting}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <TrainingPackageFormModal
        open={Boolean(editPkg)}
        mode="edit"
        initialPackage={editPkg}
        submitting={submitting}
        onClose={() => setEditPkg(null)}
        onSubmit={handleUpdate}
      />
    </PlanCatalogAdminShell>
  );
}
