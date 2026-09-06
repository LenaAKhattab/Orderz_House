import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { postOnboardingEventRequest } from "../../services/api";

const CTA_CLASS =
  "inline-flex min-h-8 items-center rounded-[8px] bg-[var(--dash-primary,#2f3b65)] px-3 text-[0.74rem] font-bold text-white no-underline";
const LINK_CLASS =
  "cursor-pointer border-0 bg-transparent text-[0.74rem] font-bold text-[var(--dash-primary,#2f3b65)] no-underline";
const MUTED_CLASS = "mb-[0.2rem] text-[0.68rem] font-bold text-[var(--dash-text-secondary,#5a6378)]";

export default function FreelancerOnboardingPanel({ payload }) {
  const viewedRef = useRef(false);
  const item = payload?.currentItem;
  const show = Boolean(payload?.showPanel && item);

  useEffect(() => {
    if (!show || viewedRef.current || !item?.id) return;
    viewedRef.current = true;
    void postOnboardingEventRequest({ itemId: item.id, eventType: "viewed" }).catch(() => {});
  }, [show, item?.id]);

  if (!show) return null;

  const compact = Boolean(item.compact);
  const body = compact && item.compactBody ? item.compactBody : item.body;
  const ctaTo = item.ctaUrl || "/dashboard/freelancer/getting-started";

  const onCta = () => {
    void postOnboardingEventRequest({ itemId: item.id, eventType: "clicked_cta" }).catch(() => {});
    if (item.key === "welcome") {
      void postOnboardingEventRequest({ itemId: item.id, eventType: "completed" }).catch(() => {});
    }
  };

  const onDismiss = () => {
    void postOnboardingEventRequest({ itemId: item.id, eventType: "dismissed" }).catch(() => {});
  };

  return (
    <section
      className={`mb-3 rounded-xl border border-[color:rgb(23_32_51/0.08)] bg-[var(--dash-card,#fff)] shadow-[0_6px_18px_rgb(23_32_51/0.05)] ${
        compact ? "px-3 py-2.5" : "px-3.5 py-3"
      }`}
      aria-labelledby="oh-onboard-title"
    >
      <p className={MUTED_CLASS}>{payload.accountStatusLabel}</p>
      {payload.progress?.label ? <p className={MUTED_CLASS}>{payload.progress.label}</p> : null}
      <h2 id="oh-onboard-title" className="mb-[0.3rem] text-[0.92rem] font-extrabold text-[var(--dash-text,#172033)]">
        {item.title}
      </h2>
      <p className="mb-2.5 text-[0.74rem] leading-[1.55] text-[var(--dash-text-secondary,#3d4558)]">{body}</p>
      <div className="flex flex-wrap items-center gap-2">
        {item.ctaLabel ? (
          <Link to={ctaTo} className={CTA_CLASS} onClick={onCta}>
            {compact && item.conditionKey === "training_incomplete" ? "أكمل الآن" : item.ctaLabel}
          </Link>
        ) : null}
        <Link to="/dashboard/freelancer/getting-started" className={LINK_CLASS}>
          مركز البداية
        </Link>
        {item.isDismissible ? (
          <button type="button" className={LINK_CLASS} onClick={onDismiss}>
            تذكير لاحقًا
          </button>
        ) : null}
      </div>
    </section>
  );
}

export { CTA_CLASS };
