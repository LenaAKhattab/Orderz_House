import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getOnboardingGettingStartedRequest } from "../../services/api";
import { CTA_CLASS } from "./FreelancerOnboardingPanel";

export default function OpportunityHelpTrigger({ conditionKey, label }) {
  const { t } = useTranslation();
  const oh = "orders.opportunityHelp";
  const resolvedLabel = label ?? t(`${oh}.defaultLabel`);
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getOnboardingGettingStartedRequest()
      .then((res) => {
        if (cancelled) return;
        const items = res?.data?.items || [];
        const found = items.find((row) => row.conditionKey === conditionKey || row.key === conditionKey);
        setItem(found || null);
      })
      .catch(() => {
        if (!cancelled) setItem(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conditionKey]);

  const title =
    item?.title ||
    (conditionKey === "article_mini_bid_intro" ? t(`${oh}.articleMiniBidTitle`) : t(`${oh}.miniBidTitle`));
  const body =
    item?.body ||
    (conditionKey === "article_mini_bid_intro" ? t(`${oh}.articleMiniBidFallback`) : t(`${oh}.miniBidFallback`));

  return (
    <>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-[0.3rem] border-0 bg-transparent text-[0.72rem] font-bold text-[var(--dash-primary,#2f3b65)]"
        onClick={() => setOpen(true)}
      >
        {resolvedLabel}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[var(--oh-z-overlay,1100)] grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oh-help-title"
        >
          <button
            type="button"
            className="absolute inset-0 border-0 bg-[rgb(17_24_39/0.45)]"
            aria-label={t(`${oh}.close`)}
            onClick={() => setOpen(false)}
          />
          <div className="relative w-[min(32rem,100%)] rounded-2xl bg-[var(--dash-card,#fff)] p-[1.2rem] leading-[1.7]">
            <h2 id="oh-help-title">{title}</h2>
            <p>{body}</p>
            <button type="button" className={CTA_CLASS} onClick={() => setOpen(false)}>
              {t(`${oh}.ok`)}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
