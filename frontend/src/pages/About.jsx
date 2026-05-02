import { createElement, useEffect, useRef, useState } from "react";

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
      { threshold: options.threshold ?? 0.12, rootMargin: options.rootMargin ?? "0px 0px -32px 0px" }
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

const CORE_VALUES = [
  {
    title: "التميز في الخدمة",
    body: "نسعى لتحقيق أعلى معايير الجودة في كل مشروع وتقديم نتائج تفوق التوقعات.",
    Icon: IconStar,
  },
  {
    title: "الشفافية والثقة",
    body: "نبني علاقات طويلة الأمد من خلال التواصل الصادق والشراكات الموثوقة.",
    Icon: IconShield,
  },
  {
    title: "تمكين الابتكار",
    body: "نعزز الإبداع ونقدم حلولًا متقدمة تدعم نمو الأعمال.",
    Icon: IconSpark,
  },
  {
    title: "التقنية المتمحورة حول الإنسان",
    body: "نستخدم التقنية لخدمة الإنسان أولًا، وليس العكس.",
    Icon: IconHuman,
  },
];

const WORK_STEPS = [
  {
    title: "اشتراك المستقل",
    text: "قم بإنشاء حسابك وملفك الشخصي لعرض مهاراتك.",
  },
  {
    title: "الحصول على عمل",
    text: "تصفح المشاريع المناسبة لك وقدم عروضك.",
  },
  {
    title: "تنفيذ المشروع",
    text: "أنجز العمل بجودة عالية وفي الوقت المحدد.",
  },
  {
    title: "استلام الأرباح",
    text: "احصل على مستحقاتك بأمان بعد موافقة العميل.",
  },
];

function RevealSection({ children, className = "" }) {
  const [ref, visible] = useReveal();
  return (
    <section ref={ref} className={`about-reveal ${visible ? "about-reveal--visible" : ""} ${className}`.trim()}>
      {children}
    </section>
  );
}

const About = () => {
  return (
    <main className="about-page page-content" lang="ar" dir="rtl">
      <div className="about-page__inner">
        <RevealSection>
          <header className="about-hero">
            <h1 className="about-hero__title">
              حول <span className="about-hero__brand">أوردرز هاوس</span>
            </h1>
            <p className="about-hero__lead">
              <span className="about-hero__brand">أوردرز هاوس</span> هي منصتك الأولى للنجاح في العمل الحر. نُسهّل على
              المستقلين الموهوبين العثور على مشاريع مميزة، ونساعد الشركات على توظيف الأشخاص المناسبين. نحن الجسر الذي
              يربط بين المهارات والفرص، لنصنع تجربة عمل أكثر سهولة ونجاحًا للجميع.
            </p>
          </header>
        </RevealSection>

        <RevealSection>
          <div className="about-mv">
            <article className="about-mv-card">
              <div className="about-mv-card__icon" aria-hidden>
                <IconVision />
              </div>
              <div className="about-mv-card__body">
                <h2 className="about-mv-card__h">رؤيتنا</h2>
                <p className="about-mv-card__p">
                  أن نكون الرواد عالميًا في ابتكار العمل الحر، ونقود مستقبل العمل عن بُعد، ونبني عالمًا بلا حدود
                  للمواهب.
                </p>
                <span className="about-mv-card__tag">مدفوعون بالابتكار</span>
              </div>
            </article>
            <article className="about-mv-card">
              <div className="about-mv-card__icon" aria-hidden>
                <IconMission />
              </div>
              <div className="about-mv-card__body">
                <h2 className="about-mv-card__h">مهمتنا</h2>
                <p className="about-mv-card__p">
                  تمكين المستقلين والشركات من خلال تعاون ذكي، آمن، وسلس يحقق النجاح ويعزز الابتكار عالميًا.
                </p>
                <span className="about-mv-card__tag">نركز على التميز</span>
              </div>
            </article>
          </div>
        </RevealSection>

        <RevealSection>
          <div className="about-section-head">
            <h2 className="about-section-head__title">قيمنا الأساسية</h2>
            <p className="about-section-head__subtitle">
              المبادئ التي توجه كل ما نقوم به وتعكس التزامنا بالتميز.
            </p>
          </div>
          <div className="about-values__grid">
            {CORE_VALUES.map(({ title, body, Icon }) => (
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
            <h2 className="about-section-head__title">كيف نعمل</h2>
            <p className="about-section-head__subtitle">
              عملية بسيطة من 4 خطوات تربط بين المواهب والفرص بسلاسة.
            </p>
          </div>
          <ol className="about-steps" aria-label="خطوات العمل">
            {WORK_STEPS.map((step, i) => {
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
