import { Link } from "react-router-dom";
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
  if (!actions.length) {
    return (
      <BannerShell
        variant="clear"
        title="لا توجد إجراءات عاجلة حالياً"
        subtitle="أنت على اطلاع بجميع طلباتك وإشعاراتك."
      />
    );
  }

  const top = actions[0];
  const more = actions.length - 1;

  return (
    <BannerShell
      variant={top.isActivationBanner ? "activation" : "alert"}
      title={top.title}
      subtitle={
        <>
          {top.description}
          {more > 0 ? ` (+${more} أخرى)` : ""}
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
              {top.cta || "متابعة"}
            </Link>
          ) : null}
          {top.secondaryTo ? (
            <Link to={top.secondaryTo} className="fdash-banner__cta fdash-banner__cta--secondary">
              {top.secondaryCta || "عرض الدورة"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </BannerShell>
  );
}
