import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/useAuth";
import {
  adminAssignCourseFreelancersRequest,
  adminCreateCourseRequest,
  adminGetCourseByIdRequest,
  adminImportCourseLessonsRequest,
  adminListCourseFreelancersRequest,
  adminListCoursesRequest,
  adminUpdateCourseLessonsRequest,
  adminUpdateCourseRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";

export default function AdminCoursesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
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
  });
  const [importUrl, setImportUrl] = useState("");

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
      try {
        const res = await adminGetCourseByIdRequest(courseId);
        const details = res?.data || null;
        setSelectedCourse(details);
        setSelectedFreelancerIds((details?.assignments || []).map((x) => x.freelancerId));
      } catch (err) {
        toast.error(err?.response?.data?.message || "تعذر تحميل تفاصيل الدورة.");
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

  const filteredFreelancers = useMemo(() => {
    if (!freelancerQuery.trim()) return freelancers;
    const q = freelancerQuery.trim().toLowerCase();
    return freelancers.filter((f) => {
      const text = `${f.accountId || ""} ${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""} ${f.email || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [freelancers, freelancerQuery]);

  const onCreateCourse = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminCreateCourseRequest(createForm);
      toast.success("تم إنشاء الدورة واستيراد الدروس بنجاح.");
      setCreateForm({ title: "", description: "", coverImage: "", youtubeSourceUrl: "", isActive: true });
      await loadCourses();
    } catch (err) {
      toast.error(err?.response?.data?.message || "فشل إنشاء الدورة.");
    } finally {
      setLoading(false);
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

  return (
    <section className="dash">
      <header className="dash-hero">
        <h1>{pageTitle}</h1>
        <p>إنشاء دورات من روابط يوتيوب أو قوائم تشغيل، تعديل الدروس، وإسنادها للمستقلين.</p>
      </header>

      <div className="dash-section">
        <h3>إنشاء دورة جديدة</h3>
        <form className="auth-form-grid" onSubmit={onCreateCourse}>
          <label className="auth-field">
            <span>العنوان</span>
            <input value={createForm.title} onChange={(e) => setCreateForm((s) => ({ ...s, title: e.target.value }))} required />
          </label>
          <label className="auth-field">
            <span>رابط يوتيوب (فيديو أو Playlist)</span>
            <input
              value={createForm.youtubeSourceUrl}
              onChange={(e) => setCreateForm((s) => ({ ...s, youtubeSourceUrl: e.target.value }))}
              required
            />
          </label>
          <label className="auth-field">
            <span>رابط صورة الغلاف</span>
            <input value={createForm.coverImage} onChange={(e) => setCreateForm((s) => ({ ...s, coverImage: e.target.value }))} />
          </label>
          <label className="auth-field">
            <span>الوصف</span>
            <textarea value={createForm.description} onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))} rows={3} />
          </label>
          <label className="auth-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={createForm.isActive}
              onChange={(e) => setCreateForm((s) => ({ ...s, isActive: e.target.checked }))}
            />
            <span>الدورة نشطة</span>
          </label>
          <button className="btn btn-primary" disabled={loading} type="submit">
            إنشاء واستيراد الدروس
          </button>
        </form>
      </div>

      <div className="dash-section">
        <h3>الدورات الحالية</h3>
        {!courses.length ? <div className="dash-empty">لا توجد دورات حتى الآن.</div> : null}
        <div className="cards-grid">
          {courses.map((c) => (
            <button key={c.id} type="button" className="card" onClick={() => setSelectedCourseId(c.id)} style={{ textAlign: "right" }}>
              <strong>{c.title}</strong>
              <div>الدروس: {c.lessonsCount}</div>
              <div>المسند إليهم: {c.assignedCount}</div>
              <div>{c.isActive ? "نشطة" : "غير نشطة"}</div>
            </button>
          ))}
        </div>
      </div>

      {selectedCourse?.course ? (
        <div className="dash-section">
          <h3>إدارة الدورة: {selectedCourse.course.title}</h3>
          <form className="auth-form-grid" onSubmit={onUpdateCourse}>
            <label className="auth-field">
              <span>العنوان</span>
              <input
                value={selectedCourse.course.title || ""}
                onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, title: e.target.value } }))}
              />
            </label>
            <label className="auth-field">
              <span>الوصف</span>
              <textarea
                rows={3}
                value={selectedCourse.course.description || ""}
                onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, description: e.target.value } }))}
              />
            </label>
            <label className="auth-field">
              <span>رابط الغلاف</span>
              <input
                value={selectedCourse.course.coverImage || ""}
                onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, coverImage: e.target.value } }))}
              />
            </label>
            <label className="auth-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(selectedCourse.course.isActive)}
                onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, isActive: e.target.checked } }))}
              />
              <span>نشطة</span>
            </label>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              حفظ بيانات الدورة
            </button>
          </form>

          <div className="auth-form-grid" style={{ marginTop: 16 }}>
            <label className="auth-field">
              <span>استيراد دروس جديدة من رابط يوتيوب</span>
              <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
            </label>
            <button className="btn btn-secondary" type="button" onClick={onImportLessons} disabled={loading || !importUrl.trim()}>
              استيراد دروس
            </button>
          </div>

          <h4 style={{ marginTop: 18 }}>الدروس</h4>
          <div className="cards-grid">
            {(selectedCourse.lessons || []).map((lesson, idx) => (
              <div key={lesson.id} className="card">
                <label className="auth-field">
                  <span>عنوان الدرس</span>
                  <input
                    value={lesson.title || ""}
                    onChange={(e) =>
                      setSelectedCourse((s) => ({
                        ...s,
                        lessons: s.lessons.map((x) => (x.id === lesson.id ? { ...x, title: e.target.value } : x)),
                      }))
                    }
                  />
                </label>
                <label className="auth-field">
                  <span>الترتيب</span>
                  <input
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
                <label className="auth-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            ))}
          </div>
          <button className="btn btn-secondary" type="button" onClick={onSaveLessons} disabled={loading}>
            حفظ الدروس
          </button>

          <h4 style={{ marginTop: 18 }}>إسناد المستقلين</h4>
          <div className="auth-form-grid">
            <label className="auth-field">
              <span>بحث</span>
              <input value={freelancerQuery} onChange={(e) => setFreelancerQuery(e.target.value)} placeholder="ابحث باسم أو رقم الحساب" />
            </label>
            <div className="auth-field">
              <span>قائمة المستقلين</span>
              <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #ddd", borderRadius: 8, padding: 8 }}>
                {filteredFreelancers.map((f) => {
                  const checked = selectedFreelancerIds.includes(f.id);
                  return (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
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
                        {f.firstName} {f.fatherName} {f.familyName} ({f.accountId || "-"})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedFreelancerIds(filteredFreelancers.map((f) => f.id))}>
                تحديد الكل (النتائج)
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedFreelancerIds([])}>
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

          <h4 style={{ marginTop: 18 }}>تقدم المسند إليهم</h4>
          <div className="cards-grid">
            {(selectedCourse.assignments || []).map((a) => (
              <div key={a.freelancerId} className="card">
                <strong>
                  {a.firstName} {a.fatherName} {a.familyName}
                </strong>
                <div>الحساب: {a.accountId || "-"}</div>
                <div>
                  التقدم: {a.progress.completedLessons}/{a.progress.totalLessons} ({a.progress.percentage}%)
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
