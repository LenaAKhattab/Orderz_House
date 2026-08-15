import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import Button from "../../components/ui/Button";
import { useToast } from "../../components/ui/toastContext";
import {
  getAdminDefaultPlanCatalogRequest,
  updateAdminDefaultPlanCatalogRequest,
} from "../../services/api";
import { invalidatePublicPlansCache } from "../../services/freelancerSessionCache";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  DEFAULT_PLAN_CATALOG_INITIAL_VALUE,
  PLAN_CATALOG_LABELS,
  isPlanCatalog,
} from "../../constants/planCatalogs";
import "./super-admin-plans.css";
import { DefaultPlanControlSkeleton } from "./PlanCatalogSkeletons";

const EMPTY_CATALOG_AR = "لا يمكن تعيين هذا القسم كافتراضي لأنه لا يحتوي على باقات مفعلة.";
const EMPTY_CATALOG_EN = "This section cannot be set as default because it has no active plans.";
const CONFIRM_TITLE_AR = "تعيين هذه الباقات كافتراضية؟";
const CONFIRM_TITLE_EN = "Set these plans as default?";
const CONFIRM_BODY_AR =
  "سيتم عرض هذا القسم في صفحة الباقات العامة ولوحة المستقل بدل قسم الباقات الحالي.";
const CONFIRM_BODY_EN =
  "This section will be shown on the public plans page and the freelancer dashboard instead of the current default plans.";
const SET_BUTTON_AR = "تعيين كافتراضي";
const SET_BUTTON_EN = "Set as default";
const BADGE_AR = "الافتراضي حاليًا";
const BADGE_EN = "Currently default";
const HELPER_AR = "عرض هذه الباقات للمستخدمين";
const HELPER_EN = "Show these plans to users";

function catalogLabel(catalogId, isEn) {
  return isEn ? PLAN_CATALOG_LABELS[catalogId]?.en : PLAN_CATALOG_LABELS[catalogId]?.ar;
}

function successToastMessage(catalogId, isEn) {
  const label = catalogLabel(catalogId, isEn);
  return isEn
    ? `"${label}" is now the default plans for users.`
    : `تم تعيين "${label}" كباقات افتراضية للمستخدمين.`;
}

function DefaultPlanCatalogConfirmModal({ open, catalogId, isEn, submitting, onClose, onConfirm }) {
  if (!open || !catalogId) return null;
  const label = catalogLabel(catalogId, isEn);

  return (
    <div className="oh-sapl-modal-root" role="presentation">
      <button
        type="button"
        className="oh-sapl-modal-backdrop"
        onClick={submitting ? undefined : onClose}
        aria-label={isEn ? "Close dialog" : "إغلاق النافذة"}
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
              {isEn ? CONFIRM_TITLE_EN : CONFIRM_TITLE_AR}
            </h2>
          </div>
          <button
            type="button"
            className="oh-sapl-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label={isEn ? "Close" : "إغلاق"}
          >
            ×
          </button>
        </header>
        <div className="oh-sapl-modal__scroll">
          <p className="oh-sapl-modal__subtitle" style={{ margin: 0 }}>
            {isEn ? CONFIRM_BODY_EN : CONFIRM_BODY_AR}
          </p>
          {label ? (
            <p className="oh-sapl-default-catalog__confirm-target">
              {isEn ? "Section:" : "القسم:"} <strong>{label}</strong>
            </p>
          ) : null}
        </div>
        <footer className="oh-sapl-modal__foot">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            {isEn ? "Cancel" : "إلغاء"}
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void onConfirm()}>
            {submitting
              ? isEn
                ? "Saving…"
                : "جارٍ الحفظ…"
              : isEn
                ? SET_BUTTON_EN
                : SET_BUTTON_AR}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Shared Super Admin control: set this catalog as default_plan_catalog.
 * Used in the same heading-row slot on الباقات الرئيسية, باقات الصفحات, and باقات العمل.
 *
 * @param {object} p
 * @param {string} [p.catalog]
 * @param {string} [p.catalogId]
 * @param {boolean} [p.isEn]
 */
export default function DefaultPlanCatalogControl({ catalog, catalogId, isEn = false }) {
  const resolvedCatalogId = catalogId || catalog;
  const { push } = useToast();
  const [currentCatalog, setCurrentCatalog] = useState(DEFAULT_PLAN_CATALOG_INITIAL_VALUE);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const applyPayload = useCallback((data) => {
    const next = data?.catalog || DEFAULT_PLAN_CATALOG_INITIAL_VALUE;
    setCurrentCatalog(next);
    setSummaries(Array.isArray(data?.catalogs) ? data.catalogs : []);
    setReady(true);
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getAdminDefaultPlanCatalogRequest();
      applyPayload(res?.data);
    } catch (err) {
      setReady(false);
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Could not load plan catalog data." : "تعذر تحميل بيانات الباقات"),
      );
    } finally {
      setLoading(false);
    }
  }, [applyPayload, isEn]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setConfirmOpen(false);
  }, [resolvedCatalogId]);

  if (!isPlanCatalog(resolvedCatalogId)) return null;

  const activePlanCount = summaries.find((item) => item.id === resolvedCatalogId)?.activePlanCount;
  const isEmpty = activePlanCount === 0;
  const isCurrentDefault = currentCatalog === resolvedCatalogId;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await updateAdminDefaultPlanCatalogRequest(resolvedCatalogId);
      applyPayload(res?.data);
      invalidatePublicPlansCache();
      setConfirmOpen(false);
      push({
        type: "success",
        message: successToastMessage(resolvedCatalogId, isEn),
      });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === "EMPTY_PLAN_CATALOG") {
        setError(isEn ? EMPTY_CATALOG_EN : EMPTY_CATALOG_AR);
      } else {
        setError(
          getSafeApiErrorMessage(err) ||
            (isEn ? "Failed to save default catalog." : "تعذر حفظ الباقات الافتراضية."),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

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
        <div className="oh-sapl-default-control__error-block" role="alert">
          <p className="oh-sapl-default-control__error">
            {error || (isEn ? "Could not load plan catalog data." : "تعذر تحميل بيانات الباقات")}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="oh-sapl-default-control__retry"
            onClick={() => void loadCatalog()}
          >
            {isEn ? "Retry" : "إعادة المحاولة"}
          </Button>
        </div>
      ) : isCurrentDefault ? (
        <span className="oh-sapl-default-control__badge" data-default-catalog-state="current">
          <Check size={14} strokeWidth={2.5} aria-hidden />
          {isEn ? BADGE_EN : BADGE_AR}
        </span>
      ) : (
        <>
          <Button
            type="button"
            variant="secondary"
            className="oh-sapl-default-control__button"
            disabled={submitting || isEmpty}
            title={isEmpty ? (isEn ? EMPTY_CATALOG_EN : EMPTY_CATALOG_AR) : undefined}
            onClick={() => {
              if (isEmpty) return;
              setError("");
              setConfirmOpen(true);
            }}
          >
            {isEn ? SET_BUTTON_EN : SET_BUTTON_AR}
          </Button>
          {isEmpty ? (
            <p className="oh-sapl-default-control__empty" role="status">
              {isEn ? EMPTY_CATALOG_EN : EMPTY_CATALOG_AR}
            </p>
          ) : (
            <p className="oh-sapl-default-control__helper">{isEn ? HELPER_EN : HELPER_AR}</p>
          )}
        </>
      )}

      {ready && error ? (
        <p className="oh-sapl-default-control__error" role="alert">
          {error}
        </p>
      ) : null}

      <DefaultPlanCatalogConfirmModal
        open={confirmOpen}
        catalogId={resolvedCatalogId}
        isEn={isEn}
        submitting={submitting}
        onClose={() => (submitting ? null : setConfirmOpen(false))}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
