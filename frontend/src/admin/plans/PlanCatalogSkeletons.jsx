const FEATURE_WIDTHS = ["88%", "74%", "92%", "68%"];

function Skel({ className = "", style }) {
  return <span className={`oh-sapl-skel ${className}`.trim()} style={style} aria-hidden />;
}

/**
 * Compact placeholder for تعيين كافتراضي / ✓ الافتراضي حاليًا.
 * Same slot size as the resolved control — no loading copy.
 */
export function DefaultPlanControlSkeleton({ isEn = false }) {
  return (
    <span
      className="oh-sapl-skel oh-sapl-default-control__skel"
      role="status"
      aria-busy="true"
      aria-label={isEn ? "Default catalog status" : "حالة الباقات الافتراضية"}
    />
  );
}

/**
 * Admin plan-card shaped skeleton (الباقات الرئيسية / باقات الصفحات).
 */
export function PlanCardSkeleton() {
  return (
    <article className="oh-sapl-card oh-sapl-card--skeleton" aria-hidden>
      <header className="oh-sapl-card__header">
        <div className="oh-sapl-card__header-main">
          <div className="oh-sapl-card__title-row">
            <Skel className="oh-sapl-skel--title" />
          </div>
          <div className="oh-sapl-card__status-row">
            <Skel className="oh-sapl-skel--badge" />
            <Skel className="oh-sapl-skel--badge" />
          </div>
        </div>
        <div className="oh-sapl-card__header-toggle">
          <Skel className="oh-sapl-skel--toggle" />
        </div>
      </header>

      <div className="oh-sapl-card__body">
        <Skel className="oh-sapl-skel--price" />
        <Skel className="oh-sapl-skel--meta" />
        <ul className="oh-sapl-card__benefits">
          {FEATURE_WIDTHS.map((width, index) => (
            <li key={index} className="oh-sapl-card__benefit">
              <Skel className="oh-sapl-skel--dot" />
              <Skel className="oh-sapl-skel--feature" style={{ width }} />
            </li>
          ))}
        </ul>
      </div>

      <footer className="oh-sapl-card__footer">
        <div className="oh-sapl-card__footer-actions">
          <Skel className="oh-sapl-skel--action" />
          <Skel className="oh-sapl-skel--action" />
        </div>
      </footer>
    </article>
  );
}

/**
 * Marketplace membership card shaped skeleton (باقات العمل).
 * Same shimmer language as PlanCardSkeleton; layout matches oh-mmp-card.
 */
export function MarketplacePlanCardSkeleton() {
  return (
    <article className="oh-mmp-card oh-sapl-card--skeleton" aria-hidden>
      <header className="oh-mmp-card__header">
        <div className="oh-mmp-card__titles">
          <Skel className="oh-sapl-skel--title" />
          <Skel className="oh-sapl-skel--meta" style={{ marginTop: "0.35rem", width: "38%" }} />
        </div>
        <div className="oh-mmp-card__badges">
          <Skel className="oh-sapl-skel--badge" />
        </div>
      </header>
      <div className="oh-mmp-card__meta oh-sapl-skel-meta-grid">
        {[0, 1, 2, 3].map((index) => (
          <div key={index}>
            <Skel className="oh-sapl-skel--meta" style={{ width: index % 2 ? "58%" : "72%" }} />
            <Skel className="oh-sapl-skel--feature" style={{ width: "84%", marginTop: "0.35rem" }} />
          </div>
        ))}
      </div>
      <footer className="oh-mmp-card__actions">
        <div className="oh-mmp-card__reorder">
          <Skel className="oh-sapl-skel--icon-btn" />
          <Skel className="oh-sapl-skel--icon-btn" />
        </div>
        <div className="oh-mmp-card__primary-actions">
          <Skel className="oh-sapl-skel--action" />
          <Skel className="oh-sapl-skel--action" />
        </div>
      </footer>
    </article>
  );
}

export function PlanCardsGridSkeleton({
  count = 4,
  className = "oh-sapl-cards",
  variant = "admin",
  isEn = false,
}) {
  const Card = variant === "marketplace" ? MarketplacePlanCardSkeleton : PlanCardSkeleton;
  return (
    <div
      className={className}
      role="status"
      aria-busy="true"
      aria-label={isEn ? "Plan catalog" : "كتالوج الباقات"}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} />
      ))}
    </div>
  );
}
