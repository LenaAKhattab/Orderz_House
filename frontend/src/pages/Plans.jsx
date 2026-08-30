import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Navigate, useSearchParams, useNavigate } from "react-router-dom";
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
import { createSpecialOfferCheckoutRequest } from "../services/api";
import { useToast } from "../components/ui/toastContext";
import { isSpecialOfferCheckoutSupported } from "../constants/specialOfferPackage";

const Plans = () => {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { push } = useToast();
  const returnPath = slug ? `/plans/${slug}` : "/plans";
  const {
    page,
    plans,
    loading,
    error,
    notFound,
    catalogSource,
    specialOfferPackage,
    mySubscription,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    activationFeeNeedsPayment,
    activationFee,
    startCheckout,
  } = usePlansPage({ slug, returnPath });
  const { t, dir, locale } = useTranslation();
  const [specialOfferCheckoutBusy, setSpecialOfferCheckoutBusy] = useState(false);

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

  const handleSpecialOfferCheckout = useCallback(async () => {
    if (authLoading || specialOfferCheckoutBusy) return;
    if (!isSpecialOfferCheckoutSupported(specialOfferPackage)) return;

    const role = user?.primaryRole || user?.role;
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const isFreelancer = role === "freelancer" || roles.includes("freelancer");

    if (!user) {
      navigate("/login", { state: { from: { pathname: "/dashboard/freelancer/plans" } } });
      return;
    }
    if (!isFreelancer) {
      push({
        type: "warning",
        message: t("plans.specialOffer.freelancersOnly") || "العرض متاح للمستقلين فقط.",
      });
      return;
    }

    setSpecialOfferCheckoutBusy(true);
    try {
      const res = await createSpecialOfferCheckoutRequest();
      const url = res?.data?.checkoutUrl;
      if (!url) throw new Error(t("plans.specialOffer.checkoutMissingUrl") || "تعذر بدء الدفع.");
      window.location.href = url;
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t("plans.specialOffer.checkoutFailed") ||
        "تعذر بدء شراء العرض.";
      push({ type: "warning", message: msg });
      setSpecialOfferCheckoutBusy(false);
    }
  }, [
    authLoading,
    navigate,
    push,
    specialOfferCheckoutBusy,
    specialOfferPackage,
    t,
    user,
  ]);

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
                specialOfferPackage={specialOfferPackage}
                currentSubscription={mySubscription}
                hasBlockingSubscription={hasBlockingSubscription}
                checkoutBusyPlanId={checkoutBusyPlanId}
                specialOfferCheckoutBusy={specialOfferCheckoutBusy}
                activationFeeNeedsPayment={activationFeeNeedsPayment}
                activationFee={activationFee}
                onCta={handlePlanCta}
                onSpecialOfferCheckout={handleSpecialOfferCheckout}
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
        specialOfferPackage={specialOfferPackage}
        error={error}
        currentSubscription={mySubscription}
        hasBlockingSubscription={hasBlockingSubscription}
        checkoutBusyPlanId={checkoutBusyPlanId}
        specialOfferCheckoutBusy={specialOfferCheckoutBusy}
        activationFeeNeedsPayment={activationFeeNeedsPayment}
        activationFee={activationFee}
        onCta={handlePlanCta}
        onSpecialOfferCheckout={handleSpecialOfferCheckout}
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
