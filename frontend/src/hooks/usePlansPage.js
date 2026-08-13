import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPublicPlanPageBySlugRequest,
  listPublicMarketplaceMembershipPlansRequest,
} from "../services/api";
import { isOrderzhouseFreePlan } from "../constants/orderzhousePlansCatalog";
import { mapMarketplaceMembershipPlansForPublicPlans } from "../lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans";
import { useFreelancerPlansCheckout } from "./useFreelancerPlansCheckout";

/**
 * Public `/plans` (no slug) uses Marketplace Membership catalog.
 * Slugged `/plans/:slug` remains legacy page-package plans (isolated).
 */
export function usePlansPage({ slug, returnPath }) {
  const defaultCheckout = useFreelancerPlansCheckout({
    returnPath,
    // Public /plans (no slug) uses Marketplace Membership only — skip legacy main-plan catalog fetch.
    fetchPublicPlans: Boolean(slug),
  });
  const [page, setPage] = useState(null);
  const [slugPlans, setSlugPlans] = useState([]);
  const [slugActivationFee, setSlugActivationFee] = useState(null);
  const [slugLoading, setSlugLoading] = useState(Boolean(slug));
  const [slugError, setSlugError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [membershipPlans, setMembershipPlans] = useState([]);
  const [membershipLoading, setMembershipLoading] = useState(!slug);
  const [membershipError, setMembershipError] = useState("");

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

  useEffect(() => {
    if (slug) {
      setMembershipPlans([]);
      setMembershipLoading(false);
      setMembershipError("");
      return undefined;
    }

    let cancelled = false;
    setMembershipLoading(true);
    setMembershipError("");

    void listPublicMarketplaceMembershipPlansRequest()
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.data?.items)
          ? res.data.items
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.items)
              ? res.items
              : [];
        setMembershipPlans(mapMarketplaceMembershipPlansForPublicPlans(items));
      })
      .catch((err) => {
        if (cancelled) return;
        setMembershipError(
          err?.response?.data?.message || "تعذر تحميل باقات عضوية السوق.",
        );
        setMembershipPlans([]);
      })
      .finally(() => {
        if (!cancelled) setMembershipLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const startCheckout = useCallback(
    async (plan) => {
      // Marketplace Membership is not legacy subscription checkout.
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

  const isMarketplaceMembershipCatalog = !slug;
  const activationFee = slug && slugActivationFee ? slugActivationFee : null;

  return useMemo(
    () => ({
      page,
      plans: slug ? slugPlans : membershipPlans,
      loading: slug ? slugLoading : membershipLoading,
      error: slug ? slugError : membershipError,
      notFound,
      catalogSource: isMarketplaceMembershipCatalog
        ? "marketplace_membership"
        : "legacy_page_package",
      mySubscription: defaultCheckout.mySubscription,
      activationFeeStatus: defaultCheckout.activationFeeStatus,
      activationFee,
      // Main /plans no longer uses legacy activation-fee subscription checkout.
      activationFeeNeedsPayment: slug ? defaultCheckout.activationFeeNeedsPayment : false,
      hasBlockingSubscription: slug ? defaultCheckout.hasBlockingSubscription : false,
      checkoutBusyPlanId: slug ? defaultCheckout.checkoutBusyPlanId : null,
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
      membershipPlans,
      membershipLoading,
      membershipError,
      isMarketplaceMembershipCatalog,
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
