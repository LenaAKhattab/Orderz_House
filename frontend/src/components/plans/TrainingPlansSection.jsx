import PublicPageHeader from "../layout/PublicPageHeader";
import { TRAINING_PACKAGES } from "../../constants/trainingPlansCatalog";
import TrainingPlanCard from "./TrainingPlanCard";
import { useTranslation } from "../../i18n/LanguageProvider";

/**
 * Training packages grid for public `/plans` (WhatsApp inquiry CTAs).
 */
export default function TrainingPlansSection({
  eyebrow = null,
  title = null,
  subtitle = null,
}) {
  const { t, locale } = useTranslation();

  return (
    <section
      id="plans-panel-training"
      className="pricing pricing-ref-shell pricing--training"
      role="tabpanel"
      aria-labelledby="plans-tab-training"
      aria-label={t("plans.training.sectionAria")}
    >
      <PublicPageHeader
        className="public-page-hero--training"
        eyebrow={eyebrow || t("plans.training.hero.eyebrow")}
        title={title || t("plans.training.hero.title")}
        subtitle={subtitle || t("plans.training.hero.subtitle")}
      />

      <div className="pricing__grid pricing__grid--public-dynamic pricing__grid--training-three">
        {TRAINING_PACKAGES.map((pkg) => (
          <TrainingPlanCard key={pkg.id} pkg={pkg} locale={locale} t={t} />
        ))}
      </div>
    </section>
  );
}
