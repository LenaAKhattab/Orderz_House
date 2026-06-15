import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { getLocalizedField } from "../../../../lib/i18n/getLocalizedField";

export default function ProfileCompletionCard({ profileCompletion, loading }) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <article className="fdash-cc-card">
        <div className="fdash-cc-skel" style={{ height: 140 }} />
      </article>
    );
  }

  const pc = profileCompletion || { percentage: 0, items: [], missing: [], suggestions: [] };
  const pct = Math.min(100, Math.max(0, Number(pc.percentage) || 0));
  const firstSuggestion =
    pc.suggestions?.[0] || t("freelancerDashboard.controlCenter.profileCompletion.completeProfile");

  return (
    <article className="fdash-cc-card fdash-cc-card--growth">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.profileCompletion.title")}</h3>
        <Link to="/dashboard/freelancer/settings" className="fdash-cc-card__link">
          {t("freelancerDashboard.controlCenter.profileCompletion.update")}
        </Link>
      </header>
      <div className="fdash-growth-ring" aria-hidden>
        <svg viewBox="0 0 36 36" className="fdash-growth-ring__svg">
          <path
            className="fdash-growth-ring__track"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className="fdash-growth-ring__fill"
            strokeDasharray={`${pct}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <span className="fdash-growth-ring__label">{pct}%</span>
      </div>
      <ul className="fdash-growth-checklist">
        {(pc.items || []).slice(0, 6).map((item) => (
          <li key={item.key} className={item.completed ? "is-done" : ""}>
            <span className="fdash-growth-checklist__mark" aria-hidden>
              {item.completed ? "✓" : "○"}
            </span>
            <span>{getLocalizedField(item, "label", locale)}</span>
          </li>
        ))}
      </ul>
      {pc.missing?.length > 0 ? (
        <Link to={pc.missing[0].actionUrl || "/dashboard/freelancer/settings"} className="fdash-cc-btn fdash-cc-btn--block">
          {firstSuggestion}
        </Link>
      ) : (
        <p className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.profileCompletion.complete")}</p>
      )}
    </article>
  );
}
