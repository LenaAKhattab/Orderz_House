import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import AdBuilderForm from "./AdBuilderForm";
import { buildPayloadFromForm, emptyAdForm, mapApiAdToForm } from "./adFormUtils";
import { PLACEMENT_OPTIONS } from "./adFormConstants";
import { hasBlockingErrors, validateAdFormFrontend } from "./adFormValidation";
import AdPreview from "./AdPreview";
import AdsManagementTable from "./AdsManagementTable";
import AdsReorderSection from "./AdsReorderSection";
import "./adminAds.css";
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

function promptAdminNote(actionLabel) {
  const note = window.prompt(`${actionLabel}\nسبب الإجراء (3 أحرف على الأقل):`);
  if (note == null) return null;
  const t = note.trim();
  if (t.length < 3) return "";
  return t;
}

function fmtRelative(ts) {
  if (!ts) return "";
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 8) return "الآن";
  if (sec < 60) return `منذ ${sec} ث`;
  const min = Math.round(sec / 60);
  return `منذ ${min} د`;
}

export default function AdsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const builderRef = useRef(null);
  const [ads, setAds] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyAdForm());
  const [saving, setSaving] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderPlacement, setReorderPlacement] = useState("home_right_panel");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [activeStep, setActiveStep] = useState(1);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [lastEditedAt, setLastEditedAt] = useState(null);
  const [formBaseline, setFormBaseline] = useState(() => JSON.stringify(emptyAdForm()));
  const previewDraft = useDeferredValue(form);

  const validationResult = useMemo(() => validateAdFormFrontend(form, { requireReason: true }), [form]);

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
      if (!silent) setLoadError(err?.response?.data?.message || "حاول مرة أخرى.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (form.placement) setReorderPlacement(form.placement);
  }, [form.placement]);

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
    setReorderPlacement(ad.placement || "home_right_panel");
    requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const saveWithMode = useCallback(
    async (publish) => {
      setAttemptedSave(true);
      const v = validateAdFormFrontend(form, { requireReason: true });
      if (hasBlockingErrors(v)) {
        toast.push({ type: "warning", title: "تأكد من الحقول", message: "صحّح الأخطاء المشار إليها ثم أعد المحاولة." });
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
          toast.push({ type: "success", title: "تم الحفظ", message: publish ? "تم نشر الإعلان." : "تم حفظ المسودة." });
        } else {
          await adminCreateAdRequest(body);
          toast.push({ type: "success", title: "تم الإنشاء", message: publish ? "تم نشر الإعلان." : "تم حفظ المسودة." });
        }
        resetBuilder();
        await load({ silent: true });
      } catch (err) {
        toast.push({ type: "error", title: "فشل الحفظ", message: err?.response?.data?.message || "تحقق من الحقول." });
      } finally {
        setSaving(false);
      }
    },
    [form, editingId, toast, resetBuilder, load],
  );

  const handleToggleActive = useCallback(
    async (ad, nextActive) => {
      const note = promptAdminNote(nextActive ? "تفعيل الإعلان" : "تعطيل الإعلان");
      if (note === null) return;
      if (note === "") {
        toast.push({ type: "warning", title: "سبب مطلوب", message: "أدخل سببًا من 3 أحرف على الأقل." });
        return;
      }
      try {
        await adminUpdateAdRequest(ad.id, { isActive: nextActive, adminNote: note });
        toast.push({ type: "success", title: "تم التحديث", message: nextActive ? "تم تفعيل الإعلان." : "تم تعطيل الإعلان." });
        await load({ silent: true });
        if (String(editingId) === String(ad.id)) {
          setForm((f) => ({ ...f, isActive: nextActive }));
        }
      } catch (err) {
        toast.push({ type: "error", title: "خطأ", message: err?.response?.data?.message || "" });
      }
    },
    [toast, load, editingId],
  );

  const handleDelete = useCallback(
    async (id) => {
      if (!window.confirm("حذف هذا الإعلان نهائيًا؟")) return;
      const note = promptAdminNote("حذف الإعلان");
      if (note === null) return;
      if (note === "") {
        toast.push({ type: "warning", title: "سبب مطلوب", message: "أدخل سببًا من 3 أحرف على الأقل." });
        return;
      }
      try {
        await adminDeleteAdRequest(id, { adminNote: note });
        toast.push({ type: "success", title: "تم الحذف", message: "" });
        if (String(editingId) === String(id)) resetBuilder();
        await load({ silent: true });
      } catch (err) {
        toast.push({ type: "error", title: "تعذر الحذف", message: err?.response?.data?.message || "" });
      }
    },
    [toast, load, editingId, resetBuilder],
  );

  const placementAds = useMemo(
    () =>
      [...ads]
        .filter((a) => a.placement === reorderPlacement)
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)),
    [ads, reorderPlacement],
  );

  const tableAds = useMemo(() => [...ads].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)), [ads]);

  const editingAd = useMemo(() => ads.find((a) => String(a.id) === String(editingId)) || null, [ads, editingId]);

  const applyReorder = useCallback(
    async (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      const note = promptAdminNote("إعادة ترتيب الإعلانات");
      if (note === null) return;
      if (note === "") {
        toast.push({ type: "warning", title: "سبب مطلوب", message: "أدخل سببًا من 3 أحرف على الأقل." });
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
          a.placement === reorderPlacement && map.has(String(a.id)) ? { ...a, sortOrder: map.get(String(a.id)) } : a,
        );
      });
      setReorderBusy(true);
      try {
        await adminReorderAdsRequest({ placement: reorderPlacement, items, adminNote: note });
        toast.push({ type: "success", title: "تم تحديث الترتيب", message: "" });
      } catch (err) {
        setAds(snapshot);
        toast.push({ type: "error", title: "تعذر الترتيب", message: err?.response?.data?.message || "" });
      } finally {
        setReorderBusy(false);
      }
    },
    [placementAds, ads, reorderPlacement, toast],
  );

  const fieldErrorsForForm = attemptedSave ? validationResult.errors : {};
  const imageUrlErrorsForForm = attemptedSave ? validationResult.imageUrlErrors : {};

  const orderStepSlot = (
    <>
      <div className="oh-admin-ads__reorder-toolbar oh-admin-ads__reorder-toolbar--studio">
        <label htmlFor="reorder-placement" className="oh-admin-ads__reorder-label">
          مكان العرض
        </label>
        <select
          id="reorder-placement"
          value={reorderPlacement}
          onChange={(e) => setReorderPlacement(e.target.value)}
          className="oh-admin-ads__reorder-select"
        >
          {PLACEMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="oh-admin-ads__field-hint">اسحب البطاقات لإعادة الترتيب</span>
      </div>
      <AdsReorderSection ads={placementAds} onReorder={applyReorder} busy={reorderBusy} nowTick={nowTick} />
    </>
  );

  return (
    <DashboardShell className="oh-admin-ads-page">
      <DashboardPageHeader
        eyebrow="لوحة التحكم"
        title="إدارة الإعلانات"
        description="بناء سريع، معاينة فورية، ونشر بخطوات واضحة."
        breadcrumbs={[
          { label: "الرئيسية", href: breadcrumbHomeFromUser(user) },
          { label: "الإعلانات" },
        ]}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={startNewAd}>
              إعلان جديد
            </button>
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => load()}>
              تحديث
            </button>
          </>
        }
      />

      {loadError ? (
        <DashboardErrorState
          className="mb-4"
          message={loadError}
          actions={
            <button type="button" className="btn btn-primary" onClick={() => load()}>
              إعادة المحاولة
            </button>
          }
        />
      ) : null}

      <DashboardSection>
        <div ref={builderRef} className="oh-admin-ads__studio">
          <div className="oh-admin-ads__studio-head">
            <div>
              <h2 className="oh-admin-ads__workspace-title">{editingId ? "تعديل إعلان" : "بناء إعلان جديد"}</h2>
              <p className="oh-admin-ads__studio-sub">
                {isDirty ? (
                  <span className="oh-admin-ads__draft-badge">مسودة غير محفوظة · {fmtRelative(lastEditedAt)}</span>
                ) : (
                  <span className="oh-admin-ads__draft-badge oh-admin-ads__draft-badge--saved">متزامن</span>
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

            <aside className="oh-admin-ads__studio-preview" aria-label="معاينة الإعلان">
              <AdPreview draft={{ ...previewDraft, id: editingId || "preview" }} />
            </aside>
          </div>

          <button
            type="button"
            className="oh-admin-ads__preview-fab"
            aria-expanded={mobilePreviewOpen}
            onClick={() => setMobilePreviewOpen(true)}
          >
            معاينة
          </button>

          {mobilePreviewOpen ? (
            <div className="oh-admin-ads__preview-drawer" role="dialog" aria-modal="true" aria-label="معاينة الإعلان">
              <div className="oh-admin-ads__preview-drawer-backdrop" onClick={() => setMobilePreviewOpen(false)} aria-hidden />
              <div className="oh-admin-ads__preview-drawer-panel">
                <header className="oh-admin-ads__preview-drawer-head">
                  <strong>معاينة كاملة</strong>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMobilePreviewOpen(false)}>
                    إغلاق
                  </button>
                </header>
                <AdPreview draft={{ ...previewDraft, id: editingId || "preview" }} compact />
              </div>
            </div>
          ) : null}

          <footer className="oh-admin-ads__action-bar">
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={resetBuilder}>
              إعادة تعيين
            </button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setMobilePreviewOpen(true)}>
              معاينة كاملة
            </button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => saveWithMode(false)}>
              {saving ? "جارٍ…" : "حفظ كمسودة"}
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => saveWithMode(true)}>
              {saving ? "جارٍ…" : "نشر الإعلان"}
            </button>
          </footer>
        </div>
      </DashboardSection>

      <DashboardSection title="جميع الإعلانات" description="تعديل سريع، إحصاءات، وإدارة الحالة.">
        {loading ? (
          <DashboardLoadingState label="جارٍ التحميل…" />
        ) : !loadError && tableAds.length === 0 ? (
          <DashboardEmptyState title="لا توجد إعلانات بعد." />
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
