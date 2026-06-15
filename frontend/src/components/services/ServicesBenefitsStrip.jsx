import { useTranslation } from "../../i18n/LanguageProvider";

function BenefitIcon({ type }) {
  if (type === "shield") {
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
  if (type === "briefcase") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (type === "chat") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h4a8 8 0 0 1 8 8Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function ServicesBenefitsStrip() {
  const { t } = useTranslation();
  const benefits = [
    { title: t("services.benefits.qualityTitle"), desc: t("services.benefits.qualityDesc"), icon: "shield" },
    { title: t("services.benefits.executionTitle"), desc: t("services.benefits.executionDesc"), icon: "briefcase" },
    { title: t("services.benefits.communicationTitle"), desc: t("services.benefits.communicationDesc"), icon: "chat" },
    { title: t("services.benefits.paymentTitle"), desc: t("services.benefits.paymentDesc"), icon: "card" },
  ];

  return (
    <section className="services-ref-benefits" aria-label={t("services.benefitsAria")}>
      <div className="services-ref-benefits__inner">
        {benefits.map((item) => (
          <div key={item.title} className="services-ref-benefits__item">
            <span className="services-ref-benefits__icon" aria-hidden>
              <BenefitIcon type={item.icon} />
            </span>
            <div>
              <strong className="services-ref-benefits__title">{item.title}</strong>
              <p className="services-ref-benefits__desc">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
