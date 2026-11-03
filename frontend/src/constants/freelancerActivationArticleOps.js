import { withCatalogLabels } from "./constantsI18n.js";

/**
 * Plan tier option: `value` is the stored code, `labelKey` the catalog key; the legacy `labelAr` getter returns
 * the non-English UI label (Arabic, or the active de / nl / ro locale).
 */
const tierOption = (value) =>
  Object.freeze(withCatalogLabels({ value }, `freelancerActivationArticleOps.planTiers.${value}`, { labelAr: "local" }));

export const FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS = Object.freeze([
  tierOption("starter"),
  tierOption("trial"),
  tierOption("silver"),
  tierOption("pro"),
  tierOption("elite"),
]);

/**
 * Canonical article/hub plan tiers — no duplicate free/trial.
 * Prefer this over FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS in Super Admin articles UI.
 */
export const ARTICLE_CANONICAL_PLAN_TIER_OPTIONS = Object.freeze([
  tierOption("starter"),
  tierOption("silver"),
  tierOption("pro"),
  tierOption("elite"),
]);

export const FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS = Object.freeze({
  starter: Object.freeze({
    totalArticleValueJod: "1.000",
    freelancerShareJod: "0.500",
    companyShareJod: "0.300",
    reviewerShareJod: "0.200",
  }),
  trial: Object.freeze({
    totalArticleValueJod: "1.000",
    freelancerShareJod: "0.500",
    companyShareJod: "0.300",
    reviewerShareJod: "0.200",
  }),
  silver: Object.freeze({
    totalArticleValueJod: "2.000",
    freelancerShareJod: "1.000",
    companyShareJod: "0.600",
    reviewerShareJod: "0.400",
  }),
  pro: Object.freeze({
    totalArticleValueJod: "3.000",
    freelancerShareJod: "1.500",
    companyShareJod: "0.900",
    reviewerShareJod: "0.600",
  }),
  elite: Object.freeze({
    totalArticleValueJod: "4.000",
    freelancerShareJod: "2.000",
    companyShareJod: "1.200",
    reviewerShareJod: "0.800",
  }),
});

export function defaultSplitForTier(tierCode) {
  const key = String(tierCode || "starter").toLowerCase();
  return {
    ...(FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[key] ||
      FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS.starter),
  };
}
