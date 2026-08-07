import { useEffect, useState } from "react";
import { useAuth } from "../context/useAuth";
import {
  fetchFreelancerEligibilityCached,
  fetchFreelancerSubscriptionCached,
  getCachedFreelancerEligibility,
  getCachedFreelancerSubscription,
} from "../services/freelancerSessionCache";

/**
 * Shared subscription + eligibility for freelancer marketplace pages.
 * Dedupes in-flight requests and reuses session cache across route changes.
 * Refetches on window focus so Admin plan/fee updates appear without logout.
 */
export function useFreelancerMarketplaceContext() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const userId = user?.id;

  const [subscription, setSubscription] = useState(() =>
    userId && isFreelancer ? getCachedFreelancerSubscription(userId) ?? null : null,
  );
  const [eligibility, setEligibility] = useState(() =>
    userId && isFreelancer ? getCachedFreelancerEligibility(userId) ?? null : null,
  );
  const [eligibilityFetched, setEligibilityFetched] = useState(() => {
    if (!userId || !isFreelancer) return false;
    return getCachedFreelancerEligibility(userId) !== undefined;
  });

  useEffect(() => {
    if (!userId || authLoading || !isFreelancer) {
      setSubscription(null);
      setEligibility(null);
      setEligibilityFetched(false);
      return undefined;
    }

    const cachedSub = getCachedFreelancerSubscription(userId);
    if (cachedSub !== undefined) setSubscription(cachedSub);

    const cachedElig = getCachedFreelancerEligibility(userId);
    if (cachedElig !== undefined) {
      setEligibility(cachedElig);
      setEligibilityFetched(true);
    } else {
      setEligibilityFetched(false);
    }

    let cancelled = false;

    const load = ({ force = false } = {}) => {
      void fetchFreelancerSubscriptionCached(userId, { force }).then((sub) => {
        if (!cancelled) setSubscription(sub);
      });

      void fetchFreelancerEligibilityCached(userId, { force })
        .then((data) => {
          if (!cancelled) setEligibility(data);
        })
        .finally(() => {
          if (!cancelled) setEligibilityFetched(true);
        });
    };

    load({ force: false });

    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load({ force: true });
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, authLoading, isFreelancer]);

  return { subscription, eligibility, eligibilityFetched, isFreelancer, authLoading };
}
