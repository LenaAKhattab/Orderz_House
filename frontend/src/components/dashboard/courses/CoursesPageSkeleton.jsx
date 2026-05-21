export default function CoursesPageSkeleton() {
  return (
    <div className="fc-page fc-page--loading" aria-busy="true" aria-hidden>
      <header className="fc-surface fc-hero fc-hero--sk">
        <div className="fc-hero__copy">
          <div className="fdash-skel" style={{ height: 32, width: "55%" }} />
          <div className="fdash-skel" style={{ height: 14, width: "75%", marginTop: 12 }} />
          <div className="fdash-skel" style={{ height: 44, width: "100%", marginTop: 18, borderRadius: 14 }} />
        </div>
        <div className="fdash-skel fc-hero__art-sk" />
      </header>

      <div className="fc-surface fc-stats-bar fc-stats-bar--sk">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="fc-stat-segment fc-stat-segment--sk">
            <div className="fdash-skel" style={{ width: 40, height: 40, borderRadius: 12 }} />
            <div className="fc-stat-segment__copy">
              <div className="fdash-skel" style={{ height: 11, width: 72 }} />
              <div className="fdash-skel" style={{ height: 18, width: 36, marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="fc-surface fc-toolbar fc-toolbar--sk">
        <div className="fdash-skel" style={{ height: 40, width: "100%", borderRadius: 999 }} />
      </div>

      <div className="fc-list fc-list--sk">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="fc-course-card fc-course-card--sk fc-surface-3d fc-surface-3d--soft">
            <div className="fdash-skel fc-course-card__thumb-sk" />
            <div className="fc-course-card__body-sk">
              <div className="fdash-skel" style={{ height: 20, width: "70%" }} />
              <div className="fdash-skel" style={{ height: 13, width: "90%", marginTop: 10 }} />
              <div className="fdash-skel" style={{ height: 11, width: "50%", marginTop: 10 }} />
            </div>
            <div className="fc-course-card__aside-sk">
              <div className="fdash-skel" style={{ height: 28, width: 48 }} />
              <div className="fdash-skel" style={{ height: 8, width: "100%", marginTop: 10, borderRadius: 999 }} />
              <div className="fdash-skel" style={{ height: 40, width: "100%", marginTop: 14, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
