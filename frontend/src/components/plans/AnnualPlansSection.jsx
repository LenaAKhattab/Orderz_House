import { useTranslation } from "../../i18n/LanguageProvider";
import PlanCard from "./PlanCard";
import PlansApplicationNote from "./PlansApplicationNote";
import { PlanCardsRowSkeleton } from "../ui/Skeleton";
import { resolvePublicPlansGridClassName } from "./plansLayoutUtils";
import "../../styles/publicPlans.css";
import "../../styles/plansPage.css";

/**
 * Annual Plans (الباقات السنوية) grid. Same membership card chrome as the
 * marketplace catalog — PlanCard drives CTA, current-plan lock and checkout.
 */
export default function AnnualPlansSection({
  plans = [],
  loading = false,
  error = false,
  currentMarketplaceMembership = null,
  onCta,
  checkoutBusyPlanId = null,
}) {
  const { t } = useTranslation();
  const list = Array.isArray(plans) ? plans : [];
  const gridClassName = resolvePublicPlansGridClassName(loading ? 1 : list.length);

  return (
    <section
      id="plans-panel-annual"
      role="tabpanel"
      aria-labelledby="plans-tab-annual"
      className="pricing pricing-ref-shell pricing--membership pricing--membership-no-hero pricing--annual"
      aria-label={t("plans.annual.sectionAria")}
    >
      {loading ? (
        <PlanCardsRowSkeleton count={1} className={gridClassName} />
      ) : list.length > 0 ? (
        <div className={["pricing__grid", gridClassName].join(" ")}>
          {list.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={false}
              currentMarketplaceMembership={currentMarketplaceMembership}
              onCta={onCta}
              membershipDashboardPath="/dashboard/freelancer/plans?type=annual"
              checkoutBusy={checkoutBusyPlanId != null && String(checkoutBusyPlanId) === String(plan.id)}
            />
          ))}
        </div>
      ) : null}
      {!loading && list.length > 0 ? <PlansApplicationNote /> : null}
      {!loading && list.length === 0 ? (
        <section className="card" style={{ marginTop: 14 }}>
          <p>{error ? t("plans.errors.loadFailed") : t("plans.annual.empty")}</p>
        </section>
      ) : null}
    </section>
  );
}
