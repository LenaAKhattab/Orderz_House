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

function audienceLabel(value) {
  const map = {
    all: "الجميع",
    guests: "الزوار فقط",
    freelancer: "المستقلون",
    client: "العملاء",
    staff: "الإدارة",
  };
  return map[value] || value;
}

function pageScopeLabel(value) {
  const map = {
    all: "كل الصفحات",
    home: "الصفحة الرئيسية",
    public: "الموقع العام",
    dashboard: "لوحات التحكم",
  };
  return map[value] || value;
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
 * @param {{ open?: boolean }} props
 */
export default function PopupAdsSettings({ open = true }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ads, setAds] = useState([]);
  const [editingId, setEditingId] = useState(null);
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
        if (list.length > 0) {
          setEditingId(list[0].id);
          setForm(mapAdToForm(list[0]));
        } else {
          setEditingId(null);
          setForm({ ...EMPTY_FORM });
        }
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
      toast.push({ type: "error", title: "تعذر التحميل", message: err?.response?.data?.message || "" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
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
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFieldErrors({});
  };

  const selectAd = (ad) => {
    setEditingId(ad.id);
    setForm(mapAdToForm(ad));
    setFieldErrors({});
  };

  const payload = useMemo(() => buildPayload(form), [form]);

  const previewAd = useMemo(() => {
    if (!form.titleAr.trim() && !form.titleEn.trim()) return null;
    return {
      id: editingId || "preview",
      ...payload,
    };
  }, [form, payload, editingId]);

  const onSave = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      if (editingId) {
        await adminUpdatePopupAdRequest(editingId, payload);
        toast.push({ type: "success", title: "تم الحفظ", message: "تم تحديث إعلان النافذة المنبثقة." });
      } else {
        const res = await adminCreatePopupAdRequest(payload);
        const created = res?.data?.ad;
        if (created?.id) setEditingId(created.id);
        toast.push({ type: "success", title: "تم الإنشاء", message: "تم إنشاء إعلان النافذة المنبثقة." });
      }
      await load();
    } catch (err) {
      const errs = err?.response?.data?.fieldErrors;
      if (errs && typeof errs === "object") setFieldErrors(errs);
      toast.push({
        type: "error",
        title: "فشل الحفظ",
        message: err?.response?.data?.message || "تحقق من الحقول.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editingId) return;
    if (!window.confirm("حذف هذا الإعلان المنبثق؟")) return;
    setDeleting(true);
    try {
      await adminDeletePopupAdRequest(editingId);
      toast.push({ type: "success", title: "تم الحذف", message: "" });
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      toast.push({ type: "error", title: "تعذر الحذف", message: err?.response?.data?.message || "" });
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
      toast.push({ type: "success", title: "تم رفع الصورة", message: "" });
    } catch (err) {
      toast.push({ type: "error", title: "فشل الرفع", message: err?.response?.data?.message || "" });
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  if (loading) {
    return <DashboardLoadingState label="جارٍ تحميل إعلانات النوافذ المنبثقة…" />;
  }

  return (
    <div className="oh-popup-ads-settings">
      <div className="oh-popup-ads-settings__list-head">
        <span className="oh-popup-ads-settings__list-title">الإعلانات الحالية</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={startNew}>
          إعلان جديد
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
                <span className="oh-popup-ads-settings__list-item-title">{ad.titleAr || ad.titleEn || "بدون عنوان"}</span>
                <span className="oh-popup-ads-settings__list-item-meta">
                  {pageScopeLabel(ad.pageScope)} · {audienceLabel(ad.audience)}
                  {ad.enabled ? " · مفعّل" : " · معطّل"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="oh-popup-ads-settings__empty">لا توجد نوافذ منبثقة بعد. أنشئ إعلاناً جديداً.</p>
      )}

      <div className="oh-popup-ads-settings__grid">
        <div className="oh-popup-ads-settings__form">
          <label className="oh-popup-ads-settings__toggle">
            <input type="checkbox" checked={form.enabled} onChange={(e) => patch("enabled", e.target.checked)} />
            <span>تفعيل الإعلان المنبثق</span>
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>العنوان بالعربية</span>
            <input type="text" maxLength={200} value={form.titleAr} onChange={(e) => patch("titleAr", e.target.value)} />
            {fieldErrors.titleAr ? <span className="oh-popup-ads-settings__error">{fieldErrors.titleAr}</span> : null}
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>العنوان بالإنجليزية (اختياري)</span>
            <input type="text" maxLength={200} value={form.titleEn} onChange={(e) => patch("titleEn", e.target.value)} />
            {fieldErrors.titleEn ? <span className="oh-popup-ads-settings__error">{fieldErrors.titleEn}</span> : null}
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>النص بالعربية</span>
            <textarea rows={3} maxLength={2000} value={form.bodyAr} onChange={(e) => patch("bodyAr", e.target.value)} />
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>النص بالإنجليزية (اختياري)</span>
            <textarea rows={3} maxLength={2000} value={form.bodyEn} onChange={(e) => patch("bodyEn", e.target.value)} />
          </label>

          <label className="oh-popup-ads-settings__field">
            <span>صورة (رابط أو رفع)</span>
            <input type="url" value={form.imageUrl} onChange={(e) => patch("imageUrl", e.target.value)} dir="ltr" placeholder="https://…" />
            <div className="oh-popup-ads-settings__upload-row">
              <label className="btn btn-secondary btn-sm oh-popup-ads-settings__upload-btn">
                {uploading ? "جارٍ الرفع…" : "رفع صورة"}
                <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => void onImagePick(e)} />
              </label>
            </div>
            {fieldErrors.imageUrl ? <span className="oh-popup-ads-settings__error">{fieldErrors.imageUrl}</span> : null}
          </label>

          <div className="oh-popup-ads-settings__row">
            <label className="oh-popup-ads-settings__field">
              <span>نص الزر</span>
              <input type="text" maxLength={120} value={form.ctaText} onChange={(e) => patch("ctaText", e.target.value)} />
              {fieldErrors.ctaText ? <span className="oh-popup-ads-settings__error">{fieldErrors.ctaText}</span> : null}
            </label>
            <label className="oh-popup-ads-settings__field">
              <span>رابط الزر</span>
              <input type="url" value={form.ctaUrl} onChange={(e) => patch("ctaUrl", e.target.value)} dir="ltr" />
              {fieldErrors.ctaUrl ? <span className="oh-popup-ads-settings__error">{fieldErrors.ctaUrl}</span> : null}
            </label>
          </div>

          <label className="oh-popup-ads-settings__toggle">
            <input type="checkbox" checked={form.openInNewTab} onChange={(e) => patch("openInNewTab", e.target.checked)} />
            <span>فتح الرابط في تبويب جديد</span>
          </label>

          <div className="oh-popup-ads-settings__row">
            <label className="oh-popup-ads-settings__field">
              <span>الجمهور</span>
              <select value={form.audience} onChange={(e) => patch("audience", e.target.value)}>
                <option value="all">الجميع</option>
                <option value="guests">الزوار فقط</option>
                <option value="freelancer">المستقلون</option>
                <option value="client">العملاء</option>
                <option value="staff">الإدارة</option>
              </select>
            </label>
            <label className="oh-popup-ads-settings__field">
              <span>نطاق الصفحات</span>
              <select value={form.pageScope} onChange={(e) => patch("pageScope", e.target.value)}>
                <option value="all">كل الصفحات</option>
                <option value="home">الصفحة الرئيسية</option>
                <option value="public">الموقع العام (بدون لوحة التحكم)</option>
                <option value="dashboard">لوحات التحكم</option>
              </select>
            </label>
          </div>

          <div className="oh-popup-ads-settings__row">
            <label className="oh-popup-ads-settings__field">
              <span>تكرار الظهور</span>
              <select value={form.frequency} onChange={(e) => patch("frequency", e.target.value)}>
                <option value="session">مرة لكل جلسة</option>
                <option value="day">مرة يومياً</option>
                <option value="every_visit">كل زيارة لصفحة</option>
              </select>
            </label>
            <label className="oh-popup-ads-settings__field">
              <span>ترتيب العرض</span>
              <input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => patch("sortOrder", e.target.value)}
              />
            </label>
          </div>

          <div className="oh-popup-ads-settings__row">
            <label className="oh-popup-ads-settings__field">
              <span>بداية العرض (اختياري)</span>
              <input type="datetime-local" value={form.startDate} onChange={(e) => patch("startDate", e.target.value)} />
            </label>
            <label className="oh-popup-ads-settings__field">
              <span>نهاية العرض (اختياري)</span>
              <input type="datetime-local" value={form.endDate} onChange={(e) => patch("endDate", e.target.value)} />
            </label>
          </div>

          <div className="oh-popup-ads-settings__actions">
            <button type="button" className="btn btn-secondary" disabled={!previewAd} onClick={() => setPreviewOpen(true)}>
              معاينة
            </button>
            {editingId ? (
              <button type="button" className="btn btn-secondary" disabled={saving || deleting} onClick={() => void onDelete()}>
                {deleting ? "جارٍ الحذف…" : "حذف"}
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" disabled={saving || deleting} onClick={() => void onSave()}>
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </div>

        <aside className="oh-popup-ads-settings__hint" aria-label="إرشادات">
          <p className="oh-popup-ads-settings__hint-title">كيف تعمل النوافذ المنبثقة؟</p>
          <ul className="oh-popup-ads-settings__hint-list">
            <li>يُعرض إعلان واحد فقط في كل مرة حسب الترتيب.</li>
            <li>بعد الإغلاق، يُحترم خيار «تكرار الظهور» (جلسة / يوم / زيارة).</li>
            <li>الجمهور يُحدَّد حسب دور المستخدم أو كونه زائراً.</li>
            <li>يمكن جدولة العرض بتواريخ البداية والنهاية.</li>
          </ul>
        </aside>
      </div>

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
