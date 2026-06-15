import { useState } from "react";
import { Link } from "react-router-dom";
import { FAQ_SCROLL_THRESHOLD, usePublicFaq } from "../../../hooks/usePublicFaq";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { getFaqLocalizedText } from "../../../lib/i18n/getFaqLocalizedText";
import "../home-faq-scroll.css";

function Chevron({ open }) {
  return (
    <svg
      className={`hm-faq__chevron${open ? " hm-faq__chevron--open" : ""}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mobile-only FAQ — quote card + menu-style accordion list. */
export default function HomeMobileFaq() {
  const { t, dir, locale } = useTranslation();
  const { items, loading } = usePublicFaq();
  const [openId, setOpenId] = useState(null);

  const toggle = (id) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  const scrollable = items.length > FAQ_SCROLL_THRESHOLD;

  return (
    <section className="hm-faq" dir={dir} aria-labelledby="hm-faq-heading">
      <div className="hm-faq__inner">
        <header className="hm-faq__head">
          <h2 id="hm-faq-heading" className="hm-faq__title">
            {t("home.faq.title")}
          </h2>
          <p className="hm-faq__subtitle">{t("home.faq.subtitle")}</p>
        </header>

        <div className="hm-faq__quote">
          <p className="hm-faq__quote-label">{t("home.faq.whyBrand")}</p>
          <p className="hm-faq__quote-text">{t("home.faq.mobilePromoText")}</p>
          <Link to="/register" className="hm-faq__quote-cta">
            {t("home.faq.cta")}
          </Link>
        </div>

        <div className="hm-faq__menu">
          {loading ? (
            <ul className="hm-faq__list" role="list" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="hm-faq__item">
                  <div className="hm-faq__trigger hm-faq__trigger--skeleton">
                    <span className="hm-faq__question hm-faq__question--skeleton" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <p className="hm-faq__empty">{t("common.empty.faq")}</p>
          ) : (
            <ul
              className={["hm-faq__list", scrollable ? "hm-faq__list--scroll home-faq-list--scroll" : ""]
                .filter(Boolean)
                .join(" ")}
              role="list"
            >
              {items.map((item, index) => {
                const open = openId === item.id;
                const panelId = `hm-faq-panel-${item.id}`;
                const buttonId = `hm-faq-trigger-${item.id}`;
                const question = getFaqLocalizedText(item, "question", locale, t, index);
                const answer = getFaqLocalizedText(item, "answer", locale, t, index);

                return (
                  <li key={item.id} className="hm-faq__item">
                    <button
                      id={buttonId}
                      type="button"
                      className="hm-faq__trigger"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggle(item.id)}
                    >
                      <span className="hm-faq__question">{question}</span>
                      <span className="hm-faq__chevron-wrap" aria-hidden>
                        <Chevron open={open} />
                      </span>
                    </button>
                    <div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      hidden={!open}
                      className="hm-faq__panel"
                    >
                      <p className="hm-faq__answer">{answer}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
