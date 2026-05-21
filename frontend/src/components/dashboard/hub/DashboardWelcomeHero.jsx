import DashboardIllustration from "./DashboardIllustration";
import DashboardMetricItem from "./DashboardMetricItem";
import DashboardTipCard from "./DashboardTipCard";
import DashboardButton from "./DashboardButton";
import { IconBriefcase, IconChevronStart } from "./icons/DashboardIcons";

export default function DashboardWelcomeHero({
  metrics = [],
  tip,
  title = "أهلاً بك في لوحة التحكم",
  subtitle = "منصة متكاملة لإدارة عملك الحر، متابعة طلباتك، وتطوير مهاراتك وزيادة دخلك.",
  primaryCta = { to: "/dashboard/freelancer/orders", label: "تصفح الطلبات المتاحة" },
  secondaryCta = { to: "/dashboard/freelancer/my-orders", label: "استعراض طلباتي" },
}) {
  return (
    <section className="fdash-welcome fdash-surface-3d" aria-label="مرحباً بك في لوحة التحكم">
      <div className="fdash-welcome__hero">
        <div className="fdash-welcome__content">
          <h2 className="fdash-welcome__title">{title}</h2>
          <p className="fdash-welcome__subtitle">{subtitle}</p>
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
          <div className="fdash-welcome__metrics" role="list" aria-label="ملخص سريع">
            {metrics.map((m) => (
              <DashboardMetricItem key={m.id} {...m} inline />
            ))}
          </div>
          <div className="fdash-welcome__actions">
            <DashboardButton to={primaryCta.to} variant="primary" icon={IconBriefcase}>
              {primaryCta.label}
            </DashboardButton>
            <DashboardButton to={secondaryCta.to} variant="secondary" icon={IconChevronStart} iconEnd>
              {secondaryCta.label}
            </DashboardButton>
          </div>
        </div>
      </div>
    </section>
  );
}
