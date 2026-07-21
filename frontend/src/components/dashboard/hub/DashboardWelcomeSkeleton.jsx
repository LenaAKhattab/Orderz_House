import { useTranslation } from "../../../i18n/LanguageProvider";

/** Loading placeholder aligned with DashboardWelcomeHero (title + subtitle + metrics + actions). */
export default function DashboardWelcomeSkeleton() {
  const { t } = useTranslation();

  return (
    <section className="fdash-welcome fdash-welcome--loading fdash-surface-3d" aria-busy="true" aria-label={t("freelancerDashboard.common.loading")}>
      <div className="fdash-welcome__hero">
        <div className="fdash-welcome__content">
          <div className="fdash-skel fdash-skel--title" />
          <div className="fdash-skel fdash-skel--sub" />
        </div>
      </div>
      <div className="fdash-welcome__panel">
        <div className="fdash-welcome__main">
          <div className="fdash-welcome__metrics">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="fdash-skel fdash-skel--metric" />
            ))}
          </div>
          <div className="fdash-welcome__actions">
            <div className="fdash-skel fdash-skel--btn" />
            <div className="fdash-skel fdash-skel--btn" />
          </div>
        </div>
      </div>
    </section>
  );
}
