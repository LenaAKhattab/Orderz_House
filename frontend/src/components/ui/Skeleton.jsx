/**
 * Shared loading placeholders (skeletons) — use instead of plain "جارٍ التحميل…" copy.
 */

export function SkelBar({ className = "", style = {} }) {
  return <span className={`oh-skel oh-skel-line ${className}`.trim()} style={style} aria-hidden />;
}

export function SelectPanelBusySkeleton() {
  return (
    <div style={{ padding: "10px 12px", display: "grid", gap: 8 }} aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkelBar key={i} style={{ height: 12, width: i % 2 ? "82%" : "100%" }} />
      ))}
    </div>
  );
}

export function SubscriptionCardSkeleton() {
  return (
    <div className="card" role="status" aria-busy="true" aria-label="جارٍ التحميل">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "grid", gap: 8 }}>
            <SkelBar style={{ height: 10, width: "42%" }} />
            <SkelBar style={{ height: 15, width: "88%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PoolOrderCardSkeleton() {
  return (
    <article className="oh-pool-card oh-pool-card--skeleton" aria-hidden>
      <div className="oh-pool-card__head">
        <div className="oh-pool-card__title-wrap" style={{ flex: 1, minWidth: 0 }}>
          <SkelBar style={{ height: 16, width: "74%" }} />
          <SkelBar style={{ height: 11, width: "48%" }} />
        </div>
        <SkelBar style={{ height: 24, width: 52, borderRadius: 999 }} />
      </div>
      <div className="oh-pool-card__meta">
        <SkelBar style={{ height: 24, width: 92, borderRadius: 999 }} />
        <SkelBar style={{ height: 24, width: 84, borderRadius: 999 }} />
        <SkelBar style={{ height: 24, width: 100, borderRadius: 999 }} />
      </div>
      <SkelBar style={{ height: 40, width: "100%" }} />
      <div className="oh-pool-card__actions">
        <SkelBar style={{ height: 36, width: 118, borderRadius: 12 }} />
        <SkelBar style={{ height: 36, width: 124, borderRadius: 12 }} />
      </div>
    </article>
  );
}

export function PoolOrderListSkeleton({ count = 4 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <PoolOrderCardSkeleton key={i} />
      ))}
    </>
  );
}

export function AssignedOrderCardSkeleton() {
  return (
    <article className="oh-assigned-card oh-assigned-card--skeleton" aria-hidden>
      <div className="oh-assigned-card__main">
        <SkelBar style={{ height: 16, width: "78%" }} />
        <SkelBar style={{ height: 12, width: "55%" }} />
        <div className="oh-assigned-card__chips" style={{ marginTop: 4 }}>
          <SkelBar style={{ height: 22, width: 76, borderRadius: 999 }} />
          <SkelBar style={{ height: 22, width: 88, borderRadius: 999 }} />
          <SkelBar style={{ height: 22, width: 70, borderRadius: 999 }} />
        </div>
      </div>
      <div className="oh-assigned-card__side">
        <SkelBar style={{ height: 26, width: 72, borderRadius: 999 }} />
        <SkelBar style={{ height: 34, width: 96, borderRadius: 12 }} />
      </div>
    </article>
  );
}

export function AssignedOrderListSkeleton({ count = 4 }) {
  return (
    <div className="oh-assigned-list" role="status" aria-busy="true" aria-label="جارٍ التحميل" style={{ marginTop: 0 }}>
      {Array.from({ length: count }).map((_, i) => (
        <AssignedOrderCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <article className="oh-pool-card oh-pool-card--static oh-pool-card--skeleton" aria-hidden>
      <header className="oh-pool-card__head">
        <div className="oh-pool-card__title-wrap">
          <SkelBar style={{ height: 17, width: "72%" }} />
          <div className="oh-pool-card__sub" style={{ marginTop: 4 }}>
            <SkelBar style={{ height: 20, width: 110, borderRadius: 10 }} />
          </div>
        </div>
        <div className="oh-pool-card__badges">
          <SkelBar style={{ height: 26, width: 56, borderRadius: 999 }} />
          <SkelBar style={{ height: 26, width: 48, borderRadius: 999 }} />
        </div>
      </header>
      <div className="oh-pool-card__meta">
        {[120, 72, 88, 96, 140].map((w) => (
          <SkelBar key={w} style={{ height: 30, width: w, borderRadius: 999 }} />
        ))}
      </div>
      <SkelBar style={{ height: 40, width: "100%" }} />
      <div className="oh-pool-card__actions">
        <SkelBar style={{ height: 40, width: 120, borderRadius: 12 }} />
        <SkelBar style={{ height: 40, width: 132, borderRadius: 12 }} />
      </div>
    </article>
  );
}

/** Place inside an existing `.cards-grid` wrapper. */
export function OrderCardsGridSkeleton({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </>
  );
}

/** Plan / subscription admin lists: nested grid under a section title. */
export function AdminInlineGridSkeleton({ count = 3 }) {
  return (
    <div className="cards-grid" style={{ marginTop: 12 }} role="status" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: count }).map((_, i) => (
        <AdminListCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function OrderDetailsPageSkeleton() {
  return (
    <section className="order-details__grid" role="status" aria-busy="true" aria-label="جارٍ التحميل">
      <section className="order-details__main">
        <div className="order-details__desc">
          <SkelBar style={{ height: 14, width: "38%", marginBottom: 12 }} />
          <SkelBar style={{ height: 12, width: "100%", marginBottom: 8 }} />
          <SkelBar style={{ height: 12, width: "100%", marginBottom: 8 }} />
          <SkelBar style={{ height: 12, width: "92%", marginBottom: 8 }} />
          <SkelBar style={{ height: 12, width: "88%" }} />
        </div>
        <div className="order-details__block">
          <SkelBar style={{ height: 14, width: "32%", marginBottom: 10 }} />
          <SkelBar style={{ height: 12, width: "100%", marginBottom: 8 }} />
          <SkelBar style={{ height: 12, width: "70%" }} />
        </div>
      </section>
      <aside className="order-details__side">
        <section className="order-details__meta card">
          <SkelBar style={{ height: 16, width: "52%", marginBottom: 14 }} />
          <div className="order-details__meta-list">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="order-details__meta-row"
                style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 10, alignItems: "center" }}
              >
                <SkelBar style={{ height: 10, width: "72%" }} />
                <SkelBar style={{ height: 12, width: "90%" }} />
              </div>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

export function PlanCardSkeleton({ featured = false }) {
  return (
    <article className={`pricing-card pricing-card--skeleton ${featured ? "pricing-card--featured" : ""}`.trim()} aria-hidden>
      {featured ? (
        <span className="pricing-card__badge" style={{ opacity: 0.45 }}>
          الأكثر شيوعًا
        </span>
      ) : null}
      <header className="pricing-card__head">
        <SkelBar style={{ height: 20, width: "58%", marginBottom: 10 }} />
        <SkelBar style={{ height: 12, width: "100%", marginBottom: 6 }} />
        <SkelBar style={{ height: 12, width: "85%" }} />
      </header>
      <div className="pricing-card__price" style={{ marginTop: 8 }}>
        <SkelBar style={{ height: 36, width: "52%" }} />
      </div>
      <div className="pricing-card__divider" aria-hidden style={{ margin: "14px 0 12px", opacity: 0.35 }} />
      <ul className="pricing-card__features" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10, flex: 1 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="pricing-card__feature" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <SkelBar style={{ height: 14, width: 14, borderRadius: 4, flexShrink: 0 }} />
            <SkelBar style={{ height: 12, flex: 1, minWidth: 0 }} />
          </li>
        ))}
      </ul>
      <div className="pricing-card__cta" style={{ marginTop: "auto", paddingTop: 18 }}>
        <SkelBar style={{ height: 44, width: "100%", borderRadius: 14 }} />
      </div>
    </article>
  );
}

export function PlanCardsRowSkeleton({ count = 3 }) {
  return (
    <div className="pricing__grid" role="status" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: count }).map((_, i) => (
        <PlanCardSkeleton key={i} featured={i === Math.floor(count / 2)} />
      ))}
    </div>
  );
}

export function AdminListCardSkeleton() {
  return (
    <article className="card" aria-hidden>
      <SkelBar style={{ height: 18, width: "40%", marginBottom: 12 }} />
      <SkelBar style={{ height: 12, width: "100%", marginBottom: 8 }} />
      <SkelBar style={{ height: 12, width: "96%", marginBottom: 8 }} />
      <SkelBar style={{ height: 12, width: "88%", marginBottom: 8 }} />
      <SkelBar style={{ height: 12, width: "72%" }} />
    </article>
  );
}

/** Full-screen session restore (replaces plain text in AuthGuards). */
export function AuthRouteSkeleton() {
  return (
    <div className="auth-route-loading auth-route-loading--skel" role="status" aria-live="polite" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="auth-route-skel">
        <SkelBar style={{ height: 22, width: 200, borderRadius: 8, margin: "0 auto 22px" }} />
        <SkelBar style={{ height: 13, width: "min(420px, 90vw)", margin: "0 auto 10px" }} />
        <SkelBar style={{ height: 13, width: "min(320px, 75vw)", margin: "0 auto" }} />
      </div>
    </div>
  );
}
