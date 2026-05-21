import { Link } from "react-router-dom";
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
  const eligible = Boolean(eligibility?.eligible);
  const freePlan = isOrderzhouseFreePlan(subscription?.planId ?? subscription?.plan);
  const planLabel = subscription?.plan?.title || subscription?.plan?.name || "—";

  const chips = [];
  if (planLabel && planLabel !== "—") {
    chips.push({ key: "plan", label: planLabel, className: "fdash-cc-chip--plan" });
  }
  chips.push({
    key: "elig",
    label: eligible ? (freePlan ? "تدريب + معرض محدود" : "مؤهل للمعرض") : "غير مؤهل حالياً",
    className: eligible ? "fdash-cc-chip--success" : "fdash-cc-chip--warning",
  });
  if (subscription?.status) {
    const st = String(subscription.status);
    if (st === "active") chips.push({ key: "st", label: "اشتراك نشط", className: "fdash-cc-chip--success" });
    else if (st === "assigned_not_started") {
      chips.push({ key: "st", label: "بانتظار أول طلب", className: "fdash-cc-chip--info" });
    } else if (st === "expired") {
      chips.push({ key: "st", label: "منتهي", className: "fdash-cc-chip--danger" });
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
        {welcomeName ? <span className="fdash-hero__badge">مرحباً، {welcomeName}</span> : null}
        <h1 className="fdash-hero__title">{headline?.headline || "مركز التحكم"}</h1>
        <p className="fdash-hero__subtitle">{subline || headline?.sub || "نظرة شاملة على عملك واشتراكك وطلباتك."}</p>
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
