import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
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
      if (out?.lessons?.length) {
        setActiveLessonId((prev) => {
          if (prev && out.lessons.some((l) => String(l.id) === String(prev))) return prev;
          return out.lessons[0].id;
        });
      } else {
        setActiveLessonId(null);
      }
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

  const lessons = data?.lessons || [];

  const activeLesson = useMemo(
    () => lessons.find((x) => String(x.id) === String(activeLessonId)) || lessons[0],
    [lessons, activeLessonId],
  );

  const activeIndex = useMemo(
    () => lessons.findIndex((x) => String(x.id) === String(activeLesson?.id)),
    [lessons, activeLesson],
  );

  const completion = data?.completion;
  const course = data?.course;

  const goPrevLesson = () => {
    if (activeIndex <= 0) return;
    setActiveLessonId(lessons[activeIndex - 1].id);
  };

  const goNextLesson = () => {
    if (activeIndex < 0 || activeIndex >= lessons.length - 1) return;
    setActiveLessonId(lessons[activeIndex + 1].id);
  };

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

  const progress = data?.progress;
  const pct = Number(progress?.percentage) || 0;

  return (
    <section className="fcd-page container page-content dash-shell">
      {loading ? (
        <div className="fcd-page__loading" aria-busy="true">
          <span className="fcd-page__loading-dot" />
          <span className="fcd-page__loading-dot" />
          <span className="fcd-page__loading-dot" />
          <p>جارٍ تحميل الدورة…</p>
        </div>
      ) : null}

      {!loading && course ? (
        <>
          <header className="fcd-page__hero">
            <div className="fcd-page__hero-top">
              <NavLink to="/dashboard/freelancer/courses" className="fcd-page__back">
                <span className="fcd-page__back-icon" aria-hidden>
                  →
                </span>
                العودة إلى الدورات
              </NavLink>
              <div className="fcd-page__hero-badge">تفاصيل الدورة</div>
            </div>
            <h1 className="fcd-page__title">{course.title}</h1>
            {course.description ? <p className="fcd-page__subtitle">{course.description}</p> : null}

            <div className="fcd-page__progress-block">
              <div className="fcd-page__progress-label">
                <span>التقدم</span>
                <strong>
                  {progress?.completedLessons ?? 0}/{progress?.totalLessons ?? 0} دروس · {pct}%
                </strong>
              </div>
              <div className="fcd-page__progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="fcd-page__progress-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
              </div>
            </div>
          </header>

          {courseDone ? (
            <div className="fcd-done fcd-page__done-banner" role="status">
              <span className="fcd-page__done-icon" aria-hidden>
                ✓
              </span>
              <div>
                <strong>تم إنهاء هذه الدورة بنجاح.</strong>
                {data.assignment?.completedAt ? (
                  <span className="fcd-page__done-date">تاريخ الإنهاء مسجّل في النظام.</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="fcd-page__layout">
            <aside className="fcd-page__sidebar" aria-label="قائمة الدروس">
              <h2 className="fcd-page__sidebar-heading">محتوى الدورة</h2>
              <ol className="fcd-page__lesson-list">
                {lessons.map((lesson, idx) => {
                  const isActive = String(lesson.id) === String(activeLesson?.id);
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        className={`fcd-page__lesson-btn ${isActive ? "fcd-page__lesson-btn--active" : ""}`}
                        onClick={() => setActiveLessonId(lesson.id)}
                        disabled={courseDone}
                      >
                        <span className="fcd-page__lesson-index">{idx + 1}</span>
                        <span className="fcd-page__lesson-info">
                          <span className="fcd-page__lesson-title">{lesson.title}</span>
                          <span
                            className={
                              lesson.isCompleted ? "fcd-page__lesson-status fcd-page__lesson-status--done" : "fcd-page__lesson-status"
                            }
                          >
                            {lesson.isCompleted ? "مكتمل" : "لم يُكتمل"}
                          </span>
                        </span>
                        {lesson.isCompleted ? (
                          <span className="fcd-page__lesson-check" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>

            <main className="fcd-page__main">
              <div className="fcd-page__player-shell">
                {activeLesson?.youtubeVideoId ? (
                  <div className="fcd-page__player">
                    <iframe
                      title={activeLesson.title}
                      src={toEmbedUrl(activeLesson.youtubeVideoId)}
                      className="fcd-page__iframe"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="fcd-page__no-video">
                    <p>لا يوجد فيديو متاح لهذا الدرس.</p>
                  </div>
                )}
              </div>

              <div className="fcd-page__lesson-toolbar">
                <div className="fcd-page__lesson-heading">
                  <h2 className="fcd-page__lesson-name">{activeLesson?.title || "—"}</h2>
                  <p className="fcd-page__lesson-meta-line">
                    الدرس {activeIndex >= 0 ? activeIndex + 1 : 0} من {lessons.length}
                  </p>
                </div>
                <div className="fcd-page__lesson-actions">
                  <button
                    type="button"
                    className="fcd-page__btn fcd-page__btn--ghost"
                    onClick={goPrevLesson}
                    disabled={courseDone || activeIndex <= 0}
                  >
                    الدرس السابق
                  </button>
                  <button
                    type="button"
                    className="fcd-page__btn fcd-page__btn--primary"
                    onClick={onComplete}
                    disabled={courseDone}
                  >
                    تسجيل إكمال المشاهدة
                  </button>
                  <button
                    type="button"
                    className="fcd-page__btn fcd-page__btn--ghost"
                    onClick={goNextLesson}
                    disabled={courseDone || activeIndex < 0 || activeIndex >= lessons.length - 1}
                  >
                    الدرس التالي
                  </button>
                </div>
              </div>
            </main>
          </div>

          {showAuditCard ? (
            <div className="fcd-page__section">
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
                    <a href={testLink} target="_blank" rel="noopener noreferrer" className="fcd-page__btn fcd-page__btn--primary fcd-page__btn--inline">
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
                  <label className="fcd-page__textarea-label">
                    <span>نتيجة المساعد (اختياري — للصق نص من AI)</span>
                    <textarea
                      rows={3}
                      value={auditNotes}
                      onChange={(e) => setAuditNotes(e.target.value)}
                      disabled={submitting}
                      placeholder="يمكنك لصق ملخص نتيجة المراجعة هنا…"
                      className="fcd-page__textarea"
                    />
                  </label>
                  <button type="submit" className="fcd-page__btn fcd-page__btn--primary fcd-page__btn--block" disabled={submitting || !auditConfirm}>
                    {submitting ? "جارٍ الإرسال…" : "تأكيد التدقيق وإنهاء الدورة"}
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {!completion?.testingEnabled && completion?.allLessonsComplete && !courseDone ? (
            <div className="fcd-page__section fcd-page__finish-card">
              <p className="fcd-page__finish-text">أكملت جميع الدروس. إذا لم يُسجَّل الإنهاء تلقائياً، اضغط الزر أدناه.</p>
              <button
                type="button"
                className="fcd-page__btn fcd-page__btn--primary"
                disabled={submitting}
                onClick={() => void onSubmitCompletion()}
              >
                {submitting ? "جارٍ التسجيل…" : "إنهاء الدورة"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && !course ? (
        <div className="fcd-page__empty">
          <p>تعذر عرض الدورة. عد إلى قائمة الدورات وحاول مجدداً.</p>
          <NavLink to="/dashboard/freelancer/courses" className="fcd-page__btn fcd-page__btn--primary">
            الدورات التدريبية
          </NavLink>
        </div>
      ) : null}
    </section>
  );
}
