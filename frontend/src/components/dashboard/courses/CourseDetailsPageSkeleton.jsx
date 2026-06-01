export default function CourseDetailsPageSkeleton() {
  return (
    <div className="fcd-page fcd-page--loading" aria-busy="true" aria-hidden>
      <div className="fcd-page__content">
        <header className="fcd-header fcd-header--sk fdash-surface-3d fdash-surface-3d--soft">
        <div className="fcd-header__top">
          <div className="fdash-skel" style={{ height: 28, width: 96, borderRadius: 999 }} />
          <div className="fdash-skel" style={{ height: 36, width: 148, borderRadius: 999 }} />
        </div>
        <div className="fcd-header__main">
          <div className="fcd-header__title-sk">
            <div className="fdash-skel" style={{ height: 28, width: "72%" }} />
            <div className="fdash-skel" style={{ height: 14, width: "48%", marginTop: 10 }} />
          </div>
          <div className="fdash-skel fcd-header__ring-sk" />
        </div>
          <div className="fcd-header__meta-sk">
            <div className="fdash-skel" style={{ height: 12, width: 120 }} />
            <div className="fdash-skel" style={{ height: 12, width: 100 }} />
            <div className="fdash-skel" style={{ height: 12, width: 88 }} />
          </div>
          <div className="fcd-header__status-rail fcd-header__status-rail--sk">
            <div className="fdash-skel" style={{ height: 28, width: "min(100%, 220px)", borderRadius: 999 }} />
            <div className="fdash-skel fcd-header__status-accent-sk" />
          </div>
        </header>

        <div className="fcd-layout">
          <aside className="fcd-sidebar fcd-sidebar--sk fdash-surface-3d fdash-surface-3d--soft">
            <div className="fdash-skel" style={{ height: 20, width: 120, marginBottom: 14 }} />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="fcd-sidebar__item-sk">
                <div className="fdash-skel" style={{ width: 32, height: 32, borderRadius: 10 }} />
                <div className="fcd-sidebar__item-sk-body">
                  <div className="fdash-skel" style={{ height: 13, width: "85%" }} />
                  <div className="fdash-skel" style={{ height: 11, width: "55%", marginTop: 8 }} />
                </div>
                <div className="fdash-skel" style={{ width: 32, height: 32, borderRadius: 10 }} />
              </div>
            ))}
          </aside>

          <main className="fcd-main fcd-main--sk">
            <div className="fcd-lesson-card fcd-lesson-card--sk fdash-surface-3d fdash-surface-3d--soft">
              <div className="fdash-skel fcd-lesson-card__video-sk" />
              <div className="fcd-lesson-card__body-sk">
                <div className="fdash-skel" style={{ height: 22, width: "65%" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <div className="fdash-skel" style={{ height: 26, width: 64, borderRadius: 999 }} />
                  <div className="fdash-skel" style={{ height: 26, width: 72, borderRadius: 999 }} />
                </div>
                <div className="fdash-skel" style={{ height: 14, width: "100%", marginTop: 14 }} />
                <div className="fcd-lesson-card__actions-sk">
                  <div className="fdash-skel" style={{ height: 44, width: 120, borderRadius: 999 }} />
                  <div className="fdash-skel" style={{ height: 44, width: 180, borderRadius: 999 }} />
                  <div className="fdash-skel" style={{ height: 44, width: 120, borderRadius: 999 }} />
                </div>
              </div>
            </div>
            <div className="fcd-summary-card fcd-summary-card--sk fdash-surface-3d fdash-surface-3d--soft">
              <div className="fdash-skel" style={{ height: 18, width: 200 }} />
              <div className="fdash-skel" style={{ height: 120, width: "100%", borderRadius: 20, marginTop: 14 }} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
