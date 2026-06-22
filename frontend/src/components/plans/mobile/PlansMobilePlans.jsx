import { useTranslation } from "../../../i18n/LanguageProvider";
import PlansMobilePlanCard from "./PlansMobilePlanCard";
import { pickFeaturedPlanIndex } from "../plansFeaturedUtils";

/**
 * @param {{
 *   loading?: boolean;
 *   plans?: object[];
 *   currentSubscription?: object | null;
 *   hasBlockingSubscription?: boolean;
 *   checkoutBusyPlanId?: string | number | null;
 *   onCta?: (plan: object) => void;
 *   skeletonCount?: number;
 * }} p
 */
export default function PlansMobilePlans({
  loading = false,
  plans = [],
  currentSubscription = null,
  hasBlockingSubscription = false,
  checkoutBusyPlanId = null,
  onCta,
  skeletonCount = 5,
}) {
  const { t } = useTranslation();
  const featuredIndex = pickFeaturedPlanIndex(plans);

  return (
    <section className="pm-plans" aria-label={t("plans.sectionAria")} aria-busy={loading || undefined}>
      <header className="pm-section-head">
        <h2 className="pm-section-head__title">{t("plans.mobile.compareTitle")}</h2>
        <span className="pm-section-head__hint">
          {loading ? "…" : t("plans.mobile.packageCount", { count: plans.length })}
        </span>
      </header>

      <div className="pm-plans__list">
        {loading
          ? Array.from({ length: skeletonCount }, (_, i) => (
              <div key={`pm-skel-${i}`} className="pm-plan-card pm-plan-card--skeleton" aria-hidden />
            ))
          : plans.map((plan, idx) => (
              <PlansMobilePlanCard
                key={plan.id}
                plan={plan}
                featured={idx === featuredIndex}
                currentSubscription={currentSubscription}
                hasBlockingSubscription={hasBlockingSubscription}
                checkoutBusy={checkoutBusyPlanId != null && String(checkoutBusyPlanId) === String(plan.id)}
                onCta={onCta}
              />
            ))}
      </div>
    </section>
  );
}
