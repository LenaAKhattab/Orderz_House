import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import Button from "../../components/ui/Button";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
import { updateAdminDefaultPlanCatalogRequest } from "../../services/api";
import { invalidatePublicPlansCache } from "../../services/freelancerSessionCache";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { isPlanCatalog } from "../../constants/planCatalogs";
import { PLAN_CATALOG_NAV } from "./planCatalogNav";
import { useAdminDefaultPlanCatalog } from "./DefaultPlanCatalogAdminContext";
import "./super-admin-plans.css";
import { DefaultPlanControlSkeleton } from "./PlanCatalogSkeletons";

function catalogLabel(catalogId, t) {
  const item = PLAN_CATALOG_NAV.find((entry) => entry.id === catalogId);
  return item ? t(item.labelKey) : "";
}

function DefaultPlanCatalogConfirmModal({ open, catalogId, submitting, error, onClose, onConfirm }) {
  const { t, locale } = useTranslation();
  const isEn = locale === "en";
  if (!open || !catalogId) return null;
  const label = catalogLabel(catalogId, t);

  return (
    <div className="oh-sapl-modal-root" role="presentation">
      <button
        type="button"
        className="oh-sapl-modal-backdrop"
        onClick={submitting ? undefined : onClose}
        aria-label={t("planAdmin.common.closeDialog")}
      />
      <div
        className="oh-sapl-modal oh-sapl-default-catalog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oh-default-catalog-confirm-title"
        dir={isEn ? "ltr" : "rtl"}
      >
        <header className="oh-sapl-modal__head">
          <div>
            <h2 id="oh-default-catalog-confirm-title" className="oh-sapl-modal__title">
              {t("planAdmin.catalog.defaultControl.confirmTitle")}
            </h2>
          </div>
          <button
            type="button"
            className="oh-sapl-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("planAdmin.common.close")}
          >
            ×
          </button>
        </header>
        <div className="oh-sapl-modal__scroll">
          <p className="oh-sapl-modal__subtitle" style={{ margin: 0 }}>
            {t("planAdmin.catalog.defaultControl.confirmBody")}
          </p>
          {label ? (
            <p className="oh-sapl-default-catalog__confirm-target">
              {t("planAdmin.catalog.defaultControl.sectionLabel")} <strong>{label}</strong>
            </p>
          ) : null}
          {error ? (
            <p className="oh-sapl-default-control__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="oh-sapl-modal__foot">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            {t("planAdmin.common.cancel")}
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void onConfirm()}>
            {submitting ? t("planAdmin.common.saving") : t("planAdmin.catalog.defaultControl.setButton")}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Shared Super Admin control: set this catalog as default_plan_catalog.
 *
 * @param {object} p
 * @param {string} [p.catalog]
 * @param {string} [p.catalogId]
 * @param {boolean} [p.isEn]
 */
export default function DefaultPlanCatalogControl({ catalog, catalogId, isEn: isEnProp = false }) {
  const { t, locale } = useTranslation();
  const isEn = isEnProp || locale === "en";
  const resolvedCatalogId = catalogId || catalog;
  const { push } = useToast();
  const adminDefault = useAdminDefaultPlanCatalog();
  const currentCatalog = adminDefault?.catalog ?? null;
  const summaries = adminDefault?.catalogs ?? [];
  const loading = Boolean(adminDefault?.loading) && !adminDefault?.ready;
  const ready = Boolean(adminDefault?.ready);
  const loadError = adminDefault?.error || "";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setConfirmOpen(false);
  }, [resolvedCatalogId]);

  if (!isPlanCatalog(resolvedCatalogId)) return null;

  const activePlanCount = summaries.find((item) => item.id === resolvedCatalogId)?.activePlanCount;
  const isEmpty = activePlanCount === 0;
  const isCurrentDefault = ready && currentCatalog === resolvedCatalogId;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await updateAdminDefaultPlanCatalogRequest(resolvedCatalogId);
      adminDefault?.applyPayload?.(res?.data);
      invalidatePublicPlansCache();
      setConfirmOpen(false);
      push({
        type: "success",
        message: t("planAdmin.catalog.defaultControl.success", {
          label: catalogLabel(resolvedCatalogId, t),
        }),
      });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === "EMPTY_PLAN_CATALOG") {
        setError(t("planAdmin.catalog.defaultControl.emptyCatalog"));
      } else {
        setError(getSafeApiErrorMessage(err) || t("planAdmin.catalog.defaultControl.saveFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const setButtonHint = isEmpty
    ? t("planAdmin.catalog.defaultControl.emptyCatalog")
    : t("planAdmin.catalog.defaultControl.helper");
  const setButtonLabel = t("planAdmin.catalog.defaultControl.setButton");

  return (
    <div
      className="oh-sapl-default-control"
      data-default-plan-catalog-control="true"
      data-catalog-id={resolvedCatalogId}
      data-default-catalog-state={loading ? "loading" : !ready ? "error" : isCurrentDefault ? "current" : "idle"}
    >
      {loading ? (
        <DefaultPlanControlSkeleton isEn={isEn} />
      ) : !ready ? (
        <Button
          type="button"
          variant="secondary"
          className="oh-sapl-default-control__retry"
          title={loadError || error || t("planAdmin.catalog.defaultControl.loadFailed")}
          aria-label={loadError || error || t("planAdmin.catalog.defaultControl.retryLoadAria")}
          onClick={() => void adminDefault?.reload?.()}
        >
          {t("planAdmin.catalog.defaultControl.retry")}
        </Button>
      ) : isCurrentDefault ? (
        <span
          className="oh-sapl-default-control__badge"
          data-default-catalog-state="current"
          title={t("planAdmin.catalog.tabBadgeShownTitle")}
        >
          <Check size={14} strokeWidth={2.5} aria-hidden />
          {t("planAdmin.catalog.tabBadgeShown")}
        </span>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="oh-sapl-default-control__button"
          disabled={submitting || isEmpty}
          title={setButtonHint}
          aria-label={`${setButtonLabel}. ${setButtonHint}`}
          onClick={() => {
            if (isEmpty) return;
            setError("");
            setConfirmOpen(true);
          }}
        >
          {setButtonLabel}
        </Button>
      )}

      <DefaultPlanCatalogConfirmModal
        open={confirmOpen}
        catalogId={resolvedCatalogId}
        submitting={submitting}
        error={error}
        onClose={() => (submitting ? null : setConfirmOpen(false))}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
