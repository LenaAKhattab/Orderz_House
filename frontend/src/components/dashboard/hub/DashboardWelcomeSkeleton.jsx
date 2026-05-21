export default function DashboardWelcomeSkeleton() {
  return (
    <section className="fdash-welcome fdash-welcome--loading" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="fdash-welcome__hero">
        <div className="fdash-welcome__content">
          <div className="fdash-skel fdash-skel--badge" />
          <div className="fdash-skel fdash-skel--title" />
          <div className="fdash-skel fdash-skel--sub" />
        </div>
        <div className="fdash-skel fdash-skel--illus" />
      </div>
      <div className="fdash-welcome__panel">
        <div className="fdash-skel fdash-skel--tip" />
        <div className="fdash-welcome__main">
          <div className="fdash-welcome__metrics">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="fdash-skel fdash-skel--metric" />
            ))}
          </div>
          <div className="fdash-welcome__actions">
            <div className="fdash-skel fdash-skel--btn" />
            <div className="fdash-skel fdash-skel--btn" />
          </div>
        </div>
      </div>
    </section>
  );
}
