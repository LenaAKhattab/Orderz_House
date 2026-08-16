import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";

export default function TrainingPackageAdminCard({
  pkg,
  isEn = false,
  busy = false,
  reordering = false,
  canMoveUp = false,
  canMoveDown = false,
  onEdit,
  onToggleVisible,
  onMove,
}) {
  if (!pkg) return null;
  const title = isEn ? pkg.nameEn || pkg.nameAr : pkg.nameAr;
  const visible = pkg.isVisible !== false;

  return (
    <article className={`oh-mmp-card${visible ? "" : " oh-mmp-card--inactive"}`}>
      <header className="oh-mmp-card__header">
        <div className="oh-mmp-card__titles">
          <h3 className="oh-mmp-card__title">{title}</h3>
          <p className="oh-mmp-card__tier">{pkg.code}</p>
        </div>
        <div className="oh-mmp-card__badges">
          <StatusBadge tone={visible ? "success" : "neutral"}>
            {visible ? (isEn ? "Visible" : "ظاهرة") : isEn ? "Hidden" : "مخفية"}
          </StatusBadge>
          {pkg.featured ? (
            <StatusBadge tone="info">{pkg.badgeAr || (isEn ? "Featured" : "الأكثر طلبًا")}</StatusBadge>
          ) : null}
        </div>
      </header>
      <dl className="oh-mmp-card__meta">
        <div>
          <dt>{isEn ? "Price (JOD)" : "السعر بالدينار الأردني"}</dt>
          <dd>{pkg.priceJod}</dd>
        </div>
        <div>
          <dt>{isEn ? "Duration" : "مدة الباقة"}</dt>
          <dd>{pkg.durationMonths || "—"}</dd>
        </div>
        <div>
          <dt>{isEn ? "Order" : "الترتيب"}</dt>
          <dd>{pkg.sortOrder}</dd>
        </div>
      </dl>
      <footer className="oh-mmp-card__footer">
        <div className="oh-mmp-card__footer-actions">
          <Button type="button" onClick={() => onEdit(pkg)} disabled={busy}>
            {isEn ? "Edit" : "تعديل"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onToggleVisible(pkg, !visible)}
            disabled={busy}
          >
            {visible ? (isEn ? "Hide" : "إخفاء") : isEn ? "Show" : "إظهار"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy || reordering || !canMoveUp} onClick={() => onMove(pkg, "up")}>
            {isEn ? "Up" : "أعلى"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy || reordering || !canMoveDown} onClick={() => onMove(pkg, "down")}>
            {isEn ? "Down" : "أسفل"}
          </Button>
        </div>
      </footer>
    </article>
  );
}
