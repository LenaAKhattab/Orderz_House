import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  freelancerGetCourseDetailsRequest,
  freelancerMarkLessonCompleteRequest,
  freelancerSubmitCourseCompletionRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import "./freelancerCourseDetails.css";

function toEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(videoId || ""))}?rel=0&modestbranding=1&playsinline=1`;
}

export default function FreelancerCourseDetailsPage() {
  const { id } = useParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState(null);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [auditConfirm, setAuditConfirm] = useState(false);
  const [auditNotes, setAuditNotes] = useState("");

  const loadDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await freelancerGetCourseDetailsRequest(id);
      const out = res?.data || null;
      setData(out);
      if (!activeLessonId && out?.lessons?.length) setActiveLessonId(out.lessons[0].id);
      if (out?.assignment?.auditNotes) setAuditNotes(out.assignment.auditNotes);
      setAuditConfirm(Boolean(out?.assignment?.auditConfirmed));
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تحميل الدورة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const activeLesson = useMemo(
    () => (data?.lessons || []).find((x) => String(x.id) === String(activeLessonId)) || data?.lessons?.[0],
    [data, activeLessonId],
  );

  const completion = data?.completion;
  const course = data?.course;

  const onComplete = async () => {
    if (!id || !activeLesson?.id) return;
    try {
      await freelancerMarkLessonCompleteRequest(id, activeLesson.id);
      toast.success("تم تسجيل إكمال المشاهدة.");
      await loadDetails();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تسجيل الإكمال.");
    }
  };

  const onSubmitCompletion = async (e) => {
    e?.preventDefault?.();
    if (!id) return;
    if (completion?.testingEnabled && !auditConfirm) {
      toast.error("يرجى تأكيد التدقيق قبل الإنهاء.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = completion?.testingEnabled
        ? { auditConfirmed: auditConfirm, auditNotes: auditNotes.trim() || undefined }
        : {};
      await freelancerSubmitCourseCompletionRequest(id, payload);
      toast.success("تم إنهاء الدورة بنجاح.");
      await loadDetails();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر إنهاء الدورة.");
    } finally {
      setSubmitting(false);
    }
  };

  const showAuditCard = Boolean(completion?.needsAuditStep);
  const courseDone = Boolean(completion?.courseCompleted);
  const testLink = course?.testFileUrl;

  return (
    <section className="dash">
      {loading ? <div className="dash-empty">جار التحميل...</div> : null}
      {!loading && course ? (
        <>
          <header className="dash-hero">
            <h1>{course.title}</h1>
            <p>{course.description || "بدون وصف"}</p>
            <p>
              التقدم: {data.progress.completedLessons}/{data.progress.totalLessons} ({data.progress.percentage}%)
            </p>
          </header>

          {courseDone ? (
            <div className="fcd-done" role="status">
              ✓ تم إنهاء هذه الدورة بنجاح.
              {data.assignment?.completedAt ? (
                <span style={{ display: "block", marginTop: 8, fontWeight: 600, fontSize: "0.88rem", opacity: 0.9 }}>
                  تاريخ الإنهاء مسجّل في النظام.
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="dash-section">
            {activeLesson?.youtubeVideoId ? (
              <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden" }}>
                <iframe
                  title={activeLesson.title}
                  src={toEmbedUrl(activeLesson.youtubeVideoId)}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="dash-empty">لا يوجد فيديو متاح لهذا الدرس.</div>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{activeLesson?.title}</strong>
              <button type="button" className="btn btn-primary" onClick={onComplete} disabled={courseDone}>
                تسجيل إكمال المشاهدة
              </button>
            </div>
          </div>

          <div className="dash-section">
            <h3>الدروس</h3>
            <div className="cards-grid">
              {(data.lessons || []).map((lesson) => (
                <button
                  type="button"
                  key={lesson.id}
                  className="card"
                  style={{
                    textAlign: "right",
                    border: String(lesson.id) === String(activeLesson?.id) ? "2px solid var(--secondary)" : undefined,
                  }}
                  onClick={() => setActiveLessonId(lesson.id)}
                  disabled={courseDone}
                >
                  <strong>{lesson.title}</strong>
                  <div>{lesson.isCompleted ? "مكتمل" : "غير مكتمل"}</div>
                </button>
              ))}
            </div>
          </div>

          {showAuditCard ? (
            <div className="dash-section">
              <div className="fcd-audit">
                <h2 className="fcd-audit__title">مرحلة التدقيق قبل التسليم</h2>
                <p className="fcd-audit__lead">
                  يجب التأكد من مطابقة العمل لمتطلبات المشروع قبل التسليم. راجع مواد الاختبار، ثم استخدم أداة مثل ChatGPT
                  لمقارنة المتطلبات مع عملك (دون ربط تلقائي بالنظام).
                </p>
                <ul className="fcd-audit__list">
                  <li>افتح ChatGPT أو أي مساعد نصّي تفضّله.</li>
                  <li>الصق متطلبات المشروع ثم لصق ملخص عملك أو المخرجات.</li>
                  <li>اطلب مراجعة الجاهزية للتسليم وفق المعايير المذكورة في الدورة.</li>
                </ul>
                <div className="fcd-audit__prompt-box">
                  <strong>مثال لطلب المساعدة:</strong> «راجع ما يلي مقابل قائمة المتطلبات التالية، وأخبرني إن كان العمل جاهزاً
                  للتسليم وما النواقص إن وجدت.»
                </div>
                {testLink ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>ملف الاختبارات</div>
                    <a
                      href={testLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ display: "inline-block" }}
                    >
                      فتح الرابط
                    </a>
                  </div>
                ) : (
                  <p className="help" style={{ margin: "0 0 12px" }}>
                    لم يُرفق رابط ملف اختبارات من الإدارة؛ يمكنك الاعتماد على تعليمات الدورة.
                  </p>
                )}
                <form className="fcd-audit__actions" onSubmit={onSubmitCompletion}>
                  <label className="fcd-audit__toggle">
                    <input
                      type="checkbox"
                      checked={auditConfirm}
                      onChange={(e) => setAuditConfirm(e.target.checked)}
                      disabled={submitting}
                    />
                    <span>لقد قمت بتدقيق العمل وكانت النتيجة: جاهز للتسليم</span>
                  </label>
                  <label className="auth-field" style={{ margin: 0 }}>
                    <span>نتيجة المساعد (اختياري — للصق نص من AI)</span>
                    <textarea
                      rows={3}
                      value={auditNotes}
                      onChange={(e) => setAuditNotes(e.target.value)}
                      disabled={submitting}
                      placeholder="يمكنك لصق ملخص نتيجة المراجعة هنا…"
                      style={{ width: "100%", borderRadius: 10, padding: 10, border: "1px solid var(--line)" }}
                    />
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={submitting || !auditConfirm}>
                    {submitting ? "جارٍ الإرسال…" : "تأكيد التدقيق وإنهاء الدورة"}
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {!completion?.testingEnabled && completion?.allLessonsComplete && !courseDone ? (
            <div className="dash-section">
              <p className="help" style={{ marginBottom: 12 }}>
                أكملت جميع الدروس. إذا لم يُسجَّل الإنهاء تلقائياً، اضغط الزر أدناه.
              </p>
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => void onSubmitCompletion()}>
                {submitting ? "جارٍ التسجيل…" : "إنهاء الدورة"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
