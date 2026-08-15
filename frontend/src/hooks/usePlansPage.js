import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicPlanPageBySlugRequest } from "../services/api";
import { isOrderzhouseFreePlan } from "../constants/orderzhousePlansCatalog";
import { useFreelancerPlansCheckout } from "./useFreelancerPlansCheckout";
import { useDefaultCatalogPlans } from "./useDefaultCatalogPlans";

/**
 * Public `/plans` (no slug) uses the Super Admin-selected default catalog.
 * Slugged `/plans/:slug` remains legacy page-package plans (isolated).
 */
export function usePlansPage({ slug, returnPath }) {
  const defaultCheckout = useFreelancerPlansCheckout({
    returnPath,
    fetchPublicPlans: false,
  });
  const [page, setPage] = useState(null);
  const [slugPlans, setSlugPlans] = useState([]);
  const [slugActivationFee, setSlugActivationFee] = useState(null);
  const [slugLoading, setSlugLoading] = useState(Boolean(slug));
  const [slugError, setSlugError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const defaultCatalog = useDefaultCatalogPlans({ enabled: !slug });

  useEffect(() => {
    if (!slug) {
      setPage(null);
      setSlugPlans([]);
      setSlugActivationFee(null);
      setSlugLoading(false);
      setSlugError("");
      setNotFound(false);
      return undefined;
    }

    let cancelled = false;
    setSlugLoading(true);
    setSlugError("");
    setNotFound(false);

    void getPublicPlanPageBySlugRequest(slug)
      .then((res) => {
        if (cancelled) return;
        setPage(res?.data?.page ?? null);
        setSlugPlans(Array.isArray(res?.data?.plans) ? res.data.plans : []);
        setSlugActivationFee(res?.data?.activationFee ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) {
          setNotFound(true);
          setPage(null);
          setSlugPlans([]);
          setSlugActivationFee(null);
          return;
        }
        setSlugError(err?.response?.data?.message || "تعذر تحميل صفحة الباقات.");
      })
      .finally(() => {
        if (!cancelled) setSlugLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const startCheckout = useCallback(
    async (plan) => {
      if (plan?.catalogSource === "marketplace_membership" || plan?.marketplaceMembership) {
        return null;
      }
      const resolvedId = plan.checkoutPlanId || plan.subscriptionPlanId || plan.id;
      const isFree =
        isOrderzhouseFreePlan({ id: resolvedId }) ||
        (Number(plan?.priceJod) === 0 && plan?.selfCheckoutEligible === false);
      const checkoutPlan = {
        ...plan,
        id: defaultCheckout.activationFeeNeedsPayment && isFree ? plan.id : resolvedId,
      };
      return defaultCheckout.startCheckout(checkoutPlan);
    },
    [defaultCheckout.startCheckout, defaultCheckout.activationFeeNeedsPayment],
  );

  const isMarketplaceMembershipCatalog = !slug && defaultCatalog.isMarketplaceCatalog;
  const usesLegacyCheckout =
    Boolean(slug) ||
    defaultCatalog.catalogSource === "main_plans" ||
    defaultCatalog.catalogSource === "page_plans";
  const activationFee = slug
    ? slugActivationFee
    : isMarketplaceMembershipCatalog
      ? null
      : defaultCatalog.activationFee;

  return useMemo(
    () => ({
      page,
      plans: slug ? slugPlans : defaultCatalog.plans,
      loading: slug ? slugLoading : defaultCatalog.loading,
      error: slug ? slugError : defaultCatalog.error,
      notFound,
      catalog: slug ? null : defaultCatalog.catalog,
      catalogSource: slug ? "legacy_page_package" : defaultCatalog.catalogSource,
      mySubscription: defaultCheckout.mySubscription,
      activationFeeStatus: defaultCheckout.activationFeeStatus,
      activationFee,
      activationFeeNeedsPayment: usesLegacyCheckout ? defaultCheckout.activationFeeNeedsPayment : false,
      hasBlockingSubscription: usesLegacyCheckout ? defaultCheckout.hasBlockingSubscription : false,
      checkoutBusyPlanId: usesLegacyCheckout ? defaultCheckout.checkoutBusyPlanId : null,
      startCheckout,
      returnPath,
    }),
    [
      page,
      slug,
      slugPlans,
      slugLoading,
      slugError,
      notFound,
      defaultCatalog.plans,
      defaultCatalog.loading,
      defaultCatalog.error,
      defaultCatalog.catalog,
      defaultCatalog.catalogSource,
      isMarketplaceMembershipCatalog,
      usesLegacyCheckout,
      activationFee,
      defaultCheckout.mySubscription,
      defaultCheckout.activationFeeStatus,
      defaultCheckout.activationFeeNeedsPayment,
      defaultCheckout.hasBlockingSubscription,
      defaultCheckout.checkoutBusyPlanId,
      startCheckout,
      returnPath,
    ],
  );
}
