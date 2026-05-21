/** Large pastel icon block for insight cards (RTL — first column / right side). */
export default function DashboardInsightIcon({ tone = "blue", children }) {
  return (
    <div className="fdash-insight-card__icon-wrap">
      <span className={`fdash-insight-card__icon fdash-insight-card__icon--${tone}`} aria-hidden>
        {children}
      </span>
    </div>
  );
}
