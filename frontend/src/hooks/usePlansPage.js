import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicPlanPageBySlugRequest } from "../services/api";
import { useFreelancerPlansCheckout } from "./useFreelancerPlansCheckout";

export function usePlansPage({ slug, returnPath }) {
  const defaultCheckout = useFreelancerPlansCheckout({ returnPath });
  const [page, setPage] = useState(null);
  const [slugPlans, setSlugPlans] = useState([]);
  const [slugLoading, setSlugLoading] = useState(Boolean(slug));
  const [slugError, setSlugError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) {
      setPage(null);
      setSlugPlans([]);
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
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) {
          setNotFound(true);
          setPage(null);
          setSlugPlans([]);
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
      const checkoutPlan = {
        ...plan,
        id: plan.checkoutPlanId || plan.subscriptionPlanId || plan.id,
      };
      return defaultCheckout.startCheckout(checkoutPlan);
    },
    [defaultCheckout.startCheckout],
  );

  return useMemo(
    () => ({
      page,
      plans: slug ? slugPlans : defaultCheckout.plans,
      loading: slug ? slugLoading : defaultCheckout.loading,
      error: slug ? slugError : defaultCheckout.error,
      notFound,
      mySubscription: defaultCheckout.mySubscription,
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
      defaultCheckout.plans,
      defaultCheckout.loading,
      defaultCheckout.error,
      defaultCheckout.mySubscription,
      defaultCheckout.hasBlockingSubscription,
      defaultCheckout.checkoutBusyPlanId,
      startCheckout,
      returnPath,
    ],
  );
}
