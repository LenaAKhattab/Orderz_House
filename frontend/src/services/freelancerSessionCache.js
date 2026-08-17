import {
  getFreelancerMarketplaceMembershipRequest,
  getMyEligibilityRequest,
  getMySubscriptionRequest,
  getPublicPlansContentRequest,
  listPublicPlansRequest,
} from "./api";
import { mergeApiPlansWithCatalog } from "../constants/orderzhousePlansCatalog";
import { fetchResolvedDefaultCatalogPlans } from "../lib/planCatalog/fetchPlansForCatalog";
import {
  eligibilityCache,
  legacyPlansCache,
  membershipCache,
  plansCache,
  publicPlansContentCache,
  subscriptionCache,
} from "./freelancerSessionCacheStore";

export {
  invalidateFreelancerSessionCache,
  invalidatePublicPlansCache,
  invalidatePublicPlansContentCache,
} from "./freelancerSessionCacheStore";

export function getCachedFreelancerSubscription(userId) {
  if (!userId || subscriptionCache.userId !== userId) return undefined;
  return subscriptionCache.subscription;
}

export function getCachedFreelancerActivationFeeStatus(userId) {
  if (!userId || subscriptionCache.userId !== userId) return undefined;
  return subscriptionCache.activationFeeStatus;
}

export function getCachedFreelancerEligibility(userId) {
  if (!userId || eligibilityCache.userId !== userId) return undefined;
  return eligibilityCache.data;
}

export function getCachedFreelancerMarketplaceMembership(userId) {
  if (!userId || membershipCache.userId !== userId) return undefined;
  return membershipCache.data;
}

export function getCachedPublicPlans() {
  return plansCache.data;
}

export function getCachedDefaultCatalog() {
  return plansCache.catalog;
}

export function getCachedPublicActivationFee() {
  return plansCache.activationFee;
}

export function fetchFreelancerSubscriptionCached(userId, { force = false } = {}) {
  if (!userId) {
    subscriptionCache.userId = null;
    subscriptionCache.subscription = null;
    subscriptionCache.activationFeeStatus = null;
    return Promise.resolve(null);
  }
  if (
    !force &&
    subscriptionCache.userId === userId &&
    subscriptionCache.subscription !== undefined
  ) {
    return Promise.resolve(subscriptionCache.subscription);
  }
  if (!force && subscriptionCache.userId === userId && subscriptionCache.promise) {
    return subscriptionCache.promise;
  }
  subscriptionCache.userId = userId;
  subscriptionCache.promise = getMySubscriptionRequest()
    .then((res) => {
      const sub = res?.data?.subscription ?? null;
      const activationFeeStatus = res?.data?.activationFeeStatus ?? null;
      subscriptionCache.subscription = sub;
      subscriptionCache.activationFeeStatus = activationFeeStatus;
      subscriptionCache.promise = null;
      return sub;
    })
    .catch((err) => {
      subscriptionCache.promise = null;
      throw err;
    });
  return subscriptionCache.promise;
}

export function fetchFreelancerActivationFeeStatusCached(userId, { force = false } = {}) {
  if (!userId) return Promise.resolve(null);
  if (
    !force &&
    subscriptionCache.userId === userId &&
    subscriptionCache.activationFeeStatus !== undefined
  ) {
    return Promise.resolve(subscriptionCache.activationFeeStatus);
  }
  return fetchFreelancerSubscriptionCached(userId, { force }).then(
    () => subscriptionCache.activationFeeStatus ?? null,
  );
}

export function fetchFreelancerEligibilityCached(userId, { force = false } = {}) {
  if (!userId) {
    eligibilityCache.userId = null;
    eligibilityCache.data = null;
    return Promise.resolve(null);
  }
  if (!force && eligibilityCache.userId === userId && eligibilityCache.data !== undefined) {
    return Promise.resolve(eligibilityCache.data);
  }
  if (!force && eligibilityCache.userId === userId && eligibilityCache.promise) {
    return eligibilityCache.promise;
  }
  eligibilityCache.userId = userId;
  eligibilityCache.promise = getMyEligibilityRequest()
    .then((res) => {
      const data = res?.data ?? null;
      eligibilityCache.data = data;
      eligibilityCache.promise = null;
      return data;
    })
    .catch((err) => {
      eligibilityCache.promise = null;
      throw err;
    });
  return eligibilityCache.promise;
}

/** Deduped Marketplace Membership snapshot for Freelancer Plans primary status. */
export function fetchFreelancerMarketplaceMembershipCached(userId, { force = false } = {}) {
  if (!userId) {
    membershipCache.userId = null;
    membershipCache.data = null;
    return Promise.resolve(null);
  }
  if (!force && membershipCache.userId === userId && membershipCache.data !== undefined) {
    return Promise.resolve(membershipCache.data);
  }
  if (!force && membershipCache.userId === userId && membershipCache.promise) {
    return membershipCache.promise;
  }
  membershipCache.userId = userId;
  membershipCache.promise = getFreelancerMarketplaceMembershipRequest()
    .then((res) => {
      const data = res?.data ?? null;
      membershipCache.data = data;
      membershipCache.promise = null;
      return data;
    })
    .catch((err) => {
      membershipCache.promise = null;
      throw err;
    });
  return membershipCache.promise;
}

export async function fetchPublicPlansCached({ force = false } = {}) {
  if (!force && legacyPlansCache.data) return legacyPlansCache.data;
  if (!force && legacyPlansCache.promise) return legacyPlansCache.promise;
  legacyPlansCache.promise = listPublicPlansRequest()
    .then((data) => {
      const items = data?.data?.plans || [];
      const merged = mergeApiPlansWithCatalog(items);
      legacyPlansCache.data = merged;
      legacyPlansCache.activationFee = data?.data?.activationFee ?? null;
      legacyPlansCache.promise = null;
      return merged;
    })
    .catch((err) => {
      legacyPlansCache.promise = null;
      throw err;
    });
  return legacyPlansCache.promise;
}

/**
 * Session cache for the Admin-selected default catalog.
 * Cache key includes `default_plan_catalog` so a Super Admin change does not reuse the old list.
 */
export async function fetchDefaultCatalogPlansCached({ force = false } = {}) {
  if (!force && plansCache.catalog && Array.isArray(plansCache.data) && !plansCache.promise) {
    return {
      catalog: plansCache.catalog,
      plans: plansCache.data,
      activationFee: plansCache.activationFee,
      catalogSource: null,
    };
  }
  if (!force && plansCache.promise) return plansCache.promise;

  const pending = fetchResolvedDefaultCatalogPlans()
    .then((result) => {
      plansCache.catalog = result.catalog;
      plansCache.data = result.plans;
      plansCache.activationFee = result.activationFee ?? null;
      plansCache.promise = null;
      return result;
    })
    .catch((err) => {
      plansCache.promise = null;
      throw err;
    });
  plansCache.promise = pending;
  return pending;
}

export function getCachedPublicPlansContent() {
  return publicPlansContentCache.data;
}

export async function fetchPublicPlansContentCached({ force = false } = {}) {
  if (!force && publicPlansContentCache.data && !publicPlansContentCache.promise) {
    return publicPlansContentCache.data;
  }
  if (!force && publicPlansContentCache.promise) return publicPlansContentCache.promise;

  publicPlansContentCache.promise = getPublicPlansContentRequest()
    .then((res) => {
      const data = res?.data || null;
      publicPlansContentCache.data = data;
      publicPlansContentCache.promise = null;
      return data;
    })
    .catch((err) => {
      publicPlansContentCache.promise = null;
      throw err;
    });
  return publicPlansContentCache.promise;
}
