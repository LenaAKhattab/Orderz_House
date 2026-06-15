import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { isOrderzhouseFreePlan } from "../../../../constants/orderzhousePlansCatalog";

export default function FreelancerStatusHero({
  welcomeName,
  subscription,
  eligibility,
  headline,
  subline,
  cta,
  secondaryCta,
}) {
  const { t } = useTranslation();
  const eligible = Boolean(eligibility?.eligible);
  const freePlan = isOrderzhouseFreePlan(subscription?.planId ?? subscription?.plan);
  const planLabel = subscription?.plan?.title || subscription?.plan?.name || t("freelancerDashboard.common.emDash");

  const chips = [];
  if (planLabel && planLabel !== t("freelancerDashboard.common.emDash")) {
    chips.push({ key: "plan", label: planLabel, className: "fdash-cc-chip--plan" });
  }
  chips.push({
    key: "elig",
    label: eligible
      ? freePlan
        ? t("freelancerDashboard.statusHero.chips.trainingLimited")
        : t("freelancerDashboard.statusHero.chips.eligible")
      : t("freelancerDashboard.statusHero.chips.notEligible"),
    className: eligible ? "fdash-cc-chip--success" : "fdash-cc-chip--warning",
  });
  if (subscription?.status) {
    const st = String(subscription.status);
    if (st === "active") {
      chips.push({
        key: "st",
        label: t("freelancerDashboard.statusHero.chips.activeSubscription"),
        className: "fdash-cc-chip--success",
      });
    } else if (st === "assigned_not_started") {
      chips.push({
        key: "st",
        label: t("freelancerDashboard.statusHero.chips.waitingFirstOrder"),
        className: "fdash-cc-chip--info",
      });
    } else if (st === "expired") {
      chips.push({
        key: "st",
        label: t("freelancerDashboard.statusHero.chips.expired"),
        className: "fdash-cc-chip--danger",
      });
    }
  }

  return (
    <header className="fdash-hero fdash-hero--status">
      <div className="fdash-hero__glow fdash-hero__glow--a" aria-hidden />
      <div className="fdash-hero__glow fdash-hero__glow--b" aria-hidden />
      <div className="fdash-hero__art" aria-hidden>
        <span className="fdash-hero__glyph fdash-hero__glyph--a">📊</span>
        <span className="fdash-hero__glyph fdash-hero__glyph--b">✦</span>
      </div>
      <div className="fdash-hero__copy">
        {welcomeName ? (
          <span className="fdash-hero__badge">
            {t("freelancerDashboard.statusHero.welcome", { name: welcomeName })}
          </span>
        ) : null}
        <h1 className="fdash-hero__title">{headline?.headline || t("freelancerDashboard.statusHero.title")}</h1>
        <p className="fdash-hero__subtitle">
          {subline || headline?.sub || t("freelancerDashboard.statusHero.subtitle")}
        </p>
        {chips.length > 0 ? (
          <div className="fdash-cc-hero__chips" role="list">
            {chips.map((c) => (
              <span key={c.key} className={`fdash-cc-chip ${c.className}`} role="listitem">
                {c.label}
              </span>
            ))}
          </div>
        ) : null}
        {cta || secondaryCta ? (
          <div className="fdash-cc-hero__actions">
            {cta ? (
              <Link to={cta.to} className="fdash-cc-btn fdash-cc-btn--light">
                {cta.label}
              </Link>
            ) : null}
            {secondaryCta ? (
              <Link to={secondaryCta.to} className="fdash-cc-btn fdash-cc-btn--ghost">
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
