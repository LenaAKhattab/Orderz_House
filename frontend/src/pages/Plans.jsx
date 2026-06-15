import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";
import PricingSection from "../components/plans/PricingSection";
import PlansMobilePage from "../components/plans/mobile/PlansMobilePage";
import { useFreelancerPlansCheckout } from "../hooks/useFreelancerPlansCheckout";

const Plans = () => {
  const { user, loading: authLoading } = useAuth();
  const {
    plans,
    loading,
    error,
    mySubscription,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    startCheckout,
  } = useFreelancerPlansCheckout({ returnPath: "/plans" });
  const { t, dir } = useTranslation();

  const handlePlanCta = async (plan) => {
    if (authLoading || !plan?.id || checkoutBusyPlanId) return;
    const role = user?.primaryRole || user?.role;
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const isFreelancer = role === "freelancer" || roles.includes("freelancer");
    if (!user || !isFreelancer) return;
    await startCheckout(plan);
  };

  return (
    <main className="container page-content plans-page plans-page--ref" lang={dir === "rtl" ? "ar" : "en"} dir={dir}>
      <div className="plans-desktop-only">
        <PricingSection
          loading={loading}
          plans={plans}
          currentSubscription={mySubscription}
          hasBlockingSubscription={hasBlockingSubscription}
          checkoutBusyPlanId={checkoutBusyPlanId}
          onCta={handlePlanCta}
        />
        {error ? (
          <section className="card" style={{ marginTop: 14 }}>
            <p className="auth-form-error">{error}</p>
          </section>
        ) : null}

        {!loading && plans.length === 0 ? (
          <section className="card" style={{ marginTop: 14 }}>
            <p>{t("common.empty.plans")}</p>
          </section>
        ) : null}
      </div>

      <PlansMobilePage
        loading={loading}
        plans={plans}
        error={error}
        currentSubscription={mySubscription}
        hasBlockingSubscription={hasBlockingSubscription}
        checkoutBusyPlanId={checkoutBusyPlanId}
        onCta={handlePlanCta}
      />
    </main>
  );
};

export default Plans;
