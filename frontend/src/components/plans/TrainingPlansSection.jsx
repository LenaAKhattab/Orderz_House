import TrainingPlanCard from "./TrainingPlanCard";
import { useTranslation } from "../../i18n/LanguageProvider";
import { usePublicTrainingPackages } from "../../hooks/usePublicTrainingPackages";
import "../../styles/publicPlans.css";
import "../../styles/plansPage.css";

/**
 * Training packages grid for public `/plans` (WhatsApp inquiry CTAs).
 * No page hero — cards are the first content (parity with membership catalog).
 */
export default function TrainingPlansSection() {
  const { t, locale } = useTranslation();
  const packages = usePublicTrainingPackages();

  return (
    <section
      id="plans-panel-training"
      className="pricing pricing-ref-shell pricing--training pricing--training-no-hero"
      role="tabpanel"
      aria-labelledby="plans-tab-training"
      aria-label={t("plans.training.sectionAria")}
    >
      <div className="pricing__grid pricing__grid--public-dynamic pricing__grid--training-three">
        {packages.map((pkg) => (
          <TrainingPlanCard key={pkg.id} pkg={pkg} locale={locale} t={t} />
        ))}
      </div>
    </section>
  );
}
