import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { PLAN_CATALOG, isMarketplacePlanCatalog } from "../constants/planCatalogs";
import { readLastDefaultCatalog } from "../lib/planCatalog/fetchPlansForCatalog";
import { useDefaultCatalogPlans } from "./useDefaultCatalogPlans";
import {
  fetchFreelancerMarketplaceMembershipCached,
  getCachedFreelancerMarketplaceMembership,
} from "../services/freelancerSessionCache";

/**
 * Coordinates Freelancer Plans screen data so catalog + primary status settle together.
 * - Never treats unknown catalog as main/legacy (prevents wrong-status flash)
 * - Prefetches membership in parallel when marketplace is known/hinted
 * - Keeps membership cache across remounts; ignores stale generations
 */
export function useFreelancerPlansScreen() {
  const { user } = useAuth();
  const userId = user?.id || null;

  const catalogState = useDefaultCatalogPlans({ useSessionCache: true });
  const {
    catalog,
    catalogResolved,
    isMarketplaceCatalog,
    plans,
    specialOfferPackage,
    loading: catalogLoading,
    refreshing,
    error,
    activationFee,
  } = catalogState;

  const lastCatalog = readLastDefaultCatalog();
  const hintedMarketplace =
    isMarketplaceCatalog ||
    lastCatalog === PLAN_CATALOG.MARKETPLACE_PLANS ||
    (!catalogResolved && lastCatalog == null);

  const cachedMembership =
    userId && hintedMarketplace ? getCachedFreelancerMarketplaceMembership(userId) : undefined;

  const [membership, setMembership] = useState(() =>
    cachedMembership !== undefined ? cachedMembership : null,
  );
  const [membershipLoading, setMembershipLoading] = useState(() => {
    if (!hintedMarketplace || !userId) return false;
    return cachedMembership === undefined;
  });
  const [membershipError, setMembershipError] = useState(null);
  const generationRef = useRef(0);

  const applyMembershipSnapshot = (data) => {
    setMembership(data);
    setMembershipError(null);
    setMembershipLoading(false);
  };

  const refreshMembership = async () => {
    if (!userId) return null;
    const generation = ++generationRef.current;
    setMembershipLoading(true);
    try {
      const data = await fetchFreelancerMarketplaceMembershipCached(userId, { force: true });
      if (generation !== generationRef.current) return data;
      applyMembershipSnapshot(data);
      return data;
    } catch (err) {
      if (generation !== generationRef.current) return null;
      setMembershipError(err?.response?.data?.message || err?.message || "error");
      setMembershipLoading(false);
      return null;
    }
  };

  useEffect(() => {
    if (!userId || !hintedMarketplace) {
      if (catalogResolved && !isMarketplaceCatalog) {
        setMembership(null);
        setMembershipLoading(false);
        setMembershipError(null);
      }
      return undefined;
    }

    const generation = ++generationRef.current;
    let cancelled = false;
    const cached = getCachedFreelancerMarketplaceMembership(userId);
    if (cached !== undefined) {
      setMembership(cached);
      setMembershipLoading(false);
    } else {
      setMembershipLoading(true);
    }

    void fetchFreelancerMarketplaceMembershipCached(userId)
      .then((data) => {
        if (cancelled || generation !== generationRef.current) return;
        setMembership(data);
        setMembershipError(null);
      })
      .catch((err) => {
        if (cancelled || generation !== generationRef.current) return;
        setMembershipError(err?.response?.data?.message || err?.message || "error");
        if (cached === undefined) setMembership(null);
      })
      .finally(() => {
        if (cancelled || generation !== generationRef.current) return;
        setMembershipLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, hintedMarketplace, isMarketplaceCatalog, catalogResolved]);

  const screenLoading = Boolean(
    !catalogResolved ||
      catalogLoading ||
      (isMarketplaceCatalog && membershipLoading),
  );

  return {
    catalog,
    catalogResolved,
    isMarketplaceCatalog: isMarketplacePlanCatalog(catalog),
    plans,
    specialOfferPackage,
    activationFee,
    error,
    refreshing,
    /** Single initial gate: catalog known + (marketplace membership settled when needed). */
    screenLoading,
    membership,
    membershipLoading,
    membershipError,
    refreshMembership,
    applyMembershipSnapshot,
  };
}
