import { useCallback, useEffect, useState } from "react";
import {
  adminCreateCourseTextAdRequest,
  adminDeleteCourseTextAdRequest,
  adminListCourseTextAdsRequest,
  adminUpdateCourseTextAdRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import DashboardModal from "../../components/dashboard/DashboardModal";
import { invalidateCourseSideTextAdCache } from "../../components/dashboard/courses/CourseSideTextAd";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";

const EMPTY_FORM = {
  enabled: false,
  textAr: "",
  textEn: "",
  url: "",
  placement: "both",
  courseId: "",
  speed: "normal",
  textColor: "blue",
};

const TAB_CURRENT = "current";
const TAB_NEW = "new";

function mapAdToForm(ad) {
  if (!ad) return { ...EMPTY_FORM };
  return {
    enabled: Boolean(ad.enabled),
    textAr: ad.textAr || "",
    textEn: ad.textEn || "",
    url: ad.url || "",
    placement: ad.placement || "both",
    courseId: ad.courseId != null ? String(ad.courseId) : "",
    speed: ["slow", "fast"].includes(ad.speed) ? ad.speed : "normal",
    textColor: ["black", "red"].includes(ad.textColor) ? ad.textColor : "blue",
  };
}

function placementLabel(value) {
  const map = {
    courses_list: "صفحة الدورات الرئيسية",
    all_course_details: "صفحات تفاصيل الدورات",
    both: "كلاهما",
    specific_course: "دورة محددة",
  };
  return map[value] || value;
}

function speedLabel(value) {
  const map = { slow: "بطيء", normal: "عادي", fast: "سريع" };
  return map[value] || value;
}

function textColorLabel(value) {
  const map = { blue: "أزرق", black: "أسود", red: "أحمر" };
  return map[value] || map.blue;
}

function formToPayload(form) {
  return {
    enabled: form.enabled,
    textAr: form.textAr.trim(),
    textEn: form.textEn.trim(),
    url: form.url.trim() || null,
    placement: form.placement,
    courseId: form.placement === "specific_course" ? Number(form.courseId) || null : null,
    direction: "horizontal",
    speed: form.speed,
    textColor: form.textColor,
  };
}

function CourseTextAdFormFields({ form, fieldErrors, onPatch, courses }) {
  return (
    <div className="oh-course-text-ads-modal__form">
      <label className="oh-course-text-ads-modal__toggle">
        <input type="checkbox" checked={form.enabled} onChange={(e) => onPatch("enabled", e.target.checked)} />
        <span>تفعيل الإعلان</span>
      </label>

      <label className="oh-course-text-ads-modal__field">
        <span>النص بالعربية</span>
        <textarea rows={3} maxLength={200} value={form.textAr} onChange={(e) => onPatch("textAr", e.target.value)} />
        {fieldErrors.textAr ? <span className="oh-course-text-ads-modal__error">{fieldErrors.textAr}</span> : null}
      </label>

      <label className="oh-course-text-ads-modal__field">
        <span>النص بالإنجليزية (اختياري)</span>
        <textarea rows={3} maxLength={200} value={form.textEn} onChange={(e) => onPatch("textEn", e.target.value)} />
        {fieldErrors.textEn ? <span className="oh-course-text-ads-modal__error">{fieldErrors.textEn}</span> : null}
      </label>

      <label className="oh-course-text-ads-modal__field">
        <span>رابط (اختياري)</span>
        <input type="url" value={form.url} onChange={(e) => onPatch("url", e.target.value)} dir="ltr" />
        {fieldErrors.url ? <span className="oh-course-text-ads-modal__error">{fieldErrors.url}</span> : null}
      </label>

      <label className="oh-course-text-ads-modal__field">
        <span>الصفحة المستهدفة</span>
        <select value={form.placement} onChange={(e) => onPatch("placement", e.target.value)}>
          <option value="courses_list">صفحة الدورات الرئيسية</option>
          <option value="all_course_details">صفحات تفاصيل الدورات</option>
          <option value="both">كلاهما</option>
          <option value="specific_course">دورة محددة</option>
        </select>
        {fieldErrors.placement ? (
          <span className="oh-course-text-ads-modal__error">{fieldErrors.placement}</span>
        ) : null}
      </label>

      {form.placement === "specific_course" ? (
        <label className="oh-course-text-ads-modal__field">
          <span>الدورة</span>
          <select value={form.courseId} onChange={(e) => onPatch("courseId", e.target.value)}>
            <option value="">اختر دورة…</option>
            {courses.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.title || `دورة #${c.id}`}
              </option>
            ))}
          </select>
          {fieldErrors.courseId ? (
            <span className="oh-course-text-ads-modal__error">{fieldErrors.courseId}</span>
          ) : null}
        </label>
      ) : null}

      <label className="oh-course-text-ads-modal__field">
        <span>لون النص</span>
        <select value={form.textColor} onChange={(e) => onPatch("textColor", e.target.value)}>
          <option value="blue">أزرق (افتراضي)</option>
          <option value="black">أسود</option>
          <option value="red">أحمر</option>
        </select>
        {fieldErrors.textColor ? (
          <span className="oh-course-text-ads-modal__error">{fieldErrors.textColor}</span>
        ) : null}
      </label>

      <label className="oh-course-text-ads-modal__field">
        <span>سرعة الحركة</span>
        <select value={form.speed} onChange={(e) => onPatch("speed", e.target.value)}>
          <option value="slow">بطيء</option>
          <option value="normal">عادي</option>
          <option value="fast">سريع</option>
        </select>
      </label>
    </div>
  );
}

/**
 * @param {{ open: boolean, onClose: () => void, courses: Array<{ id: number|string, title?: string }> }} props
 */
export default function CourseTextAdsModal({ open, onClose, courses = [] }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_CURRENT);
  const [ads, setAds] = useState([]);

  const [expandedEditId, setExpandedEditId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [savingEditId, setSavingEditId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createFieldErrors, setCreateFieldErrors] = useState({});
  const [savingCreate, setSavingCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminListCourseTextAdsRequest();
      setAds(res?.data?.ads || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تحميل إعلانات الدورات.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) {
      setActiveTab(TAB_CURRENT);
      setExpandedEditId(null);
      setEditForm({ ...EMPTY_FORM });
      setCreateForm({ ...EMPTY_FORM });
      setEditFieldErrors({});
      setCreateFieldErrors({});
      return;
    }
    void load();
  }, [open, load]);

  const makePatcher = (setter, errorsSetter) => (key, value) => {
    setter((prev) => ({ ...prev, [key]: value }));
    errorsSetter((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const patchEdit = makePatcher(setEditForm, setEditFieldErrors);
  const patchCreate = makePatcher(setCreateForm, setCreateFieldErrors);

  const startInlineEdit = (ad) => {
    setExpandedEditId(ad.id);
    setEditForm(mapAdToForm(ad));
    setEditFieldErrors({});
  };

  const cancelInlineEdit = () => {
    setExpandedEditId(null);
    setEditForm({ ...EMPTY_FORM });
    setEditFieldErrors({});
  };

  const saveInlineEdit = async (adId) => {
    setSavingEditId(adId);
    setEditFieldErrors({});
    try {
      await adminUpdateCourseTextAdRequest(adId, formToPayload(editForm));
      toast.success("تم تحديث إعلان الدورات.");
      invalidateCourseSideTextAdCache();
      setExpandedEditId(null);
      await load();
    } catch (err) {
      const errs = err?.response?.data?.fieldErrors;
      if (errs && typeof errs === "object") setEditFieldErrors(errs);
      toast.error(err?.response?.data?.message || "تعذر حفظ التعديلات.");
    } finally {
      setSavingEditId(null);
    }
  };

  const toggleEnabled = async (ad) => {
    setTogglingId(ad.id);
    try {
      await adminUpdateCourseTextAdRequest(ad.id, { enabled: !ad.enabled });
      toast.success(ad.enabled ? "تم تعطيل الإعلان." : "تم تفعيل الإعلان.");
      invalidateCourseSideTextAdCache();
      if (expandedEditId === ad.id) {
        setEditForm((prev) => ({ ...prev, enabled: !ad.enabled }));
      }
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تحديث حالة الإعلان.");
    } finally {
      setTogglingId(null);
    }
  };

  const deleteAd = async (adId) => {
    if (!window.confirm("حذف هذا الإعلان؟")) return;
    setDeletingId(adId);
    try {
      await adminDeleteCourseTextAdRequest(adId);
      toast.success("تم حذف الإعلان.");
      invalidateCourseSideTextAdCache();
      if (expandedEditId === adId) cancelInlineEdit();
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر حذف الإعلان.");
    } finally {
      setDeletingId(null);
    }
  };

  const saveCreate = async () => {
    setSavingCreate(true);
    setCreateFieldErrors({});
    try {
      await adminCreateCourseTextAdRequest(formToPayload(createForm));
      toast.success("تم إنشاء إعلان الدورات.");
      invalidateCourseSideTextAdCache();
      setCreateForm({ ...EMPTY_FORM });
      await load();
      setActiveTab(TAB_CURRENT);
    } catch (err) {
      const errs = err?.response?.data?.fieldErrors;
      if (errs && typeof errs === "object") setCreateFieldErrors(errs);
      toast.error(err?.response?.data?.message || "تعذر إنشاء الإعلان.");
    } finally {
      setSavingCreate(false);
    }
  };

  const cancelCreate = () => {
    setCreateForm({ ...EMPTY_FORM });
    setCreateFieldErrors({});
    setActiveTab(TAB_CURRENT);
  };

  const busy = savingCreate || savingEditId != null || togglingId != null || deletingId != null;

  const resolveCourseName = (ad) => {
    if (ad.courseTitle) return ad.courseTitle;
    if (ad.courseId == null) return null;
    const match = courses.find((c) => String(c.id) === String(ad.courseId));
    return match?.title || `دورة #${ad.courseId}`;
  };

  return (
    <DashboardModal
      open={open}
      title="إدارة إعلان الدورات"
      ariaLabel="إدارة إعلان الدورات المتحرك"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          إغلاق
        </button>
      }
      className="oh-course-text-ads-modal"
    >
      <div className="oh-course-text-ads-modal__tabs" role="tablist" aria-label="أقسام إعلان الدورات">
        <button
          type="button"
          role="tab"
          id="course-ads-tab-current"
          aria-selected={activeTab === TAB_CURRENT}
          aria-controls="course-ads-panel-current"
          className={`oh-course-text-ads-modal__tab${activeTab === TAB_CURRENT ? " is-active" : ""}`}
          onClick={() => setActiveTab(TAB_CURRENT)}
        >
          الإعلانات الحالية
        </button>
        <button
          type="button"
          role="tab"
          id="course-ads-tab-new"
          aria-selected={activeTab === TAB_NEW}
          aria-controls="course-ads-panel-new"
          className={`oh-course-text-ads-modal__tab${activeTab === TAB_NEW ? " is-active" : ""}`}
          onClick={() => setActiveTab(TAB_NEW)}
        >
          إعلان جديد
        </button>
      </div>

      {loading ? (
        <DashboardLoadingState label="جارٍ التحميل…" />
      ) : (
        <div className="oh-course-text-ads-modal__body">
          {activeTab === TAB_CURRENT ? (
            <div
              id="course-ads-panel-current"
              role="tabpanel"
              aria-labelledby="course-ads-tab-current"
              className="oh-course-text-ads-modal__panel"
            >
              {ads.length === 0 ? (
                <div className="oh-course-text-ads-modal__empty-state">
                  <p>لا توجد إعلانات حالياً.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setCreateForm({ ...EMPTY_FORM });
                      setCreateFieldErrors({});
                      setActiveTab(TAB_NEW);
                    }}
                  >
                    إنشاء أول إعلان
                  </button>
                </div>
              ) : (
                <ul className="oh-course-text-ads-modal__cards">
                  {ads.map((ad) => {
                    const isEditing = expandedEditId === ad.id;
                    const isBusy =
                      savingEditId === ad.id || togglingId === ad.id || deletingId === ad.id;
                    return (
                      <li
                        key={ad.id}
                        className={`oh-course-text-ads-modal__card${isEditing ? " is-editing" : ""}`}
                      >
                        <div className="oh-course-text-ads-modal__card-head">
                          <p className="oh-course-text-ads-modal__card-text">
                            {ad.textAr || ad.textEn || "بدون نص"}
                          </p>
                          <ul className="oh-course-text-ads-modal__card-meta">
                            <li>
                              <span className="oh-course-text-ads-modal__chip">
                                {placementLabel(ad.placement)}
                              </span>
                            </li>
                            <li>
                              <span
                                className={`oh-course-text-ads-modal__chip oh-course-text-ads-modal__chip--${
                                  ad.enabled ? "on" : "off"
                                }`}
                              >
                                {ad.enabled ? "مفعّل" : "معطّل"}
                              </span>
                            </li>
                            <li>
                              <span className="oh-course-text-ads-modal__chip">{speedLabel(ad.speed)}</span>
                            </li>
                            <li>
                              <span className="oh-course-text-ads-modal__chip">
                                {textColorLabel(ad.textColor)}
                              </span>
                            </li>
                            {ad.placement === "specific_course" ? (
                              <li>
                                <span className="oh-course-text-ads-modal__chip oh-course-text-ads-modal__chip--course">
                                  {resolveCourseName(ad)}
                                </span>
                              </li>
                            ) : null}
                          </ul>
                        </div>

                        {!isEditing ? (
                          <div className="oh-course-text-ads-modal__card-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={isBusy}
                              onClick={() => startInlineEdit(ad)}
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={isBusy}
                              onClick={() => void toggleEnabled(ad)}
                            >
                              {togglingId === ad.id
                                ? "جارٍ…"
                                : ad.enabled
                                  ? "تعطيل"
                                  : "تفعيل"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={isBusy}
                              onClick={() => void deleteAd(ad.id)}
                            >
                              {deletingId === ad.id ? "جارٍ الحذف…" : "حذف"}
                            </button>
                          </div>
                        ) : (
                          <div className="oh-course-text-ads-modal__card-edit">
                            <p className="oh-course-text-ads-modal__card-edit-label">تعديل الإعلان</p>
                            <CourseTextAdFormFields
                              form={editForm}
                              fieldErrors={editFieldErrors}
                              onPatch={patchEdit}
                              courses={courses}
                            />
                            <div className="oh-course-text-ads-modal__form-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={savingEditId === ad.id}
                                onClick={cancelInlineEdit}
                              >
                                إلغاء التعديل
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={savingEditId === ad.id}
                                onClick={() => void saveInlineEdit(ad.id)}
                              >
                                {savingEditId === ad.id ? "جارٍ الحفظ…" : "حفظ التعديلات"}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div
              id="course-ads-panel-new"
              role="tabpanel"
              aria-labelledby="course-ads-tab-new"
              className="oh-course-text-ads-modal__panel"
            >
              <CourseTextAdFormFields
                form={createForm}
                fieldErrors={createFieldErrors}
                onPatch={patchCreate}
                courses={courses}
              />
              <div className="oh-course-text-ads-modal__form-actions">
                <button type="button" className="btn btn-secondary" disabled={savingCreate} onClick={cancelCreate}>
                  إلغاء
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingCreate}
                  onClick={() => void saveCreate()}
                >
                  {savingCreate ? "جارٍ الحفظ…" : "حفظ الإعلان"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardModal>
  );
}
