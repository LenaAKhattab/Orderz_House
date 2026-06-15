import { useTranslation } from "../../../../i18n/LanguageProvider";
import { getLocalizedField } from "../../../../lib/i18n/getLocalizedField";

export default function AchievementsCard({ achievements = [], loading }) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <article className="fdash-cc-card fdash-cc-card--achievements">
        <div className="fdash-cc-skel" style={{ height: 100 }} />
      </article>
    );
  }

  const list = Array.isArray(achievements) ? achievements : [];
  const achieved = list.filter((a) => a.achieved);
  const upcoming = list.filter((a) => !a.achieved && !a.unavailable);

  return (
    <article className="fdash-cc-card fdash-cc-card--achievements">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.achievements.title")}</h3>
      </header>
      {achieved.length === 0 && upcoming.length === 0 ? (
        <p className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.achievements.empty")}</p>
      ) : (
        <ul className="fdash-growth-achievements">
          {achieved.map((a) => (
            <li key={a.id} className="fdash-growth-achievements__item fdash-growth-achievements__item--done">
              <span className="fdash-growth-achievements__icon" aria-hidden>
                ✓
              </span>
              <div>
                <strong>{getLocalizedField(a, "title", locale)}</strong>
                <p>{getLocalizedField(a, "description", locale)}</p>
              </div>
            </li>
          ))}
          {upcoming.map((a) => (
            <li key={a.id} className="fdash-growth-achievements__item">
              <span className="fdash-growth-achievements__icon" aria-hidden>
                ○
              </span>
              <div>
                <strong>{getLocalizedField(a, "title", locale)}</strong>
                <p>{getLocalizedField(a, "description", locale)}</p>
                {a.target != null && a.progress != null ? (
                  <div className="fdash-growth-bar fdash-growth-bar--sm">
                    <span
                      className="fdash-growth-bar__fill"
                      style={{ width: `${Math.min(100, Math.round((a.progress / a.target) * 100))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
