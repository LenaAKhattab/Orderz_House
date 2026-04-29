import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { freelancerListMyCoursesRequest } from "../../services/api";
import { useToast } from "../../components/ui/toastContext";

export default function FreelancerCoursesPage() {
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const res = await freelancerListMyCoursesRequest();
        if (!mounted) return;
        setCourses(res?.data?.courses || []);
      } catch (err) {
        if (!mounted) return;
        toast.error(err?.response?.data?.message || "تعذر تحميل الدورات.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [toast]);

  return (
    <section className="dash">
      <header className="dash-hero">
        <h1>الدورات التدريبية</h1>
        <p>تابع دوراتك المسندة لك فقط وتقدمك داخل كل دورة.</p>
      </header>

      {loading ? <div className="dash-empty">جار التحميل...</div> : null}
      {!loading && !courses.length ? <div className="dash-empty">لا توجد دورات مسندة لك حالياً.</div> : null}

      <div className="cards-grid">
        {courses.map((course) => (
          <article className="card" key={course.id}>
            <h3>{course.title}</h3>
            <p>{course.description || "بدون وصف"}</p>
            <div>
              التقدم: {course.progress.completedLessons}/{course.progress.totalLessons} ({course.progress.percentage}%)
            </div>
            <Link className="btn btn-primary" to={`/dashboard/freelancer/courses/${course.id}`} style={{ marginTop: 10 }}>
              فتح الدورة
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
