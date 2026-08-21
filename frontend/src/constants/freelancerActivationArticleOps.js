export const FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS = Object.freeze([
  { value: "starter", labelAr: "تجربة / مجاني" },
  { value: "trial", labelAr: "تجربة" },
  { value: "silver", labelAr: "فضية (Silver)" },
  { value: "pro", labelAr: "احترافية (Pro)" },
  { value: "elite", labelAr: "نخبة (Elite)" },
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
