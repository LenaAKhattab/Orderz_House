import { useParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";
import PricingSection from "../components/plans/PricingSection";
import PlansMobilePage from "../components/plans/mobile/PlansMobilePage";
import { usePlansPage } from "../hooks/usePlansPage";

const Plans = () => {
  const { slug } = useParams();
  const { user, loading: authLoading } = useAuth();
  const returnPath = slug ? `/plans/${slug}` : "/plans";
  const {
    page,
    plans,
    loading,
    error,
    notFound,
    mySubscription,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    startCheckout,
  } = usePlansPage({ slug, returnPath });
  const { t, dir } = useTranslation();

  const handlePlanCta = async (plan) => {
    if (authLoading || !plan?.id || checkoutBusyPlanId) return;
    const role = user?.primaryRole || user?.role;
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const isFreelancer = role === "freelancer" || roles.includes("freelancer");
    if (!user || !isFreelancer) return;
    await startCheckout(plan);
  };

  const pageTitle = slug && page?.title ? page.title : null;
  const pageSubtitle = slug && page?.subtitle ? page.subtitle : null;

  if (notFound) {
    return (
      <main className="container page-content plans-page plans-page--ref" lang={dir === "rtl" ? "ar" : "en"} dir={dir}>
        <section className="card" style={{ marginTop: 24, textAlign: "center", padding: "48px 24px" }}>
          <h1 style={{ marginBottom: 12 }}>{t("plans.pageUnavailable.title")}</h1>
          <p style={{ margin: 0, opacity: 0.85 }}>{t("plans.pageUnavailable.message")}</p>
        </section>
      </main>
    );
  }

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
          pageTitle={pageTitle}
          pageSubtitle={pageSubtitle}
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
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
      />
    </main>
  );
};

export default Plans;
