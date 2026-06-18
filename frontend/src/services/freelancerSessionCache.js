import { getMyEligibilityRequest, getMySubscriptionRequest, listPublicPlansRequest } from "./api";
import { mergeApiPlansWithCatalog, getOrderzhousePlansCatalog } from "../constants/orderzhousePlansCatalog";

const subscriptionCache = { userId: null, data: undefined, promise: null };
const eligibilityCache = { userId: null, data: undefined, promise: null };
const plansCache = { data: null, promise: null };

export function invalidateFreelancerSessionCache() {
  subscriptionCache.userId = null;
  subscriptionCache.data = undefined;
  subscriptionCache.promise = null;
  eligibilityCache.userId = null;
  eligibilityCache.data = undefined;
  eligibilityCache.promise = null;
}

export function invalidatePublicPlansCache() {
  plansCache.data = null;
  plansCache.promise = null;
}

export function getCachedFreelancerSubscription(userId) {
  if (!userId || subscriptionCache.userId !== userId) return undefined;
  return subscriptionCache.data;
}

export function getCachedFreelancerEligibility(userId) {
  if (!userId || eligibilityCache.userId !== userId) return undefined;
  return eligibilityCache.data;
}

export function getCachedPublicPlans() {
  return plansCache.data;
}

export function fetchFreelancerSubscriptionCached(userId, { force = false } = {}) {
  if (!userId) {
    subscriptionCache.userId = null;
    subscriptionCache.data = null;
    return Promise.resolve(null);
  }
  if (!force && subscriptionCache.userId === userId && subscriptionCache.data !== undefined) {
    return Promise.resolve(subscriptionCache.data);
  }
  if (!force && subscriptionCache.userId === userId && subscriptionCache.promise) {
    return subscriptionCache.promise;
  }
  subscriptionCache.userId = userId;
  subscriptionCache.promise = getMySubscriptionRequest()
    .then((res) => {
      const sub = res?.data?.subscription ?? null;
      subscriptionCache.data = sub;
      subscriptionCache.promise = null;
      return sub;
    })
    .catch((err) => {
      subscriptionCache.promise = null;
      throw err;
    });
  return subscriptionCache.promise;
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

export async function fetchPublicPlansCached({ force = false } = {}) {
  if (!force && plansCache.data) return plansCache.data;
  if (!force && plansCache.promise) return plansCache.promise;
  plansCache.promise = listPublicPlansRequest()
    .then((data) => {
      const items = data?.data?.plans || [];
      const merged = mergeApiPlansWithCatalog(items);
      plansCache.data = merged;
      plansCache.promise = null;
      return merged;
    })
    .catch((err) => {
      plansCache.promise = null;
      const fallback = getOrderzhousePlansCatalog();
      plansCache.data = fallback;
      return fallback;
    });
  return plansCache.promise;
}
