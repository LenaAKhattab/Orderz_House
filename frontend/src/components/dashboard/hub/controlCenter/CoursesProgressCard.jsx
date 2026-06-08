import { Link } from "react-router-dom";
import WidgetLoadError from "./WidgetLoadError";

export default function CoursesProgressCard({
  courseAgg,
  loadState = "ok",
  loadError = "",
  onRetry,
  loading,
  focusBadge = null,
}) {
  if (loading) {
    return (
      <article className="fdash-cc-card">
        <div className="fdash-cc-skel" style={{ height: 100 }} />
      </article>
    );
  }

  const failed = loadState === "error";
  const agg = courseAgg || { total: 0, inProgress: 0, completed: 0, pendingFinalTest: 0 };
  const continueCourse = agg.continueCourse;

  return (
    <article
      className={`fdash-cc-card fdash-cc-card--courses${focusBadge ? " fdash-cc-card--courses-focus" : ""}`}
    >
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">
          الدورات والتدريب
          {focusBadge ? <span className="fdash-cc-card__focus-badge">{focusBadge}</span> : null}
        </h3>
        <Link to="/dashboard/freelancer/courses" className="fdash-cc-card__link">
          جميع الدورات
        </Link>
      </header>
      {failed ? (
        <WidgetLoadError message={loadError || "تعذر تحميل الدورات."} onRetry={onRetry} />
      ) : (
        <>
          <p className="fdash-cc-card__note">إكمال الدورات لا يغيّر أهلية المعرض تلقائياً — للتطوير المهني فقط.</p>
          <div className="fdash-cc-metrics fdash-cc-metrics--4">
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">مسندة</span>
              <strong className="fdash-cc-metric__value">{agg.total}</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">قيد التنفيذ</span>
              <strong className="fdash-cc-metric__value">{agg.inProgress}</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">مكتملة</span>
              <strong className="fdash-cc-metric__value">{agg.completed}</strong>
            </div>
            <div className="fdash-cc-metric fdash-cc-metric--accent">
              <span className="fdash-cc-metric__label">اختبار نهائي</span>
              <strong className="fdash-cc-metric__value">{agg.pendingFinalTest}</strong>
            </div>
          </div>
          {agg.pendingFinalTest > 0 ? (
            <p className="fdash-cc-card__warn">لديك {agg.pendingFinalTest} دورة بانتظار الاختبار النهائي.</p>
          ) : null}
          {continueCourse ? (
            <Link
              to={`/dashboard/freelancer/courses/${continueCourse.id}`}
              className="fdash-cc-btn fdash-cc-btn--block"
            >
              متابعة: {continueCourse.title || "الدورة"}
            </Link>
          ) : agg.total === 0 ? (
            <p className="fdash-cc-card__muted">لا توجد دورات مسندة حالياً.</p>
          ) : null}
        </>
      )}
    </article>
  );
}
