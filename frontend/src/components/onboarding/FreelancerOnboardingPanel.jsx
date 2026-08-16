import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { postOnboardingEventRequest } from "../../services/api";

const CTA_CLASS =
  "inline-flex min-h-10 items-center rounded-[10px] bg-[var(--dash-primary,#2f3b65)] px-3.5 font-bold text-white no-underline";
const LINK_CLASS =
  "cursor-pointer border-0 bg-transparent text-[0.92rem] font-bold text-[var(--dash-primary,#2f3b65)] no-underline";
const MUTED_CLASS = "mb-[0.35rem] text-[0.82rem] font-bold text-[var(--dash-text-secondary,#5a6378)]";

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
      className={`mb-4 rounded-2xl border border-[color:rgb(23_32_51/0.08)] bg-[var(--dash-card,#fff)] shadow-[0_8px_24px_rgb(23_32_51/0.06)] ${
        compact ? "px-4 py-3.5" : "px-[1.2rem] py-[1.1rem]"
      }`}
      aria-labelledby="oh-onboard-title"
    >
      <p className={MUTED_CLASS}>{payload.accountStatusLabel}</p>
      {payload.progress?.label ? <p className={MUTED_CLASS}>{payload.progress.label}</p> : null}
      <h2 id="oh-onboard-title" className="mb-[0.45rem] text-[1.15rem] text-[var(--dash-text,#172033)]">
        {item.title}
      </h2>
      <p className="mb-[0.9rem] leading-[1.7] text-[var(--dash-text-secondary,#3d4558)]">{body}</p>
      <div className="flex flex-wrap items-center gap-[0.6rem]">
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
