import { useMemo } from "react";
import { Crown, Sparkles } from "lucide-react";
import PricingSection from "../../components/plans/PricingSection";
import FreelancerMarketplaceMembershipCard from "../../components/freelancer/FreelancerMarketplaceMembershipCard";
import FreelancerPlansScreenSkeleton from "../../components/plans/FreelancerPlansScreenSkeleton";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import { useFreelancerPlansCheckout } from "../../hooks/useFreelancerPlansCheckout";
import { useFreelancerPlansScreen } from "../../hooks/useFreelancerPlansScreen";
import { useFreelancerMarketplaceContext } from "../../hooks/useFreelancerMarketplaceContext";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import { formatJoDateMedium, getPlanOrderValueRangeLabel } from "../../utils/freelancerDashboardData";
import { isOrderzhouseFreePlan } from "../../constants/orderzhousePlansCatalog";
import { getNextUpgradePlan } from "../../utils/planSubscriptionUtils";
import { PLAN_CATALOG } from "../../constants/planCatalogs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";
import "../../styles/dashboardHub.css";
import "./freelancerPlans.css";

function activationLabel(status, t) {
  const s = String(status || "");
  if (s === "company_approved") return t("freelancerDashboard.status.activation.approved");
  if (s === "company_pending") return t("freelancerDashboard.status.activation.pending");
  return s || t("freelancerDashboard.common.emDash");
}

function subscriptionStatusLabel(status, t) {
  if (status === "active") return t("freelancerDashboard.status.subscription.active");
  if (status === "assigned_not_started") return t("freelancerDashboard.status.subscription.assignedNotStarted");
  if (status === "expired") return t("freelancerDashboard.status.subscription.expired");
  if (status === "inactive") return t("freelancerDashboard.status.subscription.inactive");
  return status || t("freelancerDashboard.common.emDash");
}

/**
 * Freelancer plans page: primary status follows Super Admin default_plan_catalog only.
 * Screen data is coordinated so catalog + status appear together (no intermediate wrong hero).
 */
export default function FreelancerPlansPage() {
  const { t, locale } = useTranslation();
  const {
    mySubscription,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    activationFeeNeedsPayment,
    activationFee,
    startCheckout,
  } = useFreelancerPlansCheckout({
    returnPath: "/dashboard/freelancer/plans",
    fetchPublicPlans: false,
  });

  const {
    catalog,
    catalogResolved,
    isMarketplaceCatalog,
    plans,
    activationFee: catalogActivationFee,
    error,
    screenLoading,
    membership,
    membershipError,
  } = useFreelancerPlansScreen();

  const { eligibility } = useFreelancerMarketplaceContext();

  const nextPlan = useMemo(
    () => (isMarketplaceCatalog ? null : getNextUpgradePlan(plans, mySubscription)),
    [isMarketplaceCatalog, plans, mySubscription],
  );
  const rangeLabel =
    getLocalizedField(mySubscription, "label", locale) ||
    getLocalizedField(mySubscription?.planOrderValueRange, "label", locale) ||
    getPlanOrderValueRangeLabel(mySubscription, t);
  const freePlan = isOrderzhouseFreePlan(mySubscription?.planId ?? mySubscription?.plan);
  const planTitle =
    getLocalizedField(mySubscription?.plan, "title", locale) ||
    t("freelancerDashboard.plans.freePlanTitle");
  const nextPlanTitle = nextPlan ? getLocalizedField(nextPlan, "title", locale) || nextPlan.title : "";
  const blockMsg =
    eligibility && !eligibility.eligible
      ? getFreelancerOrderEligibilityMessage(eligibility, mySubscription, t)
      : "";
  const renewalFrozen = eligibility?.reason === "account_hold_payment_failed";
  const freezeTitle =
    eligibility?.freezeMessage?.title ||
    t("freelancerDashboard.status.eligibility.subscriptionRenewalFailedTitle", {
      defaultValue: "تعذر تجديد الاشتراك",
    });

  const catalogAria =
    catalog === PLAN_CATALOG.MARKETPLACE_PLANS
      ? t("freelancerDashboard.plans.marketplaceCatalogAria")
      : catalog === PLAN_CATALOG.PAGE_PLANS
        ? t("freelancerDashboard.plans.pageCatalogAria")
        : t("freelancerDashboard.plans.upgradeSectionAria");

  return (
    <DashboardHubPage className="fdash-page--plans">
      <div className="fp-page">
        {renewalFrozen ? (
          <section
            className="fp-surface"
            role="alert"
            style={{
              marginBottom: 16,
              borderColor: "rgba(180, 60, 60, 0.45)",
              background: "rgba(180, 60, 60, 0.08)",
              padding: "16px 18px",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>{freezeTitle}</h2>
            <p style={{ margin: 0 }}>{blockMsg}</p>
          </section>
        ) : null}

        {/* Until catalog is known, never render legacy OR marketplace status (prevents flash). */}
        {screenLoading || !catalogResolved ? (
          <FreelancerPlansScreenSkeleton catalog={catalog} catalogResolved={catalogResolved} />
        ) : isMarketplaceCatalog ? (
          <>
            <FreelancerMarketplaceMembershipCard
              snapshot={membership}
              error={membershipError}
              catalogPlans={plans}
            />
            <section className="fp-surface fp-pricing-wrap" aria-label={catalogAria}>
              {error ? <p className="fp-error">{error}</p> : null}
              {!error ? (
                <PricingSection
                  variant="dashboard"
                  loading={false}
                  plans={plans}
                  currentSubscription={null}
                  hasBlockingSubscription={false}
                  checkoutBusyPlanId={null}
                  activationFeeNeedsPayment={false}
                  activationFee={null}
                  onCta={undefined}
                />
              ) : null}
            </section>
          </>
        ) : (
          <>
            <header className="fp-surface fp-hero">
              <div className="fp-hero__copy">
                <span className="fp-hero__eyebrow">
                  <Crown size={14} strokeWidth={2} aria-hidden />
                  {t("freelancerDashboard.plans.eyebrow")}
                </span>
                <h1 className="fp-hero__title">{planTitle}</h1>
                <p className="fp-hero__subtitle">
                  {freePlan
                    ? t("freelancerDashboard.plans.freePlanSubtitle")
                    : t("freelancerDashboard.plans.paidPlanSubtitle")}
                </p>
                {nextPlan ? (
                  <p className="fp-upgrade-hint" style={{ marginTop: 14 }}>
                    <Sparkles
                      size={15}
                      strokeWidth={2}
                      style={{ verticalAlign: "middle", marginInlineEnd: 6 }}
                      aria-hidden
                    />
                    {t("freelancerDashboard.plans.nextPlanHint", { title: nextPlanTitle })}
                  </p>
                ) : null}
                {blockMsg ? (
                  <p className="fp-upgrade-hint" style={{ marginTop: 10 }}>
                    {blockMsg}
                  </p>
                ) : null}
              </div>

              <dl className="fp-hero__stats" aria-label={t("freelancerDashboard.plans.summaryAria")}>
                <div className="fp-hero__stat">
                  <dt>{t("freelancerDashboard.plans.subscriptionStatus")}</dt>
                  <dd className="fp-hero__stat-value--accent">
                    {subscriptionStatusLabel(mySubscription?.status, t)}
                  </dd>
                </div>
                <div className="fp-hero__stat">
                  <dt>{t("freelancerDashboard.plans.companyActivation")}</dt>
                  <dd
                    className={
                      mySubscription?.activationStatus === "company_approved"
                        ? "fp-hero__stat-value--ok"
                        : "fp-hero__stat-value--warn"
                    }
                  >
                    {activationLabel(mySubscription?.activationStatus, t)}
                  </dd>
                </div>
                {rangeLabel ? (
                  <div className="fp-hero__stat" style={{ gridColumn: "1 / -1" }}>
                    <dt>{t("freelancerDashboard.plans.orderValueRange")}</dt>
                    <dd>{rangeLabel}</dd>
                  </div>
                ) : null}
                {mySubscription?.expiryDate ? (
                  <div className="fp-hero__stat" style={{ gridColumn: "1 / -1" }}>
                    <dt>{t("freelancerDashboard.plans.expiresOn")}</dt>
                    <dd>{formatJoDateMedium(mySubscription.expiryDate, locale)}</dd>
                  </div>
                ) : null}
              </dl>
            </header>

            <section className="fp-surface fp-pricing-wrap" aria-label={catalogAria}>
              {error ? <p className="fp-error">{error}</p> : null}
              {!error ? (
                <PricingSection
                  variant="dashboard"
                  loading={false}
                  plans={plans}
                  currentSubscription={mySubscription}
                  hasBlockingSubscription={hasBlockingSubscription}
                  checkoutBusyPlanId={checkoutBusyPlanId}
                  activationFeeNeedsPayment={activationFeeNeedsPayment}
                  activationFee={activationFee || catalogActivationFee}
                  onCta={startCheckout}
                />
              ) : null}
            </section>
          </>
        )}
      </div>
    </DashboardHubPage>
  );
}
