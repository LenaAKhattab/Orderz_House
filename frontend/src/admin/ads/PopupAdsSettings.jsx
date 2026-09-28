import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminCreatePopupAdRequest,
  adminDeletePopupAdRequest,
  adminListPopupAdsRequest,
  adminUpdatePopupAdRequest,
} from "../../services/api";
import { adminUploadAdImageRequest } from "../../services/adsService";
import { useToast } from "../../components/ui/toastContext";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import PopupAdModal from "../../components/ads/PopupAdModal";
import "./popupAdsSettings.css";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

const EMPTY_FORM = {
  enabled: false,
  titleAr: "",
  titleEn: "",
  bodyAr: "",
  bodyEn: "",
  imageUrl: "",
  ctaText: "",
  ctaUrl: "",
  openInNewTab: false,
  audience: "all",
  pageScope: "all",
  frequency: "session",
  sortOrder: 0,
  startDate: "",
  endDate: "",
};

function mapAdToForm(ad) {
  if (!ad) return { ...EMPTY_FORM };
  return {
    enabled: Boolean(ad.enabled),
    titleAr: ad.titleAr || "",
    titleEn: ad.titleEn || "",
    bodyAr: ad.bodyAr || "",
    bodyEn: ad.bodyEn || "",
    imageUrl: ad.imageUrl || "",
    ctaText: ad.ctaText || "",
    ctaUrl: ad.ctaUrl || "",
    openInNewTab: Boolean(ad.openInNewTab),
    audience: ad.audience || "all",
    pageScope: ad.pageScope || "all",
    frequency: ad.frequency || "session",
    sortOrder: Number(ad.sortOrder) || 0,
    startDate: ad.startDate ? String(ad.startDate).slice(0, 16) : "",
    endDate: ad.endDate ? String(ad.endDate).slice(0, 16) : "",
  };
}

function buildPayload(form) {
  return {
    enabled: form.enabled,
    titleAr: form.titleAr.trim(),
    titleEn: form.titleEn.trim(),
    bodyAr: form.bodyAr.trim(),
    bodyEn: form.bodyEn.trim(),
    imageUrl: form.imageUrl.trim() || null,
    ctaText: form.ctaText.trim() || null,
    ctaUrl: form.ctaUrl.trim() || null,
    openInNewTab: form.openInNewTab,
    audience: form.audience,
    pageScope: form.pageScope,
    frequency: form.frequency,
    sortOrder: Number(form.sortOrder) || 0,
    startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
    endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
  };
}

/**
 * @param {{
 *   open?: boolean;
 *   actionsInFooter?: boolean;
 *   actionHandlersRef?: import("react").MutableRefObject<{
 *     onSave?: () => void | Promise<void>;
 *     onDelete?: () => void | Promise<void>;
 *     onPreview?: () => void;
 *   }>;
 *   onActionMetaChange?: (meta: {
 *     saving: boolean;
 *     deleting: boolean;
 *     editingId: number | null;
 *     canPreview: boolean;
 *     isCreating: boolean;
 *     detailOpen: boolean;
 *   }) => void;
 * }} props
 */
export default function PopupAdsSettings({
  open = true,
  actionsInFooter = false,
  actionHandlersRef,
  onActionMetaChange,
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ads, setAds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async ({ keepSelection = true } = {}) => {
    setLoading(true);
    try {
      const res = await adminListPopupAdsRequest();
      const list = res?.data?.ads || [];
      setAds(list);
      if (!keepSelection) {
        setEditingId(null);
        setIsCreating(false);
        setForm({ ...EMPTY_FORM });
      } else {
        setEditingId((id) => {
          if (id != null) {
            const current = list.find((a) => a.id === id);
            if (current) setForm(mapAdToForm(current));
          }
          return id;
        });
      }
      setFieldErrors({});
    } catch (err) {
      toast.push({ type: "error", title: t("ads.toast.loadFailedTitle"), message: err?.response?.data?.message || "" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setIsCreating(false);
      setForm({ ...EMPTY_FORM });
      setFieldErrors({});
      setPreviewOpen(false);
      return;
    }
    void load({ keepSelection: false });
  }, [open, load]);

  const patch = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const startNew = () => {
    setIsCreating(true);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFieldErrors({});
  };

  const selectAd = (ad) => {
    setIsCreating(false);
    setEditingId(ad.id);
    setForm(mapAdToForm(ad));
    setFieldErrors({});
  };

  const detailOpen = isCreating || editingId != null;

  const payload = useMemo(() => buildPayload(form), [form]);

  const previewAd = useMemo(() => {
    if (!form.titleAr.trim() && !form.titleEn.trim()) return null;
    return {
      id: editingId || "preview",
      ...payload,
    };
  }, [form, payload, editingId]);

  const canPreview = Boolean(previewAd);

  const onSave = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      if (editingId) {
        await adminUpdatePopupAdRequest(editingId, payload);
        toast.push({ type: "success", title: t("ads.toast.savedTitle"), message: t("ads.popup.updatedMessage") });
      } else {
        const res = await adminCreatePopupAdRequest(payload);
        const created = res?.data?.ad;
        if (created?.id) {
          setEditingId(created.id);
          setIsCreating(false);
        }
        toast.push({ type: "success", title: t("ads.toast.createdTitle"), message: t("ads.popup.createdMessage") });
      }
      await load();
    } catch (err) {
      const errs = err?.response?.data?.fieldErrors;
      if (errs && typeof errs === "object") setFieldErrors(errs);
      toast.push({
        type: "error",
        title: t("ads.toast.saveFailedTitle"),
        message: err?.response?.data?.message || t("ads.toast.checkFields"),
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editingId) return;
    if (!window.confirm(t("ads.popup.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await adminDeletePopupAdRequest(editingId);
      toast.push({ type: "success", title: t("ads.toast.deletedTitle"), message: "" });
      setEditingId(null);
      setIsCreating(false);
      setForm({ ...EMPTY_FORM });
      await load({ keepSelection: false });
    } catch (err) {
      toast.push({ type: "error", title: t("ads.toast.deleteFailedTitle"), message: err?.response?.data?.message || "" });
    } finally {
      setDeleting(false);
    }
  };

  const onImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await adminUploadAdImageRequest(file, "main");
      const url = res?.data?.url;
      if (url) patch("imageUrl", url);
      toast.push({ type: "success", title: t("ads.toast.uploadSuccessTitle"), message: "" });
    } catch (err) {
      toast.push({ type: "error", title: t("ads.toast.uploadFailedTitle"), message: err?.response?.data?.message || "" });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!actionHandlersRef) return;
    actionHandlersRef.current = {
      onSave,
      onDelete,
      onPreview: () => setPreviewOpen(true),
    };
  });

  useEffect(() => {
    onActionMetaChange?.({
      saving,
      deleting,
      editingId,
      canPreview,
      isCreating,
      detailOpen,
    });
  }, [onActionMetaChange, saving, deleting, editingId, canPreview, isCreating, detailOpen]);

  if (!open) return null;

  if (loading) {
    return <DashboardLoadingState label={t("ads.popup.loading")} />;
  }

  return (
    <div className="oh-popup-ads-settings">
      <div className="oh-popup-ads-settings__list-head">
        <span className="oh-popup-ads-settings__list-title">{t("ads.popup.currentList")}</span>
        <button type="button" className={`btn btn-secondary btn-sm${isCreating ? " is-active" : ""}`} onClick={startNew}>
          {t("ads.popup.newAd")}
        </button>
      </div>

      {ads.length > 0 ? (
        <ul className="oh-popup-ads-settings__list">
          {ads.map((ad) => (
            <li key={ad.id}>
              <button
                type="button"
                className={`oh-popup-ads-settings__list-item${editingId === ad.id ? " is-active" : ""}`}
                onClick={() => selectAd(ad)}
              >
                <span className="oh-popup-ads-settings__list-item-title">
                  {ad.titleAr || ad.titleEn || t("ads.common.noTitle")}
                </span>
                <span className="oh-popup-ads-settings__list-item-meta">
                  {t(`ads.popup.pageScopeOptions.${ad.pageScope}`)} · {t(`ads.popup.audienceOptions.${ad.audience}`)}
                  {ad.enabled ? t("ads.common.enabledSuffix") : t("ads.common.disabledSuffix")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="oh-popup-ads-settings__empty">{t("ads.popup.empty")}</p>
      )}

      {!detailOpen ? (
        <div className="oh-popup-ads-settings__placeholder" role="status">
          <p className="oh-popup-ads-settings__placeholder-text">{t("ads.popup.selectHint")}</p>
        </div>
      ) : (
      <div className="oh-popup-ads-settings__grid">
        <div className="oh-popup-ads-settings__form">
          <label className="oh-popup-ads-settings__toggle">
            <input type="checkbox" checked={form.enabled} onChange={(e) => patch("enabled", e.target.checked)} />
            <span>{t("ads.popup.enable")}</span>
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>{t("ads.popup.titleAr")}</span>
            <input type="text" maxLength={200} value={form.titleAr} onChange={(e) => patch("titleAr", e.target.value)} />
            {fieldErrors.titleAr ? <span className="oh-popup-ads-settings__error">{fieldErrors.titleAr}</span> : null}
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>{t("ads.popup.titleEn")}</span>
            <input type="text" maxLength={200} value={form.titleEn} onChange={(e) => patch("titleEn", e.target.value)} />
            {fieldErrors.titleEn ? <span className="oh-popup-ads-settings__error">{fieldErrors.titleEn}</span> : null}
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>{t("ads.popup.bodyAr")}</span>
            <textarea rows={3} maxLength={2000} value={form.bodyAr} onChange={(e) => patch("bodyAr", e.target.value)} />
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>{t("ads.popup.bodyEn")}</span>
            <textarea rows={3} maxLength={2000} value={form.bodyEn} onChange={(e) => patch("bodyEn", e.target.value)} />
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>{t("ads.popup.imageField")}</span>
            <input type="url" value={form.imageUrl} onChange={(e) => patch("imageUrl", e.target.value)} dir="ltr" placeholder="https://…" />
            <div className="oh-popup-ads-settings__upload-row">
              <label className="btn btn-secondary btn-sm oh-popup-ads-settings__upload-btn">
                {uploading ? t("ads.common.uploading") : t("ads.popup.uploadImage")}
                <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => void onImagePick(e)} />
              </label>
            </div>
            {fieldErrors.imageUrl ? <span className="oh-popup-ads-settings__error">{fieldErrors.imageUrl}</span> : null}
          </label>

          <div className="oh-popup-ads-settings__row">
            <label className="oh-popup-ads-settings__field">
              <span>{t("ads.popup.buttonText")}</span>
              <input type="text" maxLength={120} value={form.ctaText} onChange={(e) => patch("ctaText", e.target.value)} />
              {fieldErrors.ctaText ? <span className="oh-popup-ads-settings__error">{fieldErrors.ctaText}</span> : null}
            </label>
            <label className="oh-popup-ads-settings__field">
              <span>{t("ads.popup.buttonUrl")}</span>
              <input type="url" value={form.ctaUrl} onChange={(e) => patch("ctaUrl", e.target.value)} dir="ltr" />
              {fieldErrors.ctaUrl ? <span className="oh-popup-ads-settings__error">{fieldErrors.ctaUrl}</span> : null}
            </label>
          </div>

          <label className="oh-popup-ads-settings__toggle">
            <input type="checkbox" checked={form.openInNewTab} onChange={(e) => patch("openInNewTab", e.target.checked)} />
            <span>{t("ads.popup.openNewTab")}</span>
          </label>

          <div className="oh-popup-ads-settings__row">
            <label className="oh-popup-ads-settings__field">
              <span>{t("ads.popup.audience")}</span>
              <select value={form.audience} onChange={(e) => patch("audience", e.target.value)}>
                <option value="all">{t("ads.popup.audienceOptions.all")}</option>
                <option value="guests">{t("ads.popup.audienceOptions.guests")}</option>
                <option value="freelancer">{t("ads.popup.audienceOptions.freelancer")}</option>
                <option value="client">{t("ads.popup.audienceOptions.client")}</option>
                <option value="staff">{t("ads.popup.audienceOptions.staff")}</option>
              </select>
            </label>
            <label className="oh-popup-ads-settings__field">
              <span>{t("ads.popup.pageScope")}</span>
              <select value={form.pageScope} onChange={(e) => patch("pageScope", e.target.value)}>
                <option value="all">{t("ads.popup.pageScopeOptions.all")}</option>
                <option value="home">{t("ads.popup.pageScopeOptions.home")}</option>
                <option value="public">{t("ads.popup.pageScopeOptions.public")}</option>
                <option value="dashboard">{t("ads.popup.pageScopeOptions.dashboard")}</option>
              </select>
            </label>
          </div>

          <label className="oh-popup-ads-settings__field">
            <span>{t("ads.popup.frequency")}</span>
            <select value={form.frequency} onChange={(e) => patch("frequency", e.target.value)}>
              <option value="session">{t("ads.popup.frequencyOptions.session")}</option>
              <option value="day">{t("ads.popup.frequencyOptions.day")}</option>
              <option value="every_visit">{t("ads.popup.frequencyOptions.every_visit")}</option>
              <option value="first_login_only">{t("ads.popup.frequencyOptions.first_login_only")}</option>
              <option value="every_login">{t("ads.popup.frequencyOptions.every_login")}</option>
            </select>
            {form.frequency === "first_login_only" ? (
              <span className="oh-popup-ads-settings__field-note">
                {t("ads.popup.firstLoginHint")}
                {form.audience === "guests" ? t("ads.popup.firstLoginGuests") : ""}
              </span>
            ) : null}
            {form.frequency === "every_login" ? (
              <span className="oh-popup-ads-settings__field-note">
                {t("ads.popup.everyLoginHint")}
                {form.audience === "guests" ? t("ads.popup.firstLoginGuests") : ""}
              </span>
            ) : null}
          </label>

          <div className="oh-popup-ads-settings__row">
            <label className="oh-popup-ads-settings__field">
              <span>{t("ads.popup.scheduleStart")}</span>
              <input type="datetime-local" value={form.startDate} onChange={(e) => patch("startDate", e.target.value)} />
            </label>
            <label className="oh-popup-ads-settings__field">
              <span>{t("ads.popup.scheduleEnd")}</span>
              <input type="datetime-local" value={form.endDate} onChange={(e) => patch("endDate", e.target.value)} />
            </label>
          </div>

          {actionsInFooter ? null : (
            <div className="oh-popup-ads-settings__actions">
              <button type="button" className="btn btn-secondary" disabled={!canPreview} onClick={() => setPreviewOpen(true)}>
                {t("ads.common.preview")}
              </button>
              {editingId ? (
                <button type="button" className="btn btn-secondary" disabled={saving || deleting} onClick={() => void onDelete()}>
                  {deleting ? t("ads.common.deleting") : t("ads.common.delete")}
                </button>
              ) : null}
              <button type="button" className="btn btn-primary" disabled={saving || deleting} onClick={() => void onSave()}>
                {saving ? t("ads.common.saving") : t("ads.common.save")}
              </button>
            </div>
          )}
        </div>

        <aside className="oh-popup-ads-settings__hint" aria-label={t("ads.common.guidelines")}>
          <p className="oh-popup-ads-settings__hint-title">{t("ads.popup.hintTitle")}</p>
          <ul className="oh-popup-ads-settings__hint-list">
            <li>{t("ads.popup.hint1")}</li>
            <li>{t("ads.popup.hint2")}</li>
            <li>{t("ads.popup.hint3")}</li>
            <li>{t("ads.popup.hint4")}</li>
            <li>{t("ads.popup.hint5")}</li>
            <li>{t("ads.popup.hint6")}</li>
          </ul>
        </aside>
      </div>
      )}

      {previewOpen && previewAd ? (
        <PopupAdModal
          ad={previewAd}
          onClose={() => {
            setPreviewOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
