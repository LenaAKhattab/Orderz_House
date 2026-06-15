import { Link } from "react-router-dom";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { resolveFreelancerDashboardItem } from "../../../lib/i18n/resolveFreelancerDashboardItem";
import DashboardBannerIllustration from "./DashboardBannerIllustration";
import { IconBell } from "./icons/DashboardIcons";

function BannerShell({ variant, title, subtitle, children, titleId = "fdash-banner-title" }) {
  return (
    <section
      className={`fdash-banner fdash-banner--${variant} fdash-surface-3d fdash-surface-3d--thin`}
      aria-labelledby={titleId}
    >
      <div className="fdash-banner__illustration" aria-hidden>
        <DashboardBannerIllustration />
      </div>

      <div className="fdash-banner__content">
        <h2 id={titleId} className="fdash-banner__title">
          {title}
        </h2>
        <p className="fdash-banner__subtitle">{subtitle}</p>
        {children}
      </div>

      <span className="fdash-banner__icon fdash-banner__icon--status" aria-hidden>
        <IconBell />
      </span>
    </section>
  );
}

export default function DashboardActionBanner({ actions = [] }) {
  const { t, locale } = useTranslation();

  if (!actions.length) {
    return (
      <BannerShell
        variant="clear"
        title={t("freelancerDashboard.actions.noUrgentTitle")}
        subtitle={t("freelancerDashboard.actions.noUrgentSubtitle")}
      />
    );
  }

  const top = actions[0];
  const more = actions.length - 1;
  const topTitle = resolveFreelancerDashboardItem(top, "title", t, locale);
  const topDescription = resolveFreelancerDashboardItem(top, "description", t, locale);
  const topCta = resolveFreelancerDashboardItem(top, "cta", t, locale) || t("freelancerDashboard.actions.continue");
  const topSecondaryCta =
    resolveFreelancerDashboardItem(top, "secondaryCta", t, locale) || t("freelancerDashboard.actions.viewCourse");

  return (
    <BannerShell
      variant={top.isActivationBanner ? "activation" : "alert"}
      title={topTitle}
      subtitle={
        <>
          {topDescription}
          {more > 0 ? ` ${t("freelancerDashboard.actions.moreCount", { count: more })}` : ""}
        </>
      }
    >
      {top.to || top.secondaryTo ? (
        <div className="fdash-banner__actions">
          {top.to ? (
            <Link
              to={top.to}
              className={`fdash-banner__cta${top.isActivationBanner ? " fdash-banner__cta--primary" : ""}`}
            >
              {topCta}
            </Link>
          ) : null}
          {top.secondaryTo ? (
            <Link to={top.secondaryTo} className="fdash-banner__cta fdash-banner__cta--secondary">
              {topSecondaryCta}
            </Link>
          ) : null}
        </div>
      ) : null}
    </BannerShell>
  );
}
