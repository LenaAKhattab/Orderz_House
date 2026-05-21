export default function DashboardHubSkeletonCards({ count = 3, variant = "default" }) {
  if (variant === "order-row") {
    return (
      <div className="fdash-list__loading fdash-list__loading--order-row" aria-busy="true">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="fmo-order-row fmo-order-row--skeleton fdash-surface-3d fdash-surface-3d--soft" aria-hidden>
            <div className="fmo-order-row__surface">
              <div className="fmo-order-row__stats">
                <div className="fdash-skel" style={{ height: 24, width: 88, borderRadius: 999 }} />
                <div className="fdash-skel" style={{ height: 36, width: "100%" }} />
                <div className="fdash-skel" style={{ height: 36, width: "100%" }} />
              </div>
              <div className="fmo-order-row__divider fdash-skel" style={{ width: 1, minHeight: 76 }} />
              <div className="fmo-order-row__center">
                <div className="fdash-skel" style={{ height: 22, width: "72%" }} />
                <div className="fdash-skel" style={{ height: 14, width: "95%", marginTop: 8 }} />
                <div className="fdash-skel" style={{ height: 12, width: "55%", marginTop: 10 }} />
              </div>
              <div className="fmo-order-row__divider fdash-skel" style={{ width: 1, minHeight: 76 }} />
              <div className="fdash-skel" style={{ height: 44, width: "100%", borderRadius: 14 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="fdash-list__loading" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="fdash-entity-card fdash-entity-card--skeleton" aria-hidden>
          <div className="fdash-entity-card__media fdash-skel" />
          <div>
            <div className="fdash-skel" style={{ height: 22, width: "70%" }} />
            <div className="fdash-skel" style={{ height: 14, width: "95%", marginTop: 8 }} />
            <div className="fdash-skel" style={{ height: 8, width: "100%", marginTop: 12 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
