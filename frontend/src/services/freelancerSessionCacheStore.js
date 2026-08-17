const subscriptionCache = {
  userId: null,
  subscription: undefined,
  activationFeeStatus: undefined,
  promise: null,
};
const eligibilityCache = { userId: null, data: undefined, promise: null };
const membershipCache = { userId: null, data: undefined, promise: null };
const legacyPlansCache = { data: null, activationFee: null, promise: null };
const plansCache = { catalog: null, data: null, activationFee: null, promise: null };
const publicPlansContentCache = { data: null, promise: null };

export {
  subscriptionCache,
  eligibilityCache,
  membershipCache,
  legacyPlansCache,
  plansCache,
  publicPlansContentCache,
};

export function invalidateFreelancerSessionCache() {
  subscriptionCache.userId = null;
  subscriptionCache.subscription = undefined;
  subscriptionCache.activationFeeStatus = undefined;
  subscriptionCache.promise = null;
  eligibilityCache.userId = null;
  eligibilityCache.data = undefined;
  eligibilityCache.promise = null;
  membershipCache.userId = null;
  membershipCache.data = undefined;
  membershipCache.promise = null;
}

export function invalidatePublicPlansContentCache() {
  publicPlansContentCache.data = null;
  publicPlansContentCache.promise = null;
}

export function invalidatePublicPlansCache() {
  legacyPlansCache.data = null;
  legacyPlansCache.activationFee = null;
  legacyPlansCache.promise = null;
  plansCache.catalog = null;
  plansCache.data = null;
  plansCache.activationFee = null;
  plansCache.promise = null;
  invalidatePublicPlansContentCache();
}
