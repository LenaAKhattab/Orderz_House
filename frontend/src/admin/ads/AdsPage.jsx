import { useCallback, useEffect, useMemo, useState } from "react";
import AdForm from "./AdForm";
import { buildPayloadFromForm, emptyAdForm, mapApiAdToForm } from "./adFormUtils";
import { getLayoutOption, PLACEMENT_OPTIONS } from "./adFormConstants";
import { hasBlockingErrors, validateAdFormFrontend } from "./adFormValidation";
import { getAdAdminStatus } from "./adAdminStatus";
import AdPreview from "./AdPreview";
import AdRescheduleModal from "./AdRescheduleModal";
import "./adminAds.css";
import {
  adminCreateAdRequest,
  adminDeleteAdRequest,
  adminDuplicateAdRequest,
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
import StatusBadge from "../../components/dashboard/StatusBadge";

const PLACEMENT_LABEL = Object.fromEntries(PLACEMENT_OPTIONS.map((p) => [p.value, p.label]));
const LAYOUT_LABEL = {
  image_top: "صورة بالأعلى",
  image_background: "صورة كخلفية",
  text_only: "نص فقط",
  split: "تقسيم صورة ونص",
  minimal_banner: "بانر بسيط",
  carousel: "صور متعددة",
};

const THEME_LABEL_AR = {
  purple: "بنفسجي",
  green: "أخضر",
  orange: "برتقالي",
  blue: "أزرق",
};

/** عمود «الظهور»: تشغيل/إيقاف بدون تواريخ، أو وقت البداية */
function fmtAppearCell(ad, nowMs = Date.now()) {
  const hasStart = ad.startDate != null && String(ad.startDate).trim() !== "";
  const hasEnd = ad.endDate != null && String(ad.endDate).trim() !== "";
  if (!hasStart && !hasEnd) {
    return (
      <div className="oh-admin-ads__appear-cell">
        <span className="oh-admin-ads__appear-primary">تشغيل / إيقاف</span>
        <span className="oh-admin-ads__appear-sub">فوري</span>
      </div>
    );
  }
  if (!hasStart && hasEnd) {
    try {
      const ed = new Date(ad.endDate);
      if (!Number.isNaN(ed.getTime())) {
        return (
          <div className="oh-admin-ads__appear-cell">
            <span className="oh-admin-ads__appear-primary">بدون بداية محددة</span>
            <span className="oh-admin-ads__appear-sub">ينتهي {ed.toLocaleString("ar")}</span>
          </div>
        );
      }
    } catch {
      /* ignore */
    }
  }
  if (hasStart) {
    try {
      const d = new Date(ad.startDate);
      if (!Number.isNaN(d.getTime())) {
        const sub = d.getTime() > nowMs ? "بداية مجدولة" : "بدأ العرض";
        return (
          <div className="oh-admin-ads__appear-cell">
            <span className="oh-admin-ads__appear-primary">{d.toLocaleString("ar")}</span>
            <span className="oh-admin-ads__appear-sub">{sub}</span>
          </div>
        );
      }
    } catch {
      /* ignore */
    }
  }
  return <span className="oh-admin-ads__appear-sub">—</span>;
}

function fmtAdminEnd(iso) {
  if (!iso) return "بدون نهاية";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ar");
  } catch {
    return "—";
  }
}

/** لمقارنة start/end بين النموذج والخادم قبل إرسال PATCH جزئي */
function normDateForCompare(iso) {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AdsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [ads, setAds] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyAdForm());
  const [saving, setSaving] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [rescheduleAd, setRescheduleAd] = useState(null);
  const [reorderBusy, setReorderBusy] = useState(false);

  /** Recalculate admin status badges every 30s without refetching the list. */
  const [nowTick, setNowTick] = useState(() => Date.now());

  const validationResult = useMemo(() => validateAdFormFrontend(form), [form]);
  const formWarningsLive = validationResult.warnings;

  const handleFormChange = useCallback((next) => {
    setForm(next);
    setAttemptedSave(false);
  }, []);

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
      if (!silent) {
        setLoadError(err?.response?.data?.message || "حاول مرة أخرى.");
      }
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
    const t = window.setInterval(() => void load({ silent: true }), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyAdForm());
    setAttemptedSave(false);
    setModalOpen(true);
  };

  const openEdit = (ad) => {
    setEditingId(ad.id);
    setForm(mapApiAdToForm(ad));
    setAttemptedSave(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const onSave = async () => {
    setAttemptedSave(true);
    const v = validateAdFormFrontend(form);
    if (hasBlockingErrors(v)) {
      toast.push({
        type: "warning",
        title: "تأكد من الحقول",
        message: "صحّح الأخطاء المشار إليها أدناه ثم أعد المحاولة.",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayloadFromForm(form);
      if (editingId) {
        await adminUpdateAdRequest(editingId, payload);
        toast.push({ type: "success", title: "تم الحفظ", message: "تم تحديث الإعلان." });
      } else {
        await adminCreateAdRequest(payload);
        toast.push({ type: "success", title: "تم الإنشاء", message: "تمت إضافة الإعلان." });
      }
      setModalOpen(false);
      setAttemptedSave(false);
      await load();
    } catch (err) {
      toast.push({
        type: "error",
        title: "فشل الحفظ",
        message: err?.response?.data?.message || "تحقق من الحقول.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("حذف هذا الإعلان نهائيًا؟")) return;
    try {
      await adminDeleteAdRequest(id);
      toast.push({ type: "success", title: "تم الحذف", message: "" });
      await load();
    } catch (err) {
      toast.push({
        type: "error",
        title: "تعذر الحذف",
        message: err?.response?.data?.message || "",
      });
    }
  };

  const onDuplicate = async (id) => {
    try {
      await adminDuplicateAdRequest(id);
      toast.push({ type: "success", title: "تم النسخ", message: "نسخة جديدة غير مفعّلة." });
      await load();
    } catch (err) {
      toast.push({
        type: "error",
        title: "فشل النسخ",
        message: err?.response?.data?.message || "",
      });
    }
  };

  const moveRow = useCallback(
    async (index, dir) => {
      const row = [...ads].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const j = index + dir;
      if (j < 0 || j >= row.length) return;
      const snapshot = ads.map((a) => ({ ...a }));
      const nextRow = [...row];
      [nextRow[index], nextRow[j]] = [nextRow[j], nextRow[index]];
      const nextList = nextRow.map((a, i) => ({ ...a, sortOrder: i }));
      setAds(nextList);
      setReorderBusy(true);
      try {
        await adminReorderAdsRequest(nextList.map((a, i) => ({ id: Number(a.id), sortOrder: i })));
        toast.push({ type: "success", title: "تم تحديث الترتيب", message: "" });
      } catch (err) {
        setAds(snapshot);
        toast.push({
          type: "error",
          title: "تعذر تحديث الترتيب",
          message: err?.response?.data?.message || "حاول مرة أخرى.",
        });
      } finally {
        setReorderBusy(false);
      }
    },
    [ads, toast],
  );

  const handleRescheduleSubmit = useCallback(
    async (payload) => {
      const orig = rescheduleAd;
      if (!orig) return;
      const patch = {};
      if (Boolean(payload.isActive) !== Boolean(orig.isActive)) {
        patch.isActive = payload.isActive;
      }
      const nStart = normDateForCompare(payload.startDate);
      const oStart = normDateForCompare(orig.startDate);
      if (nStart !== oStart) {
        patch.startDate = payload.startDate;
      }
      const nEnd = normDateForCompare(payload.endDate);
      const oEnd = normDateForCompare(orig.endDate);
      if (nEnd !== oEnd) {
        patch.endDate = payload.endDate;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }
      try {
        await adminUpdateAdRequest(orig.id, patch);
        toast.push({ type: "success", title: "تم الحفظ", message: "تم تحديث الجدولة." });
        await load({ silent: true });
      } catch (err) {
        toast.push({
          type: "error",
          title: "خطأ",
          message: err?.response?.data?.message || "تعذر حفظ التغييرات، حاول مرة أخرى.",
        });
        throw err;
      }
    },
    [rescheduleAd, toast, load],
  );

  const sorted = useMemo(() => [...ads].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [ads]);

  const fieldErrorsForForm = attemptedSave ? validationResult.errors : {};
  const imageUrlErrorsForForm = attemptedSave ? validationResult.imageUrlErrors : {};

  const loadErrorActions = (
    <>
      <button type="button" className="btn btn-primary" disabled={loading} onClick={() => load()}>
        إعادة المحاولة
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setLoadError(null)}>
        إخفاء
      </button>
    </>
  );

  return (
    <>
      <DashboardShell>
        <DashboardPageHeader
          eyebrow="لوحة التحكم"
          title="إدارة الإعلانات"
          description="إنشاء إعلانات بسيطة للزوار — عنوان، وصف، صورة، وزر."
          breadcrumbs={[
            { label: "الرئيسية", href: breadcrumbHomeFromUser(user) },
            { label: "الإعلانات" },
          ]}
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                + إعلان جديد
              </button>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => load()}>
                تحديث القائمة
              </button>
            </>
          }
        />

        {loadError ? (
          <DashboardErrorState
            className="mb-4"
            message={
              <>
                <strong>تعذر التحميل</strong>
                <div className="mt-1 text-[0.92rem] font-bold opacity-95">{loadError}</div>
              </>
            }
            actions={loadErrorActions}
          />
        ) : null}

        <DashboardSection>
          {loading ? (
            <DashboardLoadingState label="جارٍ التحميل…" />
          ) : !loadError && sorted.length === 0 ? (
            <DashboardEmptyState title="لا توجد إعلانات بعد." />
          ) : (
            <div className="oh-admin-ads__table-wrap">
                <table className="oh-admin-ads__table">
                  <thead>
                    <tr>
                      <th>العنوان</th>
                      <th>الحالة</th>
                      <th>المكان</th>
                      <th>التخطيط</th>
                      <th>الظهور</th>
                      <th>النهاية</th>
                      <th>الترتيب</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadError ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                          تعذر تحميل الجدول — استخدم «إعادة المحاولة» أعلاه أو «تحديث القائمة».
                        </td>
                      </tr>
                    ) : (
                      sorted.map((ad, idx) => {
                        const status = getAdAdminStatus(ad, new Date(nowTick));
                        const canUp = idx > 0;
                        const canDown = idx < sorted.length - 1;
                        return (
                          <tr key={ad.id} className={reorderBusy ? "oh-admin-ads__row--reordering" : undefined}>
                            <td style={{ whiteSpace: "normal", maxWidth: 240 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span>{ad.title}</span>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                  {ad.isFeatured ? (
                                    <span className="oh-admin-ads__mini-tag" title="يظهر كبيرًا في عمود العروض">
                                      مميز
                                    </span>
                                  ) : null}
                                  {ad.themePreset ? (
                                    <span className="oh-admin-ads__mini-tag">
                                      {THEME_LABEL_AR[ad.themePreset] || ad.themePreset}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="oh-admin-ads__admin-status-cell">
                                <span title={status.description}>
                                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                                </span>
                                {status.key === "expired" && ad.isActive ? (
                                  <span className="oh-admin-ads__admin-status-sub">كان مفعّلًا</span>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <span className="oh-admin-ads__mini-tag">{PLACEMENT_LABEL[ad.placement] || ad.placement}</span>
                            </td>
                            <td>
                              <span className="oh-admin-ads__mini-tag">
                                {LAYOUT_LABEL[ad.layoutType] || getLayoutOption(ad.layoutType).label}
                              </span>
                            </td>
                            <td className="oh-admin-ads__appear-td">{fmtAppearCell(ad, nowTick)}</td>
                            <td>{fmtAdminEnd(ad.endDate)}</td>
                            <td className="oh-admin-ads__sort-td">
                              <div className="oh-admin-ads__sort-arrows" aria-busy={reorderBusy}>
                                <button
                                  type="button"
                                  className="btn btn-secondary oh-admin-ads__sort-btn"
                                  disabled={!canUp || reorderBusy}
                                  title="أعلى"
                                  aria-label="نقل لأعلى"
                                  onClick={() => void moveRow(idx, -1)}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary oh-admin-ads__sort-btn"
                                  disabled={!canDown || reorderBusy}
                                  title="أسفل"
                                  aria-label="نقل لأسفل"
                                  onClick={() => void moveRow(idx, 1)}
                                >
                                  ↓
                                </button>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                  onClick={() => openEdit(ad)}
                                >
                                  تعديل
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                  onClick={() => setRescheduleAd(ad)}
                                >
                                  إعادة جدولة
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                  onClick={() => onDuplicate(ad.id)}
                                >
                                  نسخ
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                  onClick={() => onDelete(ad.id)}
                                >
                                  حذف
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
        </DashboardSection>
      </DashboardShell>

      {modalOpen ? (
        <div className="oh-admin-ads__modal" role="dialog" aria-modal="true" aria-labelledby="ads-modal-title">
          <div className="oh-admin-ads__modal-card">
            <div className="oh-admin-ads__modal-header">
              <h2 id="ads-modal-title" className="oh-admin-ads__modal-title">
                {editingId ? "تعديل إعلان" : "إعلان جديد"}
              </h2>
              <div className="oh-admin-ads__modal-actions">
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={closeModal}>
                  إلغاء
                </button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
                  {saving ? "جارٍ الحفظ…" : "حفظ"}
                </button>
              </div>
            </div>

            <div className="oh-admin-ads__split">
              <AdForm
                data={form}
                onChange={handleFormChange}
                fieldErrors={fieldErrorsForForm}
                imageUrlErrors={imageUrlErrorsForForm}
                attemptedSave={attemptedSave}
              />
              <aside className="oh-admin-ads__preview" aria-label="معاينة الإعلان">
                <AdPreview draft={{ ...form, id: editingId || "preview" }} extraWarnings={formWarningsLive} />
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {rescheduleAd ? (
        <AdRescheduleModal
          key={rescheduleAd.id}
          ad={rescheduleAd}
          statusLabel={getAdAdminStatus(rescheduleAd, new Date(nowTick)).label}
          onClose={() => setRescheduleAd(null)}
          onSubmit={(payload) => handleRescheduleSubmit(payload)}
        />
      ) : null}
    </>
  );
}
