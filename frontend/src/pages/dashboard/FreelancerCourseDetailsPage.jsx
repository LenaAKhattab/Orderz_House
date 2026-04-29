import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { freelancerGetCourseDetailsRequest, freelancerMarkLessonCompleteRequest } from "../../services/api";
import { useToast } from "../../components/ui/toastContext";

function toEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(videoId || ""))}?rel=0&modestbranding=1&playsinline=1`;
}

export default function FreelancerCourseDetailsPage() {
  const { id } = useParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [activeLessonId, setActiveLessonId] = useState(null);

  const loadDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await freelancerGetCourseDetailsRequest(id);
      const out = res?.data || null;
      setData(out);
      if (!activeLessonId && out?.lessons?.length) setActiveLessonId(out.lessons[0].id);
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

  const activeLesson = useMemo(() => (data?.lessons || []).find((x) => String(x.id) === String(activeLessonId)) || data?.lessons?.[0], [data, activeLessonId]);

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

  return (
    <section className="dash">
      {loading ? <div className="dash-empty">جار التحميل...</div> : null}
      {!loading && data?.course ? (
        <>
          <header className="dash-hero">
            <h1>{data.course.title}</h1>
            <p>{data.course.description || "بدون وصف"}</p>
            <p>
              التقدم: {data.progress.completedLessons}/{data.progress.totalLessons} ({data.progress.percentage}%)
            </p>
          </header>

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
              <button type="button" className="btn btn-primary" onClick={onComplete}>
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
                  style={{ textAlign: "right", border: String(lesson.id) === String(activeLesson?.id) ? "2px solid var(--secondary)" : undefined }}
                  onClick={() => setActiveLessonId(lesson.id)}
                >
                  <strong>{lesson.title}</strong>
                  <div>{lesson.isCompleted ? "مكتمل" : "غير مكتمل"}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
