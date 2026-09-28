import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import AdBuilderForm from "./AdBuilderForm";
import { buildPayloadFromForm, emptyAdForm, mapApiAdToForm } from "./adFormUtils";
import { FIXED_AD_PLACEMENT } from "./adFormConstants";
import { hasBlockingErrors, validateAdFormFrontend } from "./adFormValidation";
import AdPreview from "./AdPreview";
import AdsManagementTable from "./AdsManagementTable";
import AdsReorderSection from "./AdsReorderSection";
import PopupAdsManagementModal from "./PopupAdsManagementModal";
import "./adminAds.css";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";
import {
  adminCreateAdRequest,
  adminDeleteAdRequest,
  adminListAdsRequest,
  adminReorderAdsRequest,
  adminUpdateAdRequest,
} from "../../services/adsService";
import { useToast } from "../../components/ui/toastContext";
import { useAuth } from "../../context/useAuth";
import { breadcrumbHomeFromUser } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";

export default function AdsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();

  const promptAdminNote = useCallback(
    (actionLabel) => {
      const note = window.prompt(t("ads.page.adminNotePrompt", { action: actionLabel }));
      if (note == null) return null;
      const trimmed = note.trim();
      if (trimmed.length < 3) return "";
      return trimmed;
    },
    [t],
  );

  const fmtRelative = useCallback(
    (ts) => {
      if (!ts) return "";
      const sec = Math.round((Date.now() - ts) / 1000);
      if (sec < 8) return t("ads.page.relativeNow");
      if (sec < 60) return t("ads.page.relativeSeconds", { sec });
      const min = Math.round(sec / 60);
      return t("ads.page.relativeMinutes", { min });
    },
    [t],
  );
  const builderRef = useRef(null);
  const [ads, setAds] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyAdForm());
  const [saving, setSaving] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [activeStep, setActiveStep] = useState(1);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [popupAdsOpen, setPopupAdsOpen] = useState(false);
  const [lastEditedAt, setLastEditedAt] = useState(null);
  const [formBaseline, setFormBaseline] = useState(() => JSON.stringify(emptyAdForm()));
  const previewDraft = useDeferredValue(form);

  const validationResult = useMemo(
    () => validateAdFormFrontend(form, { requireReason: true, t }),
    [form, t],
  );

  const load = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const res = await adminListAdsRequest();
      setAds(res?.data?.ads || []);
    } catch (err) {
      if (!silent) setLoadError(err?.response?.data?.message || t("ads.page.loadErrorFallback"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const patchForm = useCallback((next) => {
    setForm(next);
    setLastEditedAt(Date.now());
  }, []);

  const isDirty = useMemo(() => JSON.stringify(form) !== formBaseline, [form, formBaseline]);

  const resetBuilder = useCallback(() => {
    const empty = emptyAdForm();
    setEditingId(null);
    setForm(empty);
    setFormBaseline(JSON.stringify(empty));
    setAttemptedSave(false);
    setActiveStep(1);
    setLastEditedAt(null);
  }, []);

  const handleResetClick = useCallback(() => {
    if (isDirty && !window.confirm(t("ads.page.discardConfirm"))) return;
    resetBuilder();
  }, [isDirty, resetBuilder, t]);

  const startNewAd = useCallback(() => {
    const empty = emptyAdForm();
    setEditingId(null);
    setForm(empty);
    setFormBaseline(JSON.stringify(empty));
    setAttemptedSave(false);
    setActiveStep(1);
    setLastEditedAt(null);
    requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const startEdit = useCallback((ad) => {
    const mapped = mapApiAdToForm(ad);
    setEditingId(ad.id);
    setForm(mapped);
    setFormBaseline(JSON.stringify(mapped));
    setAttemptedSave(false);
    setActiveStep(1);
    requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const saveWithMode = useCallback(
    async (publish) => {
      setAttemptedSave(true);
      const v = validateAdFormFrontend(form, { requireReason: true, t });
      if (hasBlockingErrors(v)) {
        toast.push({ type: "warning", title: t("ads.toast.fixFieldsTitle"), message: t("ads.toast.fixFieldsMessage") });
        return;
      }

      setSaving(true);
      try {
        const body = {
          ...buildPayloadFromForm(form, { publish }),
          adminNote: String(form.adminNote).trim(),
        };
        if (editingId) {
          await adminUpdateAdRequest(editingId, body);
          toast.push({
            type: "success",
            title: t("ads.toast.savedTitle"),
            message: publish ? t("ads.toast.publishedMessage") : t("ads.toast.draftSavedMessage"),
          });
        } else {
          await adminCreateAdRequest(body);
          toast.push({
            type: "success",
            title: t("ads.toast.createdTitle"),
            message: publish ? t("ads.toast.publishedMessage") : t("ads.toast.draftSavedMessage"),
          });
        }
        resetBuilder();
        await load({ silent: true });
      } catch (err) {
        toast.push({
          type: "error",
          title: t("ads.toast.saveFailedTitle"),
          message: err?.response?.data?.message || t("ads.toast.checkFields"),
        });
      } finally {
        setSaving(false);
      }
    },
    [form, editingId, toast, resetBuilder, load, t],
  );

  const handleToggleActive = useCallback(
    async (ad, nextActive) => {
      const note = promptAdminNote(nextActive ? t("ads.actions.enableAd") : t("ads.actions.disableAd"));
      if (note === null) return;
      if (note === "") {
        toast.push({ type: "warning", title: t("ads.toast.reasonRequiredTitle"), message: t("ads.toast.reasonRequiredMessage") });
        return;
      }
      try {
        await adminUpdateAdRequest(ad.id, { isActive: nextActive, adminNote: note });
        toast.push({
          type: "success",
          title: t("ads.toast.updatedTitle"),
          message: nextActive ? t("ads.toast.enabledMessage") : t("ads.toast.disabledMessage"),
        });
        await load({ silent: true });
        if (String(editingId) === String(ad.id)) {
          setForm((f) => ({ ...f, isActive: nextActive }));
        }
      } catch (err) {
        toast.push({ type: "error", title: t("ads.toast.errorTitle"), message: err?.response?.data?.message || "" });
      }
    },
    [toast, load, editingId, promptAdminNote, t],
  );

  const handleDelete = useCallback(
    async (id) => {
      if (!window.confirm(t("ads.page.deleteConfirm"))) return;
      const note = promptAdminNote(t("ads.actions.deleteAd"));
      if (note === null) return;
      if (note === "") {
        toast.push({ type: "warning", title: t("ads.toast.reasonRequiredTitle"), message: t("ads.toast.reasonRequiredMessage") });
        return;
      }
      try {
        await adminDeleteAdRequest(id, { adminNote: note });
        toast.push({ type: "success", title: t("ads.toast.deletedTitle"), message: "" });
        if (String(editingId) === String(id)) resetBuilder();
        await load({ silent: true });
      } catch (err) {
        toast.push({ type: "error", title: t("ads.toast.deleteFailedTitle"), message: err?.response?.data?.message || "" });
      }
    },
    [toast, load, editingId, resetBuilder, promptAdminNote, t],
  );

  const placementAds = useMemo(
    () =>
      [...ads]
        .filter((a) => a.placement === FIXED_AD_PLACEMENT)
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)),
    [ads],
  );

  const tableAds = useMemo(() => [...ads].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)), [ads]);

  const editingAd = useMemo(() => ads.find((a) => String(a.id) === String(editingId)) || null, [ads, editingId]);

  const applyReorder = useCallback(
    async (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      const note = promptAdminNote(t("ads.actions.reorderAds"));
      if (note === null) return;
      if (note === "") {
        toast.push({ type: "warning", title: t("ads.toast.reasonRequiredTitle"), message: t("ads.toast.reasonRequiredMessage") });
        return;
      }
      const next = [...placementAds];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      const items = next.map((a, i) => ({ id: Number(a.id), sortOrder: i }));
      const snapshot = ads.map((a) => ({ ...a }));
      setAds((prev) => {
        const map = new Map(items.map((it) => [String(it.id), it.sortOrder]));
        return prev.map((a) =>
          a.placement === FIXED_AD_PLACEMENT && map.has(String(a.id)) ? { ...a, sortOrder: map.get(String(a.id)) } : a,
        );
      });
      setReorderBusy(true);
      try {
        await adminReorderAdsRequest({ placement: FIXED_AD_PLACEMENT, items, adminNote: note });
        toast.push({ type: "success", title: t("ads.toast.reorderSuccessTitle"), message: "" });
      } catch (err) {
        setAds(snapshot);
        toast.push({ type: "error", title: t("ads.toast.reorderFailedTitle"), message: err?.response?.data?.message || "" });
      } finally {
        setReorderBusy(false);
      }
    },
    [placementAds, ads, toast, promptAdminNote, t],
  );

  const fieldErrorsForForm = attemptedSave ? validationResult.errors : {};
  const imageUrlErrorsForForm = attemptedSave ? validationResult.imageUrlErrors : {};

  const orderStepSlot = (
    <>
      <div className="oh-admin-ads__reorder-toolbar oh-admin-ads__reorder-toolbar--studio">
        <span className="oh-admin-ads__field-hint">{t("ads.page.dragReorderHint")}</span>
      </div>
      <AdsReorderSection ads={placementAds} onReorder={applyReorder} busy={reorderBusy} nowTick={nowTick} />
    </>
  );

  return (
    <DashboardShell className="oh-admin-ads-page">
      <DashboardPageHeader
        eyebrow={t("ads.page.eyebrow")}
        title={t("ads.page.title")}
        description={t("ads.page.description")}
        breadcrumbs={[
          { label: t("ads.page.breadcrumbHome"), href: breadcrumbHomeFromUser(user) },
          { label: t("ads.page.breadcrumbAds") },
        ]}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={startNewAd}>
              {t("ads.page.newAd")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPopupAdsOpen(true)}>
              {t("ads.page.popupAds")}
            </button>
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => load()}>
              {t("ads.common.refresh")}
            </button>
          </>
        }
      />

      <PopupAdsManagementModal open={popupAdsOpen} onClose={() => setPopupAdsOpen(false)} />

      {loadError ? (
        <DashboardErrorState
          className="mb-4"
          message={loadError}
          actions={
            <button type="button" className="btn btn-primary" onClick={() => load()}>
              {t("ads.common.retry")}
            </button>
          }
        />
      ) : null}

      <DashboardSection>
        <div ref={builderRef} className="oh-admin-ads__studio">
          <div className="oh-admin-ads__studio-head">
            <div>
              <h2 className="oh-admin-ads__workspace-title">{editingId ? t("ads.page.editAd") : t("ads.page.buildNew")}</h2>
              <p className="oh-admin-ads__studio-sub">
                {isDirty ? (
                  <span className="oh-admin-ads__draft-badge">
                    {t("ads.page.draftUnsaved", { relative: fmtRelative(lastEditedAt) })}
                  </span>
                ) : (
                  <span className="oh-admin-ads__draft-badge oh-admin-ads__draft-badge--saved">{t("ads.page.synced")}</span>
                )}
              </p>
            </div>
          </div>

          <div className="oh-admin-ads__studio-body">
            <div className="oh-admin-ads__studio-form">
              <AdBuilderForm
                data={form}
                onChange={patchForm}
                fieldErrors={fieldErrorsForForm}
                imageUrlErrors={imageUrlErrorsForForm}
                attemptedSave={attemptedSave}
                activeStep={activeStep}
                onStepChange={setActiveStep}
                orderStepSlot={orderStepSlot}
                editingAd={editingAd}
              />
            </div>

            <aside className="oh-admin-ads__studio-preview" aria-label={t("ads.page.previewAria")}>
              <AdPreview draft={{ ...previewDraft, id: editingId || "preview" }} />
            </aside>
          </div>

          <footer className="oh-admin-ads__builder-actions" aria-label={t("ads.page.actionsTitle")}>
            <div className="oh-admin-ads__builder-actions-head">
              <h3 className="oh-admin-ads__builder-actions-title">{t("ads.page.actionsTitle")}</h3>
            </div>
            <div className="oh-admin-ads__builder-actions-buttons">
              <button
                type="button"
                className="btn btn-secondary oh-admin-ads__builder-actions-btn--reset"
                disabled={saving}
                onClick={handleResetClick}
              >
                {t("ads.common.reset")}
              </button>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setMobilePreviewOpen(true)}>
                {t("ads.common.fullPreview")}
              </button>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => saveWithMode(false)}>
                {saving ? t("ads.common.working") : t("ads.page.saveDraft")}
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => saveWithMode(true)}>
                {saving ? t("ads.common.working") : t("ads.page.publish")}
              </button>
            </div>
          </footer>

          <button
            type="button"
            className="oh-admin-ads__preview-fab"
            aria-expanded={mobilePreviewOpen}
            onClick={() => setMobilePreviewOpen(true)}
          >
            {t("ads.common.preview")}
          </button>

          {mobilePreviewOpen ? (
            <div className="oh-admin-ads__preview-drawer" role="dialog" aria-modal="true" aria-label={t("ads.page.previewAria")}>
              <div className="oh-admin-ads__preview-drawer-backdrop" onClick={() => setMobilePreviewOpen(false)} aria-hidden />
              <div className="oh-admin-ads__preview-drawer-panel">
                <header className="oh-admin-ads__preview-drawer-head">
                  <strong>{t("ads.common.fullPreview")}</strong>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMobilePreviewOpen(false)}>
                    {t("ads.common.close")}
                  </button>
                </header>
                <AdPreview draft={{ ...previewDraft, id: editingId || "preview" }} compact />
              </div>
            </div>
          ) : null}
        </div>
      </DashboardSection>

      <DashboardSection title={t("ads.page.allAdsTitle")} description={t("ads.page.allAdsDescription")}>
        {loading ? (
          <DashboardLoadingState label={t("ads.common.loading")} />
        ) : !loadError && tableAds.length === 0 ? (
          <DashboardEmptyState title={t("ads.page.emptyAds")} />
        ) : (
          <AdsManagementTable
            ads={tableAds}
            onEdit={startEdit}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
            nowTick={nowTick}
          />
        )}
      </DashboardSection>
    </DashboardShell>
  );
}
