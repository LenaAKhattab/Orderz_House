import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicPlanPageBySlugRequest } from "../services/api";
import { isOrderzhouseFreePlan } from "../constants/orderzhousePlansCatalog";
import { useFreelancerPlansCheckout } from "./useFreelancerPlansCheckout";

export function usePlansPage({ slug, returnPath }) {
  const defaultCheckout = useFreelancerPlansCheckout({ returnPath });
  const [page, setPage] = useState(null);
  const [slugPlans, setSlugPlans] = useState([]);
  const [slugActivationFee, setSlugActivationFee] = useState(null);
  const [slugLoading, setSlugLoading] = useState(Boolean(slug));
  const [slugError, setSlugError] = useState("");
  const [notFound, setNotFound] = useState(false);

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

  const activationFee = slug && slugActivationFee ? slugActivationFee : defaultCheckout.activationFee;

  return useMemo(
    () => ({
      page,
      plans: slug ? slugPlans : defaultCheckout.plans,
      loading: slug ? slugLoading : defaultCheckout.loading,
      error: slug ? slugError : defaultCheckout.error,
      notFound,
      mySubscription: defaultCheckout.mySubscription,
      activationFeeStatus: defaultCheckout.activationFeeStatus,
      activationFee,
      activationFeeNeedsPayment: defaultCheckout.activationFeeNeedsPayment,
      hasBlockingSubscription: defaultCheckout.hasBlockingSubscription,
      checkoutBusyPlanId: defaultCheckout.checkoutBusyPlanId,
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
      activationFee,
      defaultCheckout.plans,
      defaultCheckout.loading,
      defaultCheckout.error,
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
