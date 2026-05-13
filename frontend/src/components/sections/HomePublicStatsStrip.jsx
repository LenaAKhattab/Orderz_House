import { formatHomePublicStat, usePublicHomeStats } from "../../hooks/usePublicHomeStats";
import "./home-public-stats.css";

/**
 * Horizontal stats strip below the hero. Cards render only when their Super Admin toggle is ON.
 */
export default function HomePublicStatsStrip() {
  const { payload } = usePublicHomeStats();

  if (payload === null || payload.error) return null;

  const { showVisitorsCount, showActiveUsersCount, visitors, activeUsers, analyticsDegraded } = payload;
  if (!showVisitorsCount && !showActiveUsersCount) return null;

  return (
    <section className="home-stats-strip" dir="rtl" aria-live="polite">
      <div className="container">
        <div className="home-stats-strip__row">
          {showVisitorsCount ? (
            <div className="home-stats-strip__card">
              <span className="home-stats-strip__label">زائر للموقع</span>
              <span className="home-stats-strip__value">
                {visitors != null && !Number.isNaN(Number(visitors)) ? formatHomePublicStat(visitors) : "—"}
              </span>
              <span className="home-stats-strip__sub">آخر 7 أيام</span>
              {analyticsDegraded ? <span className="home-stats-strip__hint">تقديري</span> : null}
            </div>
          ) : null}
          {showActiveUsersCount ? (
            <div className="home-stats-strip__card">
              <span className="home-stats-strip__label">مستخدمون نشطون</span>
              <span className="home-stats-strip__value">
                {activeUsers != null && !Number.isNaN(Number(activeUsers)) ? formatHomePublicStat(activeUsers) : "—"}
              </span>
              <span className="home-stats-strip__sub">آخر 7 أيام</span>
              {analyticsDegraded ? <span className="home-stats-strip__hint">تقديري</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
