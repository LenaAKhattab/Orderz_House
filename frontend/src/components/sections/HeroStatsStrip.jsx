import { useMemo } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  FALLBACK_DEMO,
  statDisplayValueAnalytics,
  statDisplayValueProjects,
} from "./heroHomeStatUtils";
import "./home-hero-metrics.css";

function displayForRow(row, statsPayload) {
  if (row.kind === "project") return statDisplayValueProjects(row, statsPayload);
  return statDisplayValueAnalytics(row, statsPayload);
}

export default function HeroStatsStrip({ statsPayload }) {
  const { t } = useTranslation();
  const hs = "home.heroStrip";
  const stripStats = useMemo(
    () => [
      { key: "open", label: t(`${hs}.open`), hint: t(`${hs}.openHint`), demo: FALLBACK_DEMO.open, tone: "orange", kind: "project" },
      { key: "inProgress", label: t(`${hs}.inProgress`), hint: t(`${hs}.inProgressHint`), demo: FALLBACK_DEMO.inProgress, tone: "gold", kind: "project" },
      { key: "completed", label: t(`${hs}.completed`), hint: t(`${hs}.completedHint`), demo: FALLBACK_DEMO.completed, tone: "green", kind: "project" },
      { key: "views", label: t(`${hs}.views`), hint: t(`${hs}.viewsHint`), demo: FALLBACK_DEMO.views, tone: "blue", kind: "analytics" },
      { key: "active", label: t(`${hs}.activeUsers`), hint: t(`${hs}.activeUsersHint`), demo: FALLBACK_DEMO.activeUsers, tone: "purple", kind: "analytics" },
    ],
    [t],
  );

  return (
    <div className="home-hero-metrics w-full min-w-0" role="group" aria-label={t("home.metrics.statsAria")}>
      {stripStats.map((row) => (
        <div key={row.key} className="home-hero-metrics__item min-w-0">
          <p className="home-hero-metrics__value">{displayForRow(row, statsPayload)}</p>
          <div className="home-hero-metrics__text w-full min-w-0">
            <p className="home-hero-metrics__label">{row.label}</p>
            <p className="home-hero-metrics__hint">{row.hint}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
