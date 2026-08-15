import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";
import { getLocalizedField } from "../lib/i18n/getLocalizedField";
import PricingSection from "../components/plans/PricingSection";
import PlansMobilePage from "../components/plans/mobile/PlansMobilePage";
import PlansCategoryToggle from "../components/plans/PlansCategoryToggle";
import TrainingPlansSection from "../components/plans/TrainingPlansSection";
import { PlanCardsRowSkeleton } from "../components/ui/Skeleton";
import {
  getPlansLayoutConfig,
  PLANS_LAYOUT_VARIANT,
  LEGACY_DIRECT_PLANS_URL_SEGMENT,
  resolvePlansLayoutVariant,
} from "../components/plans/plansLayoutUtils";
import { usePlansPage } from "../hooks/usePlansPage";
import { usePublicPlansContent } from "../hooks/usePublicPlansContent";
import {
  DEFAULT_PLANS_CATEGORY,
  PLANS_CATEGORY,
  resolvePlansCategory,
} from "../constants/trainingPlansCatalog";
import { getCachedPublicPlansContent } from "../services/freelancerSessionCache";
import { plansCategoryFromDefaultSection } from "../constants/publicPlansContent";

const Plans = () => {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const returnPath = slug ? `/plans/${slug}` : "/plans";
  const {
    page,
    plans,
    loading,
    error,
    notFound,
    catalogSource,
    mySubscription,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    activationFeeNeedsPayment,
    activationFee,
    startCheckout,
  } = usePlansPage({ slug, returnPath });
  const { t, dir, locale } = useTranslation();

  const isMainCatalog = !slug;
  const plansContent = usePublicPlansContent({ enabled: isMainCatalog });
  const [category, setCategory] = useState(() => {
    if (!isMainCatalog) return PLANS_CATEGORY.MEMBERSHIP;
    const urlType = searchParams.get("type");
    if (urlType) return resolvePlansCategory(urlType);
    const cached = getCachedPublicPlansContent();
    if (cached) return plansCategoryFromDefaultSection(cached.defaultSection);
    return null;
  });

  useEffect(() => {
    if (!isMainCatalog) return;
    const urlType = searchParams.get("type");
    if (urlType) {
      setCategory(resolvePlansCategory(urlType));
      return;
    }
    if (!plansContent.ready) return;
    setCategory((prev) => prev ?? plansCategoryFromDefaultSection(plansContent.defaultSection));
  }, [isMainCatalog, searchParams, plansContent.ready, plansContent.defaultSection]);

  const handleCategoryChange = useCallback(
    (next) => {
      const resolved = resolvePlansCategory(next);
      setCategory(resolved);
      if (!isMainCatalog) return;
      const nextParams = new URLSearchParams(searchParams);
      if (resolved === DEFAULT_PLANS_CATEGORY) {
        nextParams.delete("type");
      } else {
        nextParams.set("type", resolved);
      }
      setSearchParams(nextParams, { replace: true });
    },
    [isMainCatalog, searchParams, setSearchParams],
  );

  if (slug === "freelancers") {
    return <Navigate to="/plans" replace />;
  }

  if (slug === "client-offer") {
    return <Navigate to={`/plans/${LEGACY_DIRECT_PLANS_URL_SEGMENT}`} replace />;
  }

  const trustPills = [];

  const layoutVariant = resolvePlansLayoutVariant({ slug, page });
  const layoutConfig = useMemo(() => getPlansLayoutConfig(layoutVariant), [layoutVariant]);

  const pageTitle =
    !layoutConfig.useMainPlansHero && slug && page
      ? getLocalizedField(page, "title", locale) || page.title
      : null;
  const pageSubtitle =
    !layoutConfig.useMainPlansHero && slug && page
      ? getLocalizedField(page, "subtitle", locale) || page.subtitle
      : null;

  const handlePlanCta = async (plan) => {
    if (authLoading || !plan?.id || checkoutBusyPlanId) return;
    const role = user?.primaryRole || user?.role;
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const isFreelancer = role === "freelancer" || roles.includes("freelancer");
    if (!user || !isFreelancer) return;
    await startCheckout(plan);
  };

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

  const contentPending = isMainCatalog && (category == null || !plansContent.ready);
  const showTraining = !contentPending && isMainCatalog && category === PLANS_CATEGORY.TRAINING;
  const showMembership = !contentPending && (!isMainCatalog || category === PLANS_CATEGORY.MEMBERSHIP);

  return (
    <main
      className={`container page-content plans-page plans-page--ref ${layoutConfig.pageModifierClass} ${
        isMainCatalog ? "plans-page--catalog-toggle" : ""
      }`.trim()}
      lang={dir === "rtl" ? "ar" : "en"}
      dir={dir}
    >
      {isMainCatalog && !contentPending ? (
        <PlansCategoryToggle
          value={category}
          onChange={handleCategoryChange}
          t={t}
          trainingLabel={plansContent.trainingTabLabel}
          membershipLabel={plansContent.workTabLabel}
          defaultSection={plansContent.defaultSection}
        />
      ) : null}

      <div className="plans-desktop-only">
        {contentPending ? (
          <section className="pricing pricing-ref-shell" aria-busy="true">
            <PlanCardsRowSkeleton count={3} className="pricing__grid--public-dynamic pricing__grid--training-three" />
          </section>
        ) : null}

        {showTraining ? (
          <TrainingPlansSection
            eyebrow={plansContent.badgeText}
            title={plansContent.title}
            subtitle={plansContent.description}
          />
        ) : null}

        {showMembership ? (
          <>
            {loading || !error ? (
              <PricingSection
                loading={loading}
                plans={plans}
                currentSubscription={mySubscription}
                hasBlockingSubscription={hasBlockingSubscription}
                checkoutBusyPlanId={checkoutBusyPlanId}
                activationFeeNeedsPayment={activationFeeNeedsPayment}
                activationFee={activationFee}
                onCta={handlePlanCta}
                pageTitle={pageTitle}
                pageSubtitle={pageSubtitle}
                trustPills={trustPills}
                layoutVariant={layoutVariant}
                forceMembershipHero={isMainCatalog}
                membershipCatalog={
                isMainCatalog
                  ? catalogSource == null
                    ? null
                    : catalogSource === "marketplace_membership"
                  : false
              }
              />
            ) : null}
            {error ? (
              <section className="card" style={{ marginTop: 14 }}>
                <p className="auth-form-error">{error || t("plans.errors.loadFailed")}</p>
              </section>
            ) : null}

            {!loading && !error && plans.length === 0 ? (
              <section className="card" style={{ marginTop: 14 }}>
                <p>{t("common.empty.plans")}</p>
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      <PlansMobilePage
        loading={loading}
        plans={plans}
        error={error}
        currentSubscription={mySubscription}
        hasBlockingSubscription={hasBlockingSubscription}
        checkoutBusyPlanId={checkoutBusyPlanId}
        activationFeeNeedsPayment={activationFeeNeedsPayment}
        activationFee={activationFee}
        onCta={handlePlanCta}
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
        trustPills={trustPills}
        pageSlug={slug || null}
        layoutVariant={layoutVariant}
        category={isMainCatalog ? category : null}
        trainingEyebrow={plansContent.badgeText}
        trainingTitle={plansContent.title}
        trainingSubtitle={plansContent.description}
        contentPending={contentPending}
      />
    </main>
  );
};

export default Plans;
