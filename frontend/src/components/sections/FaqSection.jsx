import { useState } from "react";

import { FAQ_SCROLL_THRESHOLD, usePublicFaq } from "../../hooks/usePublicFaq";

import { useTranslation } from "../../i18n/LanguageProvider";

import { getFaqLocalizedText } from "../../lib/i18n/getFaqLocalizedText";

import FaqSkeleton from "../skeletons/FaqSkeleton";

import "./home-faq-scroll.css";

function Chevron({ open }) {
  return (
    <span
      className={`shrink-0 text-violet-600 transition-transform duration-200 ${open ? "-rotate-180" : ""}`}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function FaqAccordionItem({ item, open, onToggle, locale, t, index, isRtl }) {
  const question = getFaqLocalizedText(item, "question", locale, t, index);
  const answer = getFaqLocalizedText(item, "answer", locale, t, index);
  const panelId = `faq-panel-${item.id}`;
  const buttonId = `faq-trigger-${item.id}`;

  return (
    <li>
      <button
        id={buttonId}
        type="button"
        className={[
          "flex w-full items-center gap-3 px-1 py-4 text-start transition-colors sm:gap-4 sm:px-0 sm:py-[1.15rem]",
          isRtl ? "flex-row-reverse" : "",
          open ? "bg-violet-50/85 hover:bg-violet-50/90" : "bg-transparent hover:bg-slate-100/60",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1 text-[0.95rem] font-semibold leading-relaxed text-[#1e293b] sm:text-base">
          {question}
        </span>
        <Chevron open={open} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="border-t border-slate-200/70 bg-violet-50/40"
      >
        <p className="m-0 px-1 pb-5 pt-3.5 text-start text-[0.9rem] leading-[1.75] text-slate-600 sm:px-0 sm:text-[0.95rem]">
          {answer}
        </p>
      </div>
    </li>
  );
}

const FaqSection = () => {
  const { items, loading } = usePublicFaq();
  const [openId, setOpenId] = useState(null);
  const { t, dir, locale, isRtl } = useTranslation();

  const toggle = (id) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return <FaqSkeleton />;
  }

  const scrollable = items.length > FAQ_SCROLL_THRESHOLD;
  const textColumnOrder = isRtl ? "md:order-2" : "md:order-1";
  const imageColumnOrder = isRtl ? "md:order-1" : "md:order-2";

  return (
    <section
      className="relative w-full border-t border-slate-200/60 px-4 py-12 sm:px-6 sm:py-14 md:px-8 md:py-16 lg:px-10"
      aria-labelledby="home-faq-heading"
      dir={dir}
    >
      <div className="mx-auto w-full max-w-6xl pb-2">
        <div
          dir="ltr"
          className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8 lg:gap-10"
        >
          <div className={`min-w-0 ${textColumnOrder}`} dir={dir}>
            <header className="mb-6 text-start sm:mb-8">
              <h2
                id="home-faq-heading"
                className="m-0 text-[clamp(1.45rem,3.2vw,1.9rem)] font-extrabold leading-tight tracking-tight text-[#1e293b]"
              >
                {t("home.faq.title")}
              </h2>
              <p className="mt-2.5 mb-0 max-w-xl text-[0.92rem] leading-relaxed text-slate-600 sm:text-[0.95rem]">
                {t("home.faq.subtitle")}
              </p>
            </header>

            {items.length === 0 ? (
              <p className="m-0 text-start text-[0.95rem] leading-relaxed text-slate-500">
                {t("common.empty.faq")}
              </p>
            ) : (
              <ul
                className={[
                  "m-0 min-w-0 list-none divide-y divide-slate-200/80 p-0",
                  scrollable ? "home-faq-list--scroll" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="list"
              >
                {items.map((item, index) => (
                  <FaqAccordionItem
                    key={item.id}
                    item={item}
                    open={openId === item.id}
                    onToggle={() => toggle(item.id)}
                    locale={locale}
                    t={t}
                    index={index}
                    isRtl={isRtl}
                  />
                ))}
              </ul>
            )}
          </div>

          <div
            className={[
              "flex shrink-0 items-start justify-center",
              imageColumnOrder,
              isRtl ? "md:justify-start" : "md:justify-end",
            ].join(" ")}
            aria-hidden
          >
            <img
              src="/home-faq-side-accent.png"
              alt=""
              width={256}
              height={256}
              loading="lazy"
              decoding="async"
              className="pointer-events-none h-[clamp(9rem,28vw,16rem)] w-[clamp(9rem,28vw,16rem)] max-w-full object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
