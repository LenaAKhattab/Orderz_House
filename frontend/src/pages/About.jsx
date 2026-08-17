import { createElement, useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import PublicPageHeader from "../components/layout/PublicPageHeader";
import "../styles/aboutPage.css";

function useReveal(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (visible) return undefined;

    const el = ref.current;
    if (!el) return undefined;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: options.threshold ?? 0.12, rootMargin: options.rootMargin ?? "0px 0px -32px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, options.threshold, options.rootMargin]);

  return [ref, visible];
}

function IconVision() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5C7 5 3.5 9 2 12c1.5 3 5 7 10 7s8.5-4 10-7c-1.5-3-5-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconMission() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5l2.8 6.9 7.4.6-5.6 4.8 1.7 7.2L12 17.9 6.7 22l1.7-7.2-5.6-4.8 7.4-.6L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s8-4 8-10V6l-8-3-8 3v5c0 6 8 10 8 10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconHuman() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6.5 20.5c.8-3.2 3.2-5 5.5-5s4.7 1.8 5.5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RevealSection({ children, className = "" }) {
  const [ref, visible] = useReveal();
  return (
    <section ref={ref} className={`about-reveal ${visible ? "about-reveal--visible" : ""} ${className}`.trim()}>
      {children}
    </section>
  );
}

const About = () => {
  const { t, dir } = useTranslation();

  const coreValues = [
    { title: t("about.values.excellence.title"), body: t("about.values.excellence.body"), Icon: IconStar },
    { title: t("about.values.trust.title"), body: t("about.values.trust.body"), Icon: IconShield },
    { title: t("about.values.innovation.title"), body: t("about.values.innovation.body"), Icon: IconSpark },
    { title: t("about.values.human.title"), body: t("about.values.human.body"), Icon: IconHuman },
  ];

  const workSteps = [
    { title: t("about.howWeWork.step1.title"), text: t("about.howWeWork.step1.text") },
    { title: t("about.howWeWork.step2.title"), text: t("about.howWeWork.step2.text") },
    { title: t("about.howWeWork.step3.title"), text: t("about.howWeWork.step3.text") },
    { title: t("about.howWeWork.step4.title"), text: t("about.howWeWork.step4.text") },
  ];

  return (
    <main className="about-page page-content" lang={dir === "rtl" ? "ar" : "en"} dir={dir}>
      <div className="about-page__inner">
        <RevealSection>
          <PublicPageHeader
            title={t("about.hero.title")}
            subtitle={t("about.hero.subtitle")}
          />
        </RevealSection>

        <RevealSection>
          <div className="about-mv">
            <article className="about-mv-card">
              <div className="about-mv-card__icon" aria-hidden>
                <IconVision />
              </div>
              <div className="about-mv-card__body">
                <h2 className="about-mv-card__h">{t("about.vision.title")}</h2>
                <p className="about-mv-card__p">{t("about.vision.text")}</p>
                <span className="about-mv-card__tag">{t("about.vision.tag")}</span>
              </div>
            </article>
            <article className="about-mv-card">
              <div className="about-mv-card__icon" aria-hidden>
                <IconMission />
              </div>
              <div className="about-mv-card__body">
                <h2 className="about-mv-card__h">{t("about.mission.title")}</h2>
                <p className="about-mv-card__p">{t("about.mission.text")}</p>
                <span className="about-mv-card__tag">{t("about.mission.tag")}</span>
              </div>
            </article>
          </div>
        </RevealSection>

        <RevealSection>
          <div className="about-section-head">
            <h2 className="about-section-head__title">{t("about.values.title")}</h2>
            <p className="about-section-head__subtitle">{t("about.values.subtitle")}</p>
          </div>
          <div className="about-values__grid">
            {coreValues.map(({ title, body, Icon }) => (
              <article key={title} className="about-value-card">
                <div className="about-value-card__icon" aria-hidden>
                  {createElement(Icon)}
                </div>
                <h3 className="about-value-card__h">{title}</h3>
                <p className="about-value-card__p">{body}</p>
              </article>
            ))}
          </div>
        </RevealSection>

        <RevealSection>
          <div className="about-section-head">
            <h2 className="about-section-head__title">{t("about.howWeWork.title")}</h2>
            <p className="about-section-head__subtitle">{t("about.howWeWork.subtitle")}</p>
          </div>
          <ol className="about-steps" aria-label={t("about.howWeWork.stepsAria")}>
            {workSteps.map((step, i) => {
              const n = i + 1;
              return (
                <li key={step.title} className="about-steps__seg">
                  <div className="about-steps__inner">
                    <span className="about-steps__num" aria-hidden="true">
                      {n}
                    </span>
                    <div className="about-steps__copy">
                      <h3 className="about-steps__title">{step.title}</h3>
                      <p className="about-steps__text">{step.text}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </RevealSection>
      </div>
    </main>
  );
};

export default About;
