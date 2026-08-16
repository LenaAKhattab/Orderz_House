import { Award, BookOpen, Briefcase, Check, GraduationCap, MessageCircle } from "lucide-react";
import { buildTrainingWhatsAppUrl } from "../../constants/trainingPlansCatalog";
import { ApproximateCurrencyLine } from "../money/JodMoneyDisplay";

function featureIcon(text) {
  const value = String(text || "");
  if (/شهادة|شهادات|certificate/i.test(value)) return Award;
  if (/عضوية|Membership|SILVER/i.test(value)) return Briefcase;
  if (/مشروع|مشاريع|practical|projects/i.test(value)) return GraduationCap;
  return BookOpen;
}

/**
 * Single Training package card with WhatsApp CTA.
 */
export default function TrainingPlanCard({ pkg, locale = "ar", t }) {
  const isEn = locale === "en";
  const name = isEn ? pkg.nameEn : pkg.nameAr;
  const shortDesc = isEn ? pkg.shortDescEn : pkg.shortDescAr;
  const features = isEn ? pkg.featuresEn : pkg.featuresAr;
  const href = buildTrainingWhatsAppUrl(pkg);
  const priceLabel = Number(pkg.priceJod).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const badge = isEn ? pkg.badgeEn || pkg.badgeAr : pkg.badgeAr || pkg.badgeEn;
  const showBadge = Boolean(pkg.featured || badge);

  return (
    <article
      className={[
        "training-card",
        `training-card--${pkg.accent}`,
        pkg.featured ? "training-card--featured" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showBadge ? (
        <span className="training-card__badge">{badge || t("plans.training.mostRequested")}</span>
      ) : null}

      <header className="training-card__head">
        <h2 className="training-card__title">{name}</h2>
        {shortDesc ? <p className="training-card__desc">{shortDesc}</p> : null}
      </header>

      <div className="training-card__price">
        <span className="training-card__price-amount">{priceLabel}</span>
        <span className="training-card__price-unit">{t("plans.currency.jod")}</span>
        <ApproximateCurrencyLine amount={pkg.priceJod} />
      </div>

      <div className="training-card__divider" aria-hidden="true" />

      <div className="training-card__includes">
        <p className="training-card__includes-label">{t("plans.training.includes")}</p>
        <ul className="training-card__features" aria-label={t("plans.training.featuresAria")}>
          {(features || []).map((text, idx) => {
            const Icon = featureIcon(text);
            const highlight = idx === pkg.highlightFeatureIndex;
            return (
              <li
                key={`${pkg.id}-${idx}`}
                className={[
                  "training-card__feature",
                  highlight ? "training-card__feature--highlight" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="training-card__feature-icon" aria-hidden="true">
                  {highlight ? <Icon size={15} strokeWidth={2.1} /> : <Check size={14} strokeWidth={2.4} />}
                </span>
                <span className="training-card__feature-text">{text}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="training-card__cta">
        <a
          className={[
            "training-card__btn",
            pkg.featured ? "training-card__btn--primary" : "training-card__btn--outline",
          ].join(" ")}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("plans.training.whatsappAria", { package: name })}
        >
          <MessageCircle size={16} strokeWidth={2.2} aria-hidden="true" />
          <span>{t("plans.training.cta")}</span>
        </a>
      </div>
    </article>
  );
}
