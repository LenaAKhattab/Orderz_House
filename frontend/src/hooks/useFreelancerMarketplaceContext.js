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
    void fetchFreelancerSubscriptionCached(userId).then((sub) => {
      if (!cancelled) setSubscription(sub);
    });

    void fetchFreelancerEligibilityCached(userId)
      .then((data) => {
        if (!cancelled) setEligibility(data);
      })
      .finally(() => {
        if (!cancelled) setEligibilityFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading, isFreelancer]);

  return { subscription, eligibility, eligibilityFetched, isFreelancer, authLoading };
}
