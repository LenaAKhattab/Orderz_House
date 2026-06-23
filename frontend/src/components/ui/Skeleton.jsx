import "../orders/order-details/order-details-page.css";
export { AuthRouteSkeleton } from "./AuthRouteSkeleton";

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
    <li className="oh-order-row-item" aria-hidden>
      <div className="oh-order-row">
        <div className="oh-order-row__side">
          <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            <SkelBar style={{ height: 12, width: 72 }} />
            <SkelBar style={{ height: 34, width: 92, borderRadius: 8 }} />
          </div>
        </div>
        <div className="oh-order-row__main">
          <SkelBar style={{ height: 16, width: "58%" }} />
          <div className="oh-order-row__meta oh-order-row__meta--skeleton">
            <SkelBar style={{ height: 12, width: 70 }} />
            <SkelBar style={{ height: 12, width: 98 }} />
            <SkelBar style={{ height: 12, width: 64 }} />
          </div>
          <SkelBar style={{ height: 12, width: "42%" }} />
          <SkelBar style={{ height: 12, width: "92%" }} />
          <SkelBar style={{ height: 12, width: "82%" }} />
        </div>
      </div>
    </li>
  );
}

/** Matches freelancer dashboard open-orders row (oh-order-row--neu) dimensions. */
export function PoolOrderDashboardRowSkeleton() {
  return (
    <li className="oh-order-row-item oh-order-row-item--skeleton" aria-hidden>
      <div className="oh-order-row oh-order-row--neu oh-order-row--skeleton fdash-surface-3d fdash-surface-3d--soft">
        <div className="oh-order-row__budget">
          <div className="oh-order-row__stat">
            <SkelBar style={{ height: 10, width: 48 }} />
            <SkelBar style={{ height: 14, width: 72 }} />
          </div>
          <div className="oh-order-row__stat">
            <SkelBar style={{ height: 10, width: 56 }} />
            <SkelBar style={{ height: 14, width: 64 }} />
          </div>
        </div>
        <div className="oh-order-row__divider" aria-hidden />
        <div className="oh-order-row__center">
          <SkelBar style={{ height: 16, width: "72%" }} />
          <SkelBar style={{ height: 12, width: "96%" }} />
          <SkelBar style={{ height: 12, width: "88%" }} />
          <div className="oh-order-row__chips">
            <SkelBar style={{ height: 24, width: 88, borderRadius: 999 }} />
            <SkelBar style={{ height: 24, width: 76, borderRadius: 999 }} />
          </div>
        </div>
        <div className="oh-order-row__divider" aria-hidden />
        <div className="oh-order-row__side">
          <SkelBar style={{ height: 12, width: 80 }} />
          <SkelBar style={{ height: 36, width: "100%", maxWidth: 140, borderRadius: 999 }} />
        </div>
      </div>
    </li>
  );
}

export function PoolOrderListSkeleton({ count = 4 }) {
  return (
    <ul
      className="oh-orders-list oh-orders-list--loading"
      role="status"
      aria-busy="true"
      aria-label="جارٍ تحميل الطلبات"
    >
      {Array.from({ length: count }).map((_, i) => (
        <PoolOrderDashboardRowSkeleton key={i} />
      ))}
    </ul>
  );
}

/** Marketplace toolbar — sort card placeholder (initial load). */
export function OpenOrdersToolbarSkeleton() {
  return (
    <div className="oh-orders-toolbar-neu__controls oh-orders-toolbar-skeleton" aria-hidden>
      <div className="oh-orders-sort-card-sk fdash-surface-3d fdash-surface-3d--soft">
        <SkelBar style={{ height: 12, width: 52 }} />
        <SkelBar style={{ height: 32, width: 118, borderRadius: 9 }} />
      </div>
    </div>
  );
}

/** Marketplace filters sidebar placeholder (initial load). */
export function OpenOrdersFiltersPanelSkeleton({ className = "" }) {
  return (
    <aside
      className={`oh-orders-filters oh-orders-filters--sticky oh-orders-filters--skeleton fdash-surface-3d fdash-surface-3d--soft ${className}`.trim()}
      aria-hidden
    >
      <SkelBar style={{ height: 16, width: "48%", marginBottom: 14 }} />
      <div className="oh-orders-filters-sk-switch">
        <SkelBar style={{ height: 36, flex: 1, borderRadius: 999 }} />
        <SkelBar style={{ height: 36, flex: 1, borderRadius: 999 }} />
      </div>
      <div className="oh-orders-filters-sk-list">
        {Array.from({ length: 4 }).map((_, gi) => (
          <div key={gi} className="oh-orders-filters-sk-group">
            <SkelBar style={{ height: 14, width: "62%" }} />
            {Array.from({ length: 3 }).map((__, ii) => (
              <SkelBar key={ii} style={{ height: 12, width: ii % 2 ? "78%" : "88%" }} />
            ))}
          </div>
        ))}
      </div>
    </aside>
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
    <div className="od-pool-shell oh-order-details__layout order-details-layout" role="status" aria-busy="true" aria-label="جارٍ التحميل">
      <aside className="od-pool-summary oh-order-details__aside">
        <div className="od-aside-col">
          <div className="od-summary__surface">
            <SkelBar style={{ height: 10, width: "42%", marginBottom: 12 }} />
            <SkelBar style={{ height: 14, width: "72%", marginBottom: 14 }} />
            {[0, 1, 2].map((i) => (
              <div key={i} className="od-summary__row">
                <SkelBar style={{ height: 9, width: "50%", marginBottom: 6 }} />
                <SkelBar style={{ height: 12, width: "88%" }} />
              </div>
            ))}
          </div>
          <div className="od-files-card">
            <SkelBar style={{ height: 10, width: "36%", marginBottom: 10 }} />
            <SkelBar style={{ height: 36, width: "100%" }} />
          </div>
        </div>
      </aside>
      <div className="od-pool-title oh-order-details__main">
        <div className="od-title-desc-group">
          <div className="od-title-card">
            <SkelBar style={{ height: 10, width: "28%", marginBottom: 10 }} />
            <SkelBar style={{ height: 18, width: "85%" }} />
          </div>
          <div className="od-description" style={{ paddingTop: 12 }}>
            <SkelBar style={{ height: 11, width: "32%", marginBottom: 12 }} />
            <SkelBar style={{ height: 12, width: "100%", marginBottom: 8 }} />
            <SkelBar style={{ height: 12, width: "88%" }} />
          </div>
          <div className="od-description" style={{ paddingTop: 12 }}>
            <SkelBar style={{ height: 11, width: "36%", marginBottom: 12 }} />
            <SkelBar style={{ height: 12, width: "92%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlanCardSkeleton({ featured = false }) {
  return (
    <article className={`pricing-card pricing-card--skeleton ${featured ? "pricing-card--featured" : ""}`.trim()} aria-hidden>
      <span className="pricing-card__badge" style={{ opacity: 0.35, minWidth: 48, minHeight: 22 }} />
      <header className="pricing-card__head">
        <SkelBar style={{ height: 18, width: "62%", marginBottom: 8 }} />
        <SkelBar style={{ height: 28, width: "48%", marginTop: 4 }} />
      </header>
      <div className="pricing-card__divider" aria-hidden style={{ margin: "12px 0 10px", opacity: 0.35 }} />
      <ul className="pricing-card__features pricing-card__features--desktop" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 7, flex: 1 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="pricing-card__feature" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SkelBar style={{ height: 14, width: 14, borderRadius: 999, flexShrink: 0 }} />
            <SkelBar style={{ height: 11, flex: 1, minWidth: 0 }} />
          </li>
        ))}
      </ul>
      <div className="pricing-card__cta" style={{ marginTop: "auto", paddingTop: 14 }}>
        <SkelBar style={{ height: 42, width: "100%", borderRadius: 999 }} />
      </div>
    </article>
  );
}

export function PlanCardsRowSkeleton({ count = 5, className = "" }) {
  return (
    <div
      className={["pricing__grid", className].filter(Boolean).join(" ")}
      role="status"
      aria-busy="true"
      aria-label="جارٍ التحميل"
    >
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

