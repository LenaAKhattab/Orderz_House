import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";

export default function TrainingPackageAdminCard({
  pkg,
  busy = false,
  reordering = false,
  canMoveUp = false,
  canMoveDown = false,
  onEdit,
  onToggleVisible,
  onMove,
}) {
  const { t, locale } = useTranslation();
  const isEn = locale === "en";

  if (!pkg) return null;
  const title = isEn ? pkg.nameEn || pkg.nameAr : pkg.nameAr;
  const visible = pkg.isVisible !== false;
  const p = (key) => t(`planAdmin.trainingPackage.${key}`);

  return (
    <article className={`oh-mmp-card${visible ? "" : " oh-mmp-card--inactive"}`}>
      <header className="oh-mmp-card__header">
        <div className="oh-mmp-card__titles">
          <h3 className="oh-mmp-card__title">{title}</h3>
          <p className="oh-mmp-card__tier">{pkg.code}</p>
        </div>
        <div className="oh-mmp-card__badges">
          <StatusBadge tone={visible ? "success" : "neutral"}>
            {visible ? p("cardVisible") : p("cardHidden")}
          </StatusBadge>
          {pkg.featured ? (
            <StatusBadge tone="info">{pkg.badgeAr || p("cardFeatured")}</StatusBadge>
          ) : null}
        </div>
      </header>
      <dl className="oh-mmp-card__meta">
        <div>
          <dt>{p("cardPrice")}</dt>
          <dd>{pkg.priceJod}</dd>
        </div>
        <div>
          <dt>{p("cardDuration")}</dt>
          <dd>{pkg.durationMonths || "—"}</dd>
        </div>
        <div>
          <dt>{p("cardOrder")}</dt>
          <dd>{pkg.sortOrder}</dd>
        </div>
      </dl>
      <footer className="oh-mmp-card__footer">
        <div className="oh-mmp-card__footer-actions">
          <Button type="button" onClick={() => onEdit(pkg)} disabled={busy}>
            {p("cardEdit")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onToggleVisible(pkg, !visible)}
            disabled={busy}
          >
            {visible ? p("cardHide") : p("cardShow")}
          </Button>
          <Button type="button" variant="secondary" disabled={busy || reordering || !canMoveUp} onClick={() => onMove(pkg, "up")}>
            {p("cardUp")}
          </Button>
          <Button type="button" variant="secondary" disabled={busy || reordering || !canMoveDown} onClick={() => onMove(pkg, "down")}>
            {p("cardDown")}
          </Button>
        </div>
      </footer>
    </article>
  );
}
