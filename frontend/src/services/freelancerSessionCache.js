import { getMyEligibilityRequest, getMySubscriptionRequest, listPublicPlansRequest } from "./api";
import { mergeApiPlansWithCatalog } from "../constants/orderzhousePlansCatalog";

const subscriptionCache = {
  userId: null,
  subscription: undefined,
  activationFeeStatus: undefined,
  promise: null,
};
const eligibilityCache = { userId: null, data: undefined, promise: null };
const plansCache = { data: null, activationFee: null, promise: null };

export function invalidateFreelancerSessionCache() {
  subscriptionCache.userId = null;
  subscriptionCache.subscription = undefined;
  subscriptionCache.activationFeeStatus = undefined;
  subscriptionCache.promise = null;
  eligibilityCache.userId = null;
  eligibilityCache.data = undefined;
  eligibilityCache.promise = null;
}

export function invalidatePublicPlansCache() {
  plansCache.data = null;
  plansCache.activationFee = null;
  plansCache.promise = null;
}

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

export function getCachedPublicPlans() {
  return plansCache.data;
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

export async function fetchPublicPlansCached({ force = false } = {}) {
  if (!force && plansCache.data) return plansCache.data;
  if (!force && plansCache.promise) return plansCache.promise;
  plansCache.promise = listPublicPlansRequest()
    .then((data) => {
      const items = data?.data?.plans || [];
      const merged = mergeApiPlansWithCatalog(items);
      plansCache.data = merged;
      plansCache.activationFee = data?.data?.activationFee ?? null;
      plansCache.promise = null;
      return merged;
    })
    .catch((err) => {
      plansCache.promise = null;
      throw err;
    });
  return plansCache.promise;
}
