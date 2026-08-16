import { useEffect, useState } from "react";
import { getOnboardingGettingStartedRequest } from "../../services/api";
import { CTA_CLASS } from "./FreelancerOnboardingPanel";

const FALLBACK = {
  mini_bid_intro:
    "Mini Bid هي فرصة عمل صغيرة أو محددة تستطيع التقديم عليها باستخدام إحدى المناقصات المتاحة ضمن اشتراكك. بعد التقديم يتم تقييم المتقدمين، وإذا تم اختيارك ينتقل الطلب إلى حسابك للتنفيذ والتسليم.",
  article_mini_bid_intro:
    "Mini Bid Article هي فرصة لكتابة مقال وفق عنوان وشروط وعدد كلمات ومتطلبات محددة. تستخدم مناقصة للتقديم، وإذا تم اختيارك تقوم بكتابة المقال وتسليمه من خلال المنصة، ثم يخضع للتدقيق والمراجعة قبل اعتماده وإضافة مستحقاته إلى حسابك.",
};

export default function OpportunityHelpTrigger({ conditionKey, label = "ما هذا؟" }) {
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

  const title = item?.title || (conditionKey === "article_mini_bid_intro" ? "ما هو Mini Bid Article؟" : "ما هو Mini Bid؟");
  const body = item?.body || FALLBACK[conditionKey] || FALLBACK.mini_bid_intro;

  return (
    <>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-[0.35rem] border-0 bg-transparent text-[0.86rem] font-bold text-[var(--dash-primary,#2f3b65)]"
        onClick={() => setOpen(true)}
      >
        {label}
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
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-[min(32rem,100%)] rounded-2xl bg-[var(--dash-card,#fff)] p-[1.2rem] leading-[1.7]">
            <h2 id="oh-help-title">{title}</h2>
            <p>{body}</p>
            <button type="button" className={CTA_CLASS} onClick={() => setOpen(false)}>
              حسنًا
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
