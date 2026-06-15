import { useTranslation } from "../../../i18n/LanguageProvider";
import DashboardIllustration from "./DashboardIllustration";
import DashboardMetricItem from "./DashboardMetricItem";
import DashboardTipCard from "./DashboardTipCard";
import DashboardButton from "./DashboardButton";
import { IconBriefcase, IconChevronStart } from "./icons/DashboardIcons";

export default function DashboardWelcomeHero({
  metrics = [],
  tip,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
}) {
  const { t } = useTranslation();

  const resolvedTitle = title ?? t("freelancerDashboard.hero.title");
  const resolvedSubtitle = subtitle ?? t("freelancerDashboard.hero.subtitle");
  const resolvedPrimaryCta = {
    to: primaryCta?.to ?? "/dashboard/freelancer/orders",
    label: primaryCta?.label ?? t("freelancerDashboard.hero.browseOrders"),
  };
  const resolvedSecondaryCta = {
    to: secondaryCta?.to ?? "/dashboard/freelancer/my-orders",
    label: secondaryCta?.label ?? t("freelancerDashboard.hero.myOrders"),
  };

  return (
    <section className="fdash-welcome fdash-surface-3d" aria-label={t("freelancerDashboard.hero.ariaLabel")}>
      <div className="fdash-welcome__hero">
        <div className="fdash-welcome__content">
          <h2 className="fdash-welcome__title">{resolvedTitle}</h2>
          <p className="fdash-welcome__subtitle">{resolvedSubtitle}</p>
        </div>
        <div className="fdash-welcome__illustration" aria-hidden>
          <DashboardIllustration />
        </div>
      </div>

      <div className="fdash-welcome__panel fdash-surface-inset">
        {tip ? (
          <div className="fdash-welcome__aside">
            <DashboardTipCard {...tip} embedded />
          </div>
        ) : null}

        <div className="fdash-welcome__main">
          <div className="fdash-welcome__metrics" role="list" aria-label={t("freelancerDashboard.hero.metricsAria")}>
            {metrics.map((m) => (
              <DashboardMetricItem key={m.id} {...m} inline />
            ))}
          </div>
          <div className="fdash-welcome__actions">
            <DashboardButton to={resolvedPrimaryCta.to} variant="primary" icon={IconBriefcase}>
              {resolvedPrimaryCta.label}
            </DashboardButton>
            <DashboardButton to={resolvedSecondaryCta.to} variant="secondary" icon={IconChevronStart} iconEnd>
              {resolvedSecondaryCta.label}
            </DashboardButton>
          </div>
        </div>
      </div>
    </section>
  );
}
