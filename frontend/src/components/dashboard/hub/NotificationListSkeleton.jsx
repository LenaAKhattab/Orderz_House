export default function NotificationListSkeleton({ count = 5 }) {
  return (
    <section className="fn-surface fn-inbox fn-inbox--loading" aria-busy="true" aria-hidden>
      <div className="fn-notif-list fn-notif-list--loading">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="fn-notif-card fn-notif-card--skeleton">
            <div className="fn-notif-card__surface">
              <div className="fn-notif-card__start">
                <div className="fn-notif-card__rail">
                  <div className="fdash-skel fn-notif-card__sk-icon" />
                  <div className="fdash-skel fn-notif-card__sk-pill" />
                </div>
                <span className="fn-notif-card__rail-sep" aria-hidden />
                <div className="fn-notif-card__body">
                  <div className="fdash-skel" style={{ height: 15, width: "48%" }} />
                  <div className="fdash-skel" style={{ height: 11, width: "32%", marginTop: 6 }} />
                  <div className="fdash-skel" style={{ height: 12, width: "78%", marginTop: 6 }} />
                </div>
              </div>
              <div className="fn-notif-card__aside">
                <div className="fn-notif-card__sk-actions">
                  <div className="fdash-skel" style={{ height: 32, width: 88, borderRadius: 999 }} />
                  <div className="fdash-skel" style={{ height: 32, width: 56, borderRadius: 999 }} />
                </div>
                <div className="fdash-skel" style={{ height: 11, width: 56, marginTop: 2 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
