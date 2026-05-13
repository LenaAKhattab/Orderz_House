import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/useAuth";
import {
  adminAddCourseFreelancerRequest,
  adminRemoveCourseFreelancerRequest,
  adminAssignCourseFreelancersRequest,
  adminCreateCourseRequest,
  adminDeleteCourseRequest,
  adminGetCourseByIdRequest,
  adminImportCourseLessonsRequest,
  adminListCourseFreelancersRequest,
  adminListCoursesRequest,
  adminUpdateCourseLessonsRequest,
  adminUpdateCourseRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { breadcrumbHomeFromUser } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import "./adminCoursesPage.css";

export default function AdminCoursesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [freelancers, setFreelancers] = useState([]);
  const [freelancerQuery, setFreelancerQuery] = useState("");
  const [selectedFreelancerIds, setSelectedFreelancerIds] = useState([]);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    coverImage: "",
    youtubeSourceUrl: "",
    isActive: true,
    isTestingEnabled: false,
    testFileUrl: "",
  });
  const [importUrl, setImportUrl] = useState("");
  const [sendModal, setSendModal] = useState({ open: false, course: null });
  const [sendQuery, setSendQuery] = useState("");
  const [sendResults, setSendResults] = useState([]);
  const [sendLoading, setSendLoading] = useState(false);
  /** Single-row send in progress (freelancer user id as string); bulk uses sendBulkSubmitting. */
  const [sendRowLoadingId, setSendRowLoadingId] = useState(null);
  const [unassignRowLoadingId, setUnassignRowLoadingId] = useState(null);
  const [sendBulkSubmitting, setSendBulkSubmitting] = useState(false);
  /** Freelancers already assigned to the course open in the send modal (for sort + grey state). */
  const [sendAssignedIds, setSendAssignedIds] = useState(() => new Set());
  /** False until GET course details finishes for the send modal (avoid wrong grey/active state). */
  const [sendAssignedReady, setSendAssignedReady] = useState(false);
  const [sendAllConfirmOpen, setSendAllConfirmOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageTab, setManageTab] = useState("details");
  const [courseDetailsLoading, setCourseDetailsLoading] = useState(false);
  const [progressQuery, setProgressQuery] = useState("");

  const isSuperAdmin = (user?.primaryRole || user?.role) === "super_admin";
  const pageTitle = isSuperAdmin ? "إدارة الدورات التدريبية (المدير الأعلى)" : "إدارة الدورات التدريبية";

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminListCoursesRequest();
      setCourses(res?.data?.courses || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تحميل الدورات.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadCourseDetails = useCallback(
    async (courseId) => {
      if (!courseId) return;
      setCourseDetailsLoading(true);
      try {
        const res = await adminGetCourseByIdRequest(courseId);
        const details = res?.data || null;
        setSelectedCourse(details);
        setSelectedFreelancerIds((details?.assignments || []).map((x) => x.freelancerId));
      } catch (err) {
        toast.error(err?.response?.data?.message || "تعذر تحميل تفاصيل الدورة.");
        setSelectedCourse(null);
      } finally {
        setCourseDetailsLoading(false);
      }
    },
    [toast],
  );

  const loadFreelancers = useCallback(
    async (q = "") => {
      try {
        const res = await adminListCourseFreelancersRequest({ q, limit: 200 });
        setFreelancers(res?.data?.freelancers || []);
      } catch (err) {
        toast.error(err?.response?.data?.message || "تعذر تحميل المستقلين.");
      }
    },
    [toast],
  );

  useEffect(() => {
    loadCourses();
    loadFreelancers("");
  }, [loadCourses, loadFreelancers]);

  useEffect(() => {
    if (selectedCourseId) loadCourseDetails(selectedCourseId);
  }, [selectedCourseId, loadCourseDetails]);

  useEffect(() => {
    let cancelled = false;
    if (!sendModal.open) return undefined;
    const timer = window.setTimeout(async () => {
      setSendLoading(true);
      try {
        const res = await adminListCourseFreelancersRequest({ q: sendQuery.trim(), limit: 30 });
        if (!cancelled) setSendResults(res?.data?.freelancers || []);
      } catch {
        if (!cancelled) setSendResults([]);
      } finally {
        if (!cancelled) setSendLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sendModal.open, sendQuery]);

  useEffect(() => {
    if (!sendModal.open || !sendModal.course?.id) return undefined;
    let cancelled = false;
    setSendAssignedReady(false);
    setSendAssignedIds(new Set());
    (async () => {
      try {
        const res = await adminGetCourseByIdRequest(sendModal.course.id);
        const ids = new Set((res?.data?.assignments || []).map((x) => String(x.freelancerId)));
        if (!cancelled) {
          setSendAssignedIds(ids);
          setSendAssignedReady(true);
        }
      } catch {
        if (!cancelled) {
          setSendAssignedIds(new Set());
          setSendAssignedReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sendModal.open, sendModal.course?.id]);

  const sortedSendResults = useMemo(() => {
    const list = [...sendResults];
    if (sendAssignedReady) {
      list.sort((a, b) => {
        const aAs = sendAssignedIds.has(String(a.id));
        const bAs = sendAssignedIds.has(String(b.id));
        if (aAs !== bAs) return aAs ? -1 : 1;
        return 0;
      });
    }
    return list;
  }, [sendResults, sendAssignedIds, sendAssignedReady]);

  const sendModalBusy =
    sendRowLoadingId !== null || unassignRowLoadingId !== null || sendBulkSubmitting;

  const filteredFreelancers = useMemo(() => {
    if (!freelancerQuery.trim()) return freelancers;
    const q = freelancerQuery.trim().toLowerCase();
    return freelancers.filter((f) => {
      const text = `${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""} ${f.accountId || ""} ${f.email || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [freelancers, freelancerQuery]);

  const filteredAssignments = useMemo(() => {
    const list = selectedCourse?.assignments || [];
    const q = progressQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => {
      const name = `${a.firstName || ""} ${a.fatherName || ""} ${a.familyName || ""}`.toLowerCase();
      const account = String(a.accountId || "").toLowerCase();
      return name.includes(q) || account.includes(q);
    });
  }, [selectedCourse?.assignments, progressQuery]);

  const onCreateCourse = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminCreateCourseRequest(createForm);
      toast.success("تم إنشاء الدورة واستيراد الدروس بنجاح.");
      setCreateForm({
        title: "",
        description: "",
        coverImage: "",
        youtubeSourceUrl: "",
        isActive: true,
        isTestingEnabled: false,
        testFileUrl: "",
      });
      await loadCourses();
    } catch (err) {
      toast.error(err?.response?.data?.message || "فشل إنشاء الدورة.");
    } finally {
      setCreating(false);
    }
  };

  const onUpdateCourse = async (e) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedCourse?.course) return;
    setLoading(true);
    try {
      await adminUpdateCourseRequest(selectedCourseId, {
        title: selectedCourse.course.title,
        description: selectedCourse.course.description,
        coverImage: selectedCourse.course.coverImage,
        isActive: selectedCourse.course.isActive,
        isTestingEnabled: Boolean(selectedCourse.course.isTestingEnabled),
        testFileUrl: selectedCourse.course.testFileUrl || "",
      });
      toast.success("تم تحديث بيانات الدورة.");
      await loadCourses();
      await loadCourseDetails(selectedCourseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تحديث الدورة.");
    } finally {
      setLoading(false);
    }
  };

  const onImportLessons = async () => {
    if (!selectedCourseId || !importUrl.trim()) return;
    setLoading(true);
    try {
      await adminImportCourseLessonsRequest(selectedCourseId, { youtubeSourceUrl: importUrl.trim(), replaceExisting: false });
      toast.success("تم استيراد الدروس.");
      setImportUrl("");
      await loadCourseDetails(selectedCourseId);
      await loadCourses();
    } catch (err) {
      toast.error(err?.response?.data?.message || "فشل استيراد الدروس.");
    } finally {
      setLoading(false);
    }
  };

  const onSaveLessons = async () => {
    if (!selectedCourseId || !selectedCourse?.lessons?.length) return;
    setLoading(true);
    try {
      await adminUpdateCourseLessonsRequest(selectedCourseId, {
        lessons: selectedCourse.lessons.map((l, idx) => ({
          id: l.id,
          title: l.title,
          sortOrder: Number(l.sortOrder || idx + 1),
          isActive: Boolean(l.isActive),
        })),
      });
      toast.success("تم تحديث الدروس.");
      await loadCourseDetails(selectedCourseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || "فشل تحديث الدروس.");
    } finally {
      setLoading(false);
    }
  };

  const onAssign = async (assignAll = false) => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      await adminAssignCourseFreelancersRequest(selectedCourseId, {
        assignAll,
        freelancerIds: assignAll ? [] : selectedFreelancerIds.map((x) => Number(x)),
      });
      toast.success(assignAll ? "تم إسناد الدورة لجميع المستقلين." : "تم تحديث إسناد الدورة.");
      await loadCourseDetails(selectedCourseId);
      await loadCourses();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر حفظ الإسناد.");
    } finally {
      setLoading(false);
    }
  };

  const onDeleteCourse = async (courseId) => {
    if (!courseId) return;
    const ok = window.confirm("هل أنت متأكد من حذف الدورة؟ سيتم حذف الدروس والإسنادات المرتبطة بها.");
    if (!ok) return;
    setLoading(true);
    try {
      await adminDeleteCourseRequest(courseId);
      toast.success("تم حذف الدورة بنجاح.");
      if (String(selectedCourseId) === String(courseId)) {
        setSelectedCourseId("");
        setSelectedCourse(null);
        setSelectedFreelancerIds([]);
        setManageModalOpen(false);
      }
      await loadCourses();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر حذف الدورة.");
    } finally {
      setLoading(false);
    }
  };

  const onOpenSendModal = (course) => {
    setSendAllConfirmOpen(false);
    setSendRowLoadingId(null);
    setUnassignRowLoadingId(null);
    setSendBulkSubmitting(false);
    setSendAssignedReady(false);
    setSendModal({ open: true, course });
    setSendQuery("");
    setSendResults([]);
  };

  const freelancerDisplayName = (f) =>
    `${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""}`.trim() || f.email || f.accountId || "المستقل";

  const onSendCourseToFreelancer = async (courseId, freelancerId, displayName) => {
    const fid = Number(freelancerId);
    if (!courseId || !Number.isInteger(fid) || fid < 1) {
      toast.error("معرف المستقل غير صالح.");
      return;
    }
    setSendRowLoadingId(String(fid));
    try {
      await adminAddCourseFreelancerRequest(courseId, fid);
      setSendAssignedIds((prev) => new Set([...prev, String(fid)]));
      toast.success(`تم إرسال الدورة إلى ${displayName || "المستقل"}.`);
      setSendModal({ open: false, course: null });
      await loadCourses();
      if (String(selectedCourseId) === String(courseId)) {
        await loadCourseDetails(courseId);
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        setSendAssignedIds((prev) => new Set([...prev, String(fid)]));
      }
      const msg = err?.response?.data?.message || "تعذر إرسال الدورة.";
      toast.error(msg);
    } finally {
      setSendRowLoadingId(null);
    }
  };

  const onUnassignCourseFromFreelancer = async (courseId, freelancerId, displayName) => {
    const fid = Number(freelancerId);
    if (!courseId || !Number.isInteger(fid) || fid < 1) {
      toast.error("معرف المستقل غير صالح.");
      return;
    }
    setUnassignRowLoadingId(String(fid));
    try {
      await adminRemoveCourseFreelancerRequest(courseId, fid);
      setSendAssignedIds((prev) => {
        const next = new Set(prev);
        next.delete(String(fid));
        return next;
      });
      toast.success(`تم إلغاء إرسال الدورة عن ${displayName || "المستقل"}.`);
      await loadCourses();
      if (String(selectedCourseId) === String(courseId)) {
        await loadCourseDetails(courseId);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر إلغاء الإرسال.");
    } finally {
      setUnassignRowLoadingId(null);
    }
  };

  const onSendCourseToAllFreelancers = async () => {
    const course = sendModal.course;
    if (!course?.id) return;
    setSendBulkSubmitting(true);
    try {
      await adminAssignCourseFreelancersRequest(course.id, { assignAll: true, freelancerIds: [] });
      toast.success("تم إرسال الدورة لجميع المستقلين النشطين.");
      setSendAllConfirmOpen(false);
      setSendModal({ open: false, course: null });
      await loadCourses();
      if (String(selectedCourseId) === String(course.id)) {
        await loadCourseDetails(course.id);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر إرسال الدورة للجميع.");
    } finally {
      setSendBulkSubmitting(false);
    }
  };

  const openManageModal = useCallback((course) => {
    setManageTab("details");
    setSelectedCourse(null);
    setCourseDetailsLoading(true);
    setSelectedCourseId(course.id);
    setManageModalOpen(true);
  }, []);

  const closeManageModal = useCallback(() => {
    setManageModalOpen(false);
    setSelectedCourseId("");
    setSelectedCourse(null);
    setSelectedFreelancerIds([]);
    setImportUrl("");
    setCourseDetailsLoading(false);
    setFreelancerQuery("");
    setProgressQuery("");
  }, []);

  useEffect(() => {
    if (!manageModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) closeManageModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manageModalOpen, loading, closeManageModal]);

  const manageCourseTitle = selectedCourse?.course?.title || "";

  return (
    <>
      <DashboardShell className="oh-admin-courses">
        <DashboardPageHeader
          eyebrow="لوحة التحكم"
          title={pageTitle}
          description="إنشاء الدورات واستيراد الدروس من يوتيوب، وإدارة المستقلين المسجلين في كل دورة."
          breadcrumbs={[
            { label: "الرئيسية", href: breadcrumbHomeFromUser(user) },
            { label: "الدورات" },
          ]}
        />

        <DashboardSection
          title="إنشاء دورة جديدة"
          description="أدخل البيانات الأساسية ثم استورد الدروس من يوتيوب."
        >
          <form className="oh-admin-courses__form" onSubmit={onCreateCourse}>
          <div className="oh-admin-courses__row-2">
            <label className="oh-admin-courses__field">
              <span>العنوان</span>
              <input
                className="oh-admin-courses__input"
                value={createForm.title}
                onChange={(e) => setCreateForm((s) => ({ ...s, title: e.target.value }))}
                required
              />
            </label>
            <label className="oh-admin-courses__field">
              <span>رابط يوتيوب (فيديو أو قائمة تشغيل)</span>
              <input
                className="oh-admin-courses__input"
                value={createForm.youtubeSourceUrl}
                onChange={(e) => setCreateForm((s) => ({ ...s, youtubeSourceUrl: e.target.value }))}
                required
                dir="ltr"
                placeholder="https://..."
              />
            </label>
          </div>
          <label className="oh-admin-courses__field">
            <span>
              رابط صورة الغلاف <span className="oh-admin-courses__optional">(اختياري)</span>
            </span>
            <input
              className="oh-admin-courses__input"
              value={createForm.coverImage}
              onChange={(e) => setCreateForm((s) => ({ ...s, coverImage: e.target.value }))}
              dir="ltr"
            />
          </label>
          <label className="oh-admin-courses__field">
            <span>
              الوصف <span className="oh-admin-courses__optional">(اختياري)</span>
            </span>
            <textarea
              className="oh-admin-courses__textarea"
              value={createForm.description}
              onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))}
              rows={4}
            />
          </label>
          <label className="oh-admin-courses__toggle">
            <input
              type="checkbox"
              checked={createForm.isActive}
              onChange={(e) => setCreateForm((s) => ({ ...s, isActive: e.target.checked }))}
            />
            <span>الدورة نشطة</span>
          </label>
          <div className="oh-admin-courses__modal-divider" style={{ margin: "8px 0" }} />
          <h3 className="oh-admin-courses__modal-subheading">إعدادات التدقيق</h3>
          <p className="oh-admin-courses__modal-hint">سيظهر طلب التدقيق للمستقلين قبل إنهاء الدورة عند التفعيل.</p>
          <label className="oh-admin-courses__toggle">
            <input
              type="checkbox"
              checked={createForm.isTestingEnabled}
              onChange={(e) => setCreateForm((s) => ({ ...s, isTestingEnabled: e.target.checked }))}
            />
            <span>تفعيل مرحلة التدقيق لهذا الكورس</span>
          </label>
          <label className="oh-admin-courses__field">
            <span>
              رابط ملف اختبارات المشروع <span className="oh-admin-courses__optional">(اختياري)</span>
            </span>
            <input
              className="oh-admin-courses__input"
              dir="ltr"
              value={createForm.testFileUrl}
              onChange={(e) => setCreateForm((s) => ({ ...s, testFileUrl: e.target.value }))}
              placeholder="https://..."
            />
          </label>
          <div className="oh-admin-courses__submit-row">
            <button className="btn btn-primary oh-admin-courses__btn-primary" disabled={creating} type="submit">
              {creating ? "جاري الإنشاء والاستيراد…" : "إنشاء واستيراد الدروس"}
            </button>
          </div>
        </form>
        </DashboardSection>

        <DashboardSection title="الدورات الحالية" description="إدارة الدورات المنشأة، الإرسال للمستقلين، أو الحذف.">
          {loading && !courses.length ? (
            <DashboardLoadingState label="جاري تحميل الدورات…" />
          ) : null}

          {!loading && !courses.length ? (
            <DashboardEmptyState
              title="لا توجد دورات حالياً"
              description="ابدأ بإنشاء دورة جديدة من القسم أعلاه لاستيراد الدروس من يوتيوب."
              icon={
                <svg
                  className="h-12 w-12 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M8 7h8M8 11h6" strokeLinecap="round" />
                </svg>
              }
            />
          ) : null}

          {courses.length > 0 ? (
            <div className="oh-admin-courses__grid">
              {courses.map((c) => (
                <article key={c.id} className="oh-admin-courses__course-card">
                  <h3 className="oh-admin-courses__course-title">{c.title}</h3>
                  <div className="oh-admin-courses__course-meta">
                    <span>عدد الدروس: {c.lessonsCount ?? 0}</span>
                    <span>عدد المهام: {c.assignedCount ?? 0}</span>
                    <StatusBadge tone={c.isActive ? "active" : "inactive"}>{c.isActive ? "نشطة" : "غير نشطة"}</StatusBadge>
                  </div>
                  <div className="oh-admin-courses__course-actions">
                    <button
                      type="button"
                      className="btn btn-secondary oh-admin-courses__btn-outline"
                      onClick={() => openManageModal(c)}
                      disabled={loading}
                    >
                      إدارة الدورة
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => onOpenSendModal(c)} disabled={loading}>
                      إرسال الدورة
                    </button>
                    <button
                      type="button"
                      className="btn oh-admin-courses__btn-danger"
                      onClick={() => onDeleteCourse(c.id)}
                      disabled={loading}
                    >
                      حذف الدورة
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </DashboardSection>
      </DashboardShell>

      {manageModalOpen ? (
        <div
          className="oh-admin-courses__modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !loading) closeManageModal();
          }}
        >
          <div
            className="oh-admin-courses__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-course-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="oh-admin-courses__modal-header">
              <h2 id="manage-course-modal-title" className="oh-admin-courses__modal-title">
                إدارة الدورة: {courseDetailsLoading ? "…" : manageCourseTitle}
              </h2>
              <button
                type="button"
                className="oh-admin-courses__modal-close"
                onClick={closeManageModal}
                disabled={loading}
                aria-label="إغلاق"
              >
                ×
              </button>
            </header>

            <div className="oh-admin-courses__modal-tabs" role="tablist" aria-label="أقسام إدارة الدورة">
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "details"}
                className={`oh-admin-courses__modal-tab ${manageTab === "details" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("details")}
              >
                بيانات الدورة
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "lessons"}
                className={`oh-admin-courses__modal-tab ${manageTab === "lessons" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("lessons")}
              >
                الدروس
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "assign"}
                className={`oh-admin-courses__modal-tab ${manageTab === "assign" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("assign")}
              >
                الإسناد
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "progress"}
                className={`oh-admin-courses__modal-tab ${manageTab === "progress" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("progress")}
              >
                التقدم
              </button>
            </div>

            <div className="oh-admin-courses__modal-body">
              {courseDetailsLoading ? (
                <p className="oh-admin-courses__modal-loading">جاري تحميل بيانات الدورة…</p>
              ) : selectedCourse?.course ? (
                <>
                  {manageTab === "details" ? (
                    <div className="oh-admin-courses__modal-panel" role="tabpanel">
                      <form className="oh-admin-courses__form" onSubmit={onUpdateCourse}>
                        <label className="oh-admin-courses__field">
                          <span>العنوان</span>
                          <input
                            className="oh-admin-courses__input"
                            value={selectedCourse.course.title || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, title: e.target.value } }))}
                          />
                        </label>
                        <label className="oh-admin-courses__field">
                          <span>الوصف</span>
                          <textarea
                            className="oh-admin-courses__textarea"
                            rows={4}
                            value={selectedCourse.course.description || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, description: e.target.value } }))}
                          />
                        </label>
                        <label className="oh-admin-courses__field">
                          <span>رابط صورة الغلاف</span>
                          <input
                            className="oh-admin-courses__input"
                            dir="ltr"
                            value={selectedCourse.course.coverImage || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, coverImage: e.target.value } }))}
                          />
                        </label>
                        <label className="oh-admin-courses__toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCourse.course.isActive)}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, isActive: e.target.checked } }))}
                          />
                          <span>حالة الدورة (نشطة)</span>
                        </label>
                        <div className="oh-admin-courses__modal-divider" />
                        <h3 className="oh-admin-courses__modal-subheading">إعدادات التدقيق</h3>
                        <p className="oh-admin-courses__modal-hint">سيظهر هذا للمستقلين قبل التسليم عند تفعيل مرحلة التدقيق.</p>
                        <label className="oh-admin-courses__toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCourse.course.isTestingEnabled)}
                            onChange={(e) =>
                              setSelectedCourse((s) => ({ ...s, course: { ...s.course, isTestingEnabled: e.target.checked } }))
                            }
                          />
                          <span>تفعيل مرحلة التدقيق لهذا الكورس</span>
                        </label>
                        <label className="oh-admin-courses__field">
                          <span>
                            رابط ملف اختبارات المشروع <span className="oh-admin-courses__optional">(اختياري)</span>
                          </span>
                          <input
                            className="oh-admin-courses__input"
                            dir="ltr"
                            value={selectedCourse.course.testFileUrl || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, testFileUrl: e.target.value } }))}
                            placeholder="https://..."
                          />
                        </label>
                        <div className="oh-admin-courses__submit-row">
                          <button className="btn btn-primary oh-admin-courses__btn-primary" type="submit" disabled={loading}>
                            حفظ بيانات الدورة
                          </button>
                        </div>
                      </form>

                      <div className="oh-admin-courses__modal-divider" />
                      <h3 className="oh-admin-courses__modal-subheading">استيراد دروس جديدة</h3>
                      <div className="oh-admin-courses__form">
                        <label className="oh-admin-courses__field">
                          <span>رابط يوتيوب جديد</span>
                          <input
                            className="oh-admin-courses__input"
                            dir="ltr"
                            value={importUrl}
                            onChange={(e) => setImportUrl(e.target.value)}
                            placeholder="https://..."
                          />
                        </label>
                        <div className="oh-admin-courses__submit-row">
                          <button
                            className="btn btn-secondary oh-admin-courses__btn-outline"
                            type="button"
                            onClick={onImportLessons}
                            disabled={loading || !importUrl.trim()}
                          >
                            استيراد دروس
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {manageTab === "lessons" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--lessons" role="tabpanel">
                      <p className="oh-admin-courses__modal-hint">عدّل عناوين الدروس والترتيب والتفعيل، ثم احفظ التغييرات.</p>
                      <div className="oh-admin-courses__lesson-scroll">
                        <div className="oh-admin-courses__lesson-grid">
                          {(selectedCourse.lessons || []).map((lesson, idx) => (
                            <div key={lesson.id} className="oh-admin-courses__lesson-card">
                              <label className="oh-admin-courses__field">
                                <span>عنوان الدرس</span>
                                <input
                                  className="oh-admin-courses__input"
                                  value={lesson.title || ""}
                                  onChange={(e) =>
                                    setSelectedCourse((s) => ({
                                      ...s,
                                      lessons: s.lessons.map((x) => (x.id === lesson.id ? { ...x, title: e.target.value } : x)),
                                    }))
                                  }
                                />
                              </label>
                              <div className="oh-admin-courses__lesson-row">
                                <label className="oh-admin-courses__field">
                                  <span>الترتيب</span>
                                  <input
                                    className="oh-admin-courses__input"
                                    type="number"
                                    min={1}
                                    value={lesson.sortOrder || idx + 1}
                                    onChange={(e) =>
                                      setSelectedCourse((s) => ({
                                        ...s,
                                        lessons: s.lessons.map((x) => (x.id === lesson.id ? { ...x, sortOrder: Number(e.target.value) } : x)),
                                      }))
                                    }
                                  />
                                </label>
                                <label className="oh-admin-courses__toggle oh-admin-courses__toggle--inline">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(lesson.isActive)}
                                    onChange={(e) =>
                                      setSelectedCourse((s) => ({
                                        ...s,
                                        lessons: s.lessons.map((x) => (x.id === lesson.id ? { ...x, isActive: e.target.checked } : x)),
                                      }))
                                    }
                                  />
                                  <span>نشط</span>
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {!selectedCourse.lessons?.length ? <p className="help">لا توجد دروس بعد. استخدم تبويب «بيانات الدورة» لاستيراد الدروس.</p> : null}
                      <div className="oh-admin-courses__modal-footer-actions">
                        <button className="btn btn-primary" type="button" onClick={onSaveLessons} disabled={loading || !selectedCourse?.lessons?.length}>
                          حفظ الدروس
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {manageTab === "assign" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--assign" role="tabpanel">
                      <div className="oh-admin-courses__tab-top">
                        <input
                          className="oh-admin-courses__input"
                          type="search"
                          value={freelancerQuery}
                          onChange={(e) => setFreelancerQuery(e.target.value)}
                          placeholder="ابحث باسم المستقل أو رقم الحساب..."
                          aria-label="ابحث باسم المستقل أو رقم الحساب أو البريد"
                          autoComplete="off"
                        />
                        <div className="oh-admin-courses__tab-meta" aria-live="polite">
                          <span>عدد النتائج: {filteredFreelancers.length}</span>
                          <span className="oh-admin-courses__tab-meta-sep" aria-hidden>
                            ·
                          </span>
                          <span>المحدد: {selectedFreelancerIds.length}</span>
                        </div>
                      </div>
                      <div className="oh-admin-courses__field-label-muted">قائمة المستقلين</div>
                      <div className="oh-admin-courses__checkbox-list oh-admin-courses__checkbox-list--scroll">
                        {freelancers.length > 0 && freelancerQuery.trim() && filteredFreelancers.length === 0 ? (
                          <p className="help oh-admin-courses__tab-empty-msg">لا توجد نتائج مطابقة</p>
                        ) : (
                          filteredFreelancers.map((f) => {
                            const checked = selectedFreelancerIds.includes(f.id);
                            return (
                              <label key={f.id} className="oh-admin-courses__checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setSelectedFreelancerIds((prev) =>
                                      e.target.checked ? [...new Set([...prev, f.id])] : prev.filter((x) => x !== f.id),
                                    )
                                  }
                                />
                                <span>
                                  {f.firstName} {f.fatherName} {f.familyName} ({f.accountId || "-"}){f.email ? ` · ${f.email}` : ""}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div className="oh-admin-courses__assign-actions oh-admin-courses__assign-actions--sticky">
                        <button
                          className="btn btn-secondary oh-admin-courses__btn-outline"
                          type="button"
                          onClick={() => setSelectedFreelancerIds(filteredFreelancers.map((f) => f.id))}
                        >
                          تحديد الكل
                        </button>
                        <button className="btn btn-secondary oh-admin-courses__btn-outline" type="button" onClick={() => setSelectedFreelancerIds([])}>
                          إزالة الكل
                        </button>
                        <button className="btn btn-primary" type="button" onClick={() => onAssign(false)} disabled={loading}>
                          حفظ الإسناد المحدد
                        </button>
                        <button className="btn btn-primary" type="button" onClick={() => onAssign(true)} disabled={loading}>
                          إسناد لجميع المستقلين
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {manageTab === "progress" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--progress" role="tabpanel">
                      <div className="oh-admin-courses__tab-top">
                        <input
                          className="oh-admin-courses__input"
                          type="search"
                          value={progressQuery}
                          onChange={(e) => setProgressQuery(e.target.value)}
                          placeholder="ابحث باسم المستقل أو رقم الحساب..."
                          aria-label="ابحث في تقدم المستقلين"
                          autoComplete="off"
                        />
                        <div className="oh-admin-courses__tab-meta" aria-live="polite">
                          <span>عدد النتائج: {filteredAssignments.length}</span>
                          {(selectedCourse.assignments || []).length > 0 ? (
                            <>
                              <span className="oh-admin-courses__tab-meta-sep" aria-hidden>
                                ·
                              </span>
                              <span>إجمالي المسند: {(selectedCourse.assignments || []).length}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <p className="oh-admin-courses__modal-hint">تقدم المستقلين المسند إليهم هذه الدورة.</p>
                      {!selectedCourse.assignments?.length ? (
                        <p className="help oh-admin-courses__tab-empty-msg">لا يوجد مسند إليهم بعد.</p>
                      ) : progressQuery.trim() && filteredAssignments.length === 0 ? (
                        <p className="help oh-admin-courses__tab-empty-msg">لا توجد نتائج مطابقة</p>
                      ) : (
                        <div className="oh-admin-courses__progress-scroll">
                          <div className="oh-admin-courses__progress-grid">
                            {filteredAssignments.map((a) => (
                              <div key={a.freelancerId} className="oh-admin-courses__progress-card">
                                <div className="oh-admin-courses__progress-name">
                                  {a.firstName} {a.fatherName} {a.familyName}
                                </div>
                                <div className="oh-admin-courses__progress-meta">الحساب: {a.accountId || "—"}</div>
                                <div className="oh-admin-courses__progress-bar-wrap" aria-hidden>
                                  <div
                                    className="oh-admin-courses__progress-bar"
                                    style={{ width: `${Math.min(100, Math.max(0, Number(a.progress?.percentage) || 0))}%` }}
                                  />
                                </div>
                                <div className="oh-admin-courses__progress-stats">
                                  التقدم: {a.progress?.completedLessons ?? 0}/{a.progress?.totalLessons ?? 0} ({a.progress?.percentage ?? 0}%)
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="help">تعذر تحميل الدورة.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {sendModal.open && sendModal.course ? (
        <div
          className="oh-admin-courses__send-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !sendModalBusy) {
              setSendAllConfirmOpen(false);
              setSendModal({ open: false, course: null });
            }
          }}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-course-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: "min(620px, 100%)", maxHeight: "86vh", overflow: "auto", display: "grid", gap: 10 }}
          >
            <h3 id="send-course-modal-title" style={{ margin: 0 }}>
              إرسال الدورة: {sendModal.course.title}
            </h3>
            <label className="auth-field">
              <span>ابحث عن المستقل (الاسم أو الإيميل)</span>
              <input
                value={sendQuery}
                onChange={(e) => setSendQuery(e.target.value)}
                placeholder="اكتب الاسم أو الإيميل..."
                disabled={sendBulkSubmitting}
              />
            </label>
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: 8, background: "var(--background)" }}>
              {sendLoading ? (
                <div className="help">جارٍ البحث...</div>
              ) : sortedSendResults.length === 0 ? (
                <div className="help">لا يوجد نتائج.</div>
              ) : (
                sortedSendResults.map((f) => {
                  const idStr = String(f.id);
                  const isAssigned = sendAssignedIds.has(idStr);
                  const rowLoading = sendRowLoadingId === idStr;
                  const unassignLoading = unassignRowLoadingId === idStr;
                  const rowActionsLocked =
                    sendBulkSubmitting || !sendAssignedReady || sendRowLoadingId !== null || unassignRowLoadingId !== null;
                  return (
                    <div
                      key={f.id}
                      className={
                        isAssigned
                          ? "oh-admin-courses__send-row oh-admin-courses__send-row--assigned"
                          : "oh-admin-courses__send-row"
                      }
                    >
                      <div>
                        <strong>{`${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""}`.trim() || "—"}</strong>
                        <div className="help">{f.email || "—"} {f.accountId ? `• ${f.accountId}` : ""}</div>
                      </div>
                      {isAssigned ? (
                        <div className="oh-admin-courses__send-row-actions">
                          <span className="oh-admin-courses__send-assigned-label">مسندة مسبقاً</span>
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-courses__send-row-btn-unassign"
                            disabled={rowActionsLocked}
                            onClick={() => onUnassignCourseFromFreelancer(sendModal.course.id, f.id, freelancerDisplayName(f))}
                          >
                            {unassignLoading ? "جارٍ الإلغاء..." : "إلغاء الإرسال"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={rowLoading || rowActionsLocked}
                          onClick={() => onSendCourseToFreelancer(sendModal.course.id, f.id, freelancerDisplayName(f))}
                        >
                          {rowLoading ? "جارٍ الإرسال..." : "إرسال لهذا المستقل"}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={sendModalBusy || !sendAssignedReady}
                onClick={() => setSendAllConfirmOpen(true)}
              >
                إرسال لجميع المستقلين
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={sendModalBusy}
                onClick={() => {
                  setSendAllConfirmOpen(false);
                  setSendModal({ open: false, course: null });
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
          {sendAllConfirmOpen ? (
            <div
              role="presentation"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                background: "rgba(0,0,0,0.45)",
              }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !sendBulkSubmitting) setSendAllConfirmOpen(false);
              }}
            >
              <div
                className="card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="send-all-confirm-title"
                onMouseDown={(e) => e.stopPropagation()}
                style={{ width: "min(420px, 100%)", display: "grid", gap: 12 }}
              >
                <p id="send-all-confirm-title" style={{ margin: 0 }}>
                  هل أنت متأكد من إرسال الدورة لجميع المستقلين؟
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-secondary" disabled={sendBulkSubmitting} onClick={() => setSendAllConfirmOpen(false)}>
                    إلغاء
                  </button>
                  <button type="button" className="btn btn-primary" disabled={sendBulkSubmitting} onClick={onSendCourseToAllFreelancers}>
                    {sendBulkSubmitting ? "جارٍ الإرسال..." : "تأكيد الإرسال للجميع"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
