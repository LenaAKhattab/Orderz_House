/** Marketplace Article admin form helpers — Phase A2 + min required bids. */

import arArticles from "../../locales/ar/articles.json" with { type: "json" };
import enArticles from "../../locales/en/articles.json" with { type: "json" };

function articleLocale({ isEn = false, locale } = {}) {
  if (locale) return locale;
  return isEn ? "en" : "ar";
}

function articleT(key, loc = "ar", values) {
  const bundle = loc === "en" ? enArticles : arArticles;
  const parts = String(key || "").split(".");
  let node = bundle;
  for (const part of parts) {
    node = node?.[part];
  }
  let resolved = typeof node === "string" ? node : key;
  if (values && typeof resolved === "string") {
    for (const [k, v] of Object.entries(values)) {
      resolved = resolved.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return resolved;
}

export const ARTICLE_LEVELS = [1, 2, 3, 4, 5];
export const ARTICLE_STATUSES = ["draft", "published", "closed", "cancelled"];
export const ARTICLE_ALLOWED_REQUIRED_BID_COUNTS = [10, 15, 20, 30];
export const ARTICLE_MIN_REQUIRED_BIDS = 10;
/** OZ05 inventory: free integer range (backend assertInventoryRequiredBidCount). */
export const ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MIN = 1;
export const ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MAX = 100;
export const ARTICLE_INVENTORY_REQUIRED_BID_COUNT_DEFAULT = 10;
/** Hours presets for bid collection window (maps to activation visibility duration). */
export const ARTICLE_BID_COLLECTION_DURATION_PRESETS = Object.freeze([
  { hours: 24, labelAr: "24 ساعة" },
  { hours: 48, labelAr: "48 ساعة" },
  { hours: 72, labelAr: "3 أيام" },
  { hours: 168, labelAr: "7 أيام" },
]);
export const ARTICLE_BID_COLLECTION_DURATION_DEFAULT_HOURS = 24;
export const ARTICLE_OZ05_REFUND_RECYCLE_HINT_AR = articleT("form.oz05RefundHint", "ar");

/** OZ-Articles-Bildazo-02 — writing mode + package plan codes. */
export const ARTICLE_WRITING_MODES = ["ai", "manual", "either"];
export const ARTICLE_WRITING_MODE_LABELS_AR = Object.freeze({
  ai: "بالذكاء الاصطناعي",
  manual: "يدوي",
  either: "لا يفرق",
});
export const ARTICLE_WRITING_SOURCES = ["HUMAN_WRITTEN", "AI_ASSISTED"];
export const ARTICLE_WRITING_SOURCE_LABELS_AR = Object.freeze({
  HUMAN_WRITTEN: "بشري (بدون ذكاء اصطناعي)",
  AI_ASSISTED: "بمساعدة الذكاء الاصطناعي",
});
export const ARTICLE_PACKAGE_PLAN_CODES = ["STARTER", "SILVER", "PRO", "ELITE"];
/** Canonical Arabic labels for article inventory target plan (exactly 4 options). */
export const ARTICLE_PACKAGE_PLAN_LABELS_AR = Object.freeze({
  STARTER: "تجربة / مجاني",
  SILVER: "فضية (Silver)",
  PRO: "احترافية (Pro)",
  ELITE: "نخبة (Elite)",
});
/** Dropdown options for OZ inventory — never includes legacy trial duplicate. */
export const ARTICLE_TARGET_PLAN_OPTIONS = Object.freeze(
  ARTICLE_PACKAGE_PLAN_CODES.map((code) => ({
    value: code,
    labelAr: ARTICLE_PACKAGE_PLAN_LABELS_AR[code],
  })),
);
export const ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS = Object.freeze({
  STARTER: { minWords: 600, minReferences: 2 },
  SILVER: { minWords: 1200, minReferences: 4 },
  PRO: { minWords: 1800, minReferences: 6 },
  ELITE: { minWords: 2400, minReferences: 8 },
});
/** Matches backend ARTICLE_PACKAGE_TO_LEVEL / membership access levels. */
export const ARTICLE_PACKAGE_TO_LEVEL = Object.freeze({
  STARTER: 1,
  SILVER: 2,
  PRO: 3,
  ELITE: 5,
});

export function normalizePackagePlanCode(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (ARTICLE_PACKAGE_PLAN_CODES.includes(s)) return s;
  const lower = String(raw || "")
    .trim()
    .toLowerCase();
  const map = {
    starter: "STARTER",
    free: "STARTER",
    trial: "STARTER",
    basic: "STARTER",
    silver: "SILVER",
    pro: "PRO",
    elite: "ELITE",
  };
  return map[lower] || null;
}

export function requirementsForPlanCode(planCode, packageRequirements = null) {
  const code = normalizePackagePlanCode(planCode);
  if (!code) return null;
  const list = Array.isArray(packageRequirements) ? packageRequirements : [];
  const found = list.find((r) => normalizePackagePlanCode(r.planCode) === code);
  if (found) {
    return {
      planCode: code,
      minWords: Number(found.minWords) || ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[code].minWords,
      minReferences:
        Number(found.minReferences) ?? ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[code].minReferences,
    };
  }
  return {
    planCode: code,
    minWords: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[code].minWords,
    minReferences: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[code].minReferences,
  };
}

export function formatDerivedPlanRequirementsSummary(
  planCode,
  packageRequirements = null,
  locale = "ar",
) {
  const req = requirementsForPlanCode(planCode, packageRequirements);
  if (!req) {
    return articleT("form.derivedPlanDefault", locale);
  }
  const label =
    articleT(`planLabels.${req.planCode}`, locale) ||
    ARTICLE_PACKAGE_PLAN_LABELS_AR[req.planCode] ||
    req.planCode;
  return articleT("form.derivedPlanSummary", locale, {
    label,
    words: req.minWords,
    references: req.minReferences,
  });
}

export function formatDerivedPlanRequirementsSummaryAr(planCode, packageRequirements = null) {
  return formatDerivedPlanRequirementsSummary(planCode, packageRequirements, "ar");
}

export function planCodeFromArticleLevel(level) {
  const n = Number(level);
  if (n >= 5) return "ELITE";
  if (n === 4) return "ELITE";
  if (n === 3) return "PRO";
  if (n === 2) return "SILVER";
  if (n === 1) return "STARTER";
  return "";
}
export const BILDAZO_AUTHOR_NOT_LINKED_AR = articleT("applications.authorNotLinked", "ar");
export const BILDAZO_CATEGORIES_LOAD_ERROR_AR = articleT("form.bildazoLoadError", "ar");

export function normalizeWritingMode(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  return ARTICLE_WRITING_MODES.includes(s) ? s : null;
}

export function normalizeWritingSource(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (s === "HUMAN" || s === "HUMAN_WRITTEN") return "HUMAN_WRITTEN";
  if (s === "AI" || s === "AI_ASSISTED") return "AI_ASSISTED";
  return null;
}

export function writingSourceSatisfiesMode(writingSource, writingMode) {
  const mode = normalizeWritingMode(writingMode) || "either";
  const source = normalizeWritingSource(writingSource);
  if (!source) return false;
  if (mode === "either") return true;
  if (mode === "ai") return source === "AI_ASSISTED";
  if (mode === "manual") return source === "HUMAN_WRITTEN";
  return false;
}

export function writingModeLabel(mode, { isEn = false, locale } = {}) {
  const loc = articleLocale({ isEn, locale });
  const normalized = normalizeWritingMode(mode);
  return articleT(`writingModes.${normalized}`, loc) || mode || "—";
}

export function writingModeLabelAr(mode) {
  return writingModeLabel(mode, { locale: "ar" });
}

export const ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR = articleT("form.minBidsWarning", "ar");
export const ARTICLE_MIN_REQUIRED_BIDS_ACK_AR = articleT("form.minBidsAck", "ar");

export function formatArticleBidProgressLabel(current, required, { isEn = false, locale } = {}) {
  if (!required) return "";
  const cur = Number(current) || 0;
  const loc = articleLocale({ isEn, locale });
  return articleT("applications.bidCollection.progress", loc, { current: cur, required });
}

export const ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR = articleT(
  "applications.bidCollection.thresholdWaiting",
  "ar",
);
export const ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR = articleT("applications.bidCollection.minNotMet", "ar");
export const ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR = articleT(
  "applications.bidCollection.thresholdClosed",
  "ar",
);

export function formatArticleBidCollectionLabel(
  bidCollection,
  { isEn = false, locale, articleStatus = null } = {},
) {
  if (!bidCollection) return "";
  if (bidCollection.label) return bidCollection.label;
  const loc = articleLocale({ isEn, locale });
  const required = bidCollection.requiredBidCount ?? bidCollection.required;
  const current = bidCollection.currentBidCount ?? bidCollection.current ?? 0;
  const status = bidCollection.bidCollectionStatus ?? bidCollection.status;
  const outcome = bidCollection.bidCollectionOutcome ?? bidCollection.outcome;
  if (status === "minimum_not_met" || outcome === "minimum_not_met") {
    return articleT("applications.bidCollection.minNotMet", loc);
  }
  if (
    status === "threshold_reached" ||
    status === "eligible_for_assignment" ||
    status === "assigned" ||
    status === "locked" ||
    outcome === "threshold_reached" ||
    bidCollection.thresholdReached
  ) {
    if (articleStatus === "closed" || articleStatus === "cancelled") {
      return articleT("applications.bidCollection.thresholdClosed", loc);
    }
    return articleT("applications.bidCollection.thresholdWaiting", loc);
  }
  return formatArticleBidProgressLabel(current, required, { locale: loc });
}

/** True when apply/bid/take must not proceed (threshold, minimum_not_met, or locked). */
export function isBidCollectionClosedForApply(bidCollection) {
  if (!bidCollection) return false;
  const status = bidCollection.bidCollectionStatus ?? bidCollection.status;
  const outcome = bidCollection.bidCollectionOutcome ?? bidCollection.outcome;
  if (status === "minimum_not_met" || outcome === "minimum_not_met") return true;
  if (
    status === "threshold_reached" ||
    outcome === "threshold_reached" ||
    status === "eligible_for_assignment" ||
    status === "assigned" ||
    status === "locked"
  ) {
    return true;
  }
  return Boolean(bidCollection.thresholdReached);
}

export function canRelistBidCollection(bidCollection) {
  if (!bidCollection) return false;
  const status = bidCollection.bidCollectionStatus || bidCollection.status;
  const outcome = bidCollection.bidCollectionOutcome || bidCollection.outcome;
  if (bidCollection.canRelistBidCollection === true) return true;
  return status === "minimum_not_met" || outcome === "minimum_not_met";
}

export function canSelectArticleApplicant(bidCollection) {
  if (!bidCollection?.requiredBidCount && !bidCollection?.required) return true;
  const status = bidCollection.bidCollectionStatus || bidCollection.status;
  if (status === "minimum_not_met" || bidCollection.bidCollectionOutcome === "minimum_not_met") {
    return false;
  }
  return Boolean(
    bidCollection.thresholdReached ||
      status === "eligible_for_assignment" ||
      status === "threshold_reached" ||
      status === "assigned",
  );
}

export const ARTICLE_FAIR_RANKING_DISCLAIMER_AR = articleT("applications.fairRankingDisclaimer", "ar");
export const ARTICLE_FAIR_RANKING_PENDING_AR = articleT("applications.fairRankingPending", "ar");
export const ARTICLE_FAIR_OVERRIDE_CONFIRM_AR = articleT("fairOverride.helper", "ar");

export function isFairRankingEligible(fairRanking) {
  return Boolean(fairRanking?.eligibleForAssignment);
}

export function isRecommendedArticleApplicant(applicationId, fairRanking) {
  if (!fairRanking?.recommendedApplicationId || applicationId == null) return false;
  return String(fairRanking.recommendedApplicationId) === String(applicationId);
}

export function isRecommendedPantryBid(bidId, fairRanking) {
  if (!fairRanking?.recommendedBidId || bidId == null) return false;
  return String(fairRanking.recommendedBidId) === String(bidId);
}

/** Backend source of truth; frontend display only. */
export function attachableActivationCampaigns(campaigns = [], currentCampaignId = "") {
  return (Array.isArray(campaigns) ? campaigns : []).filter((c) => {
    if (currentCampaignId && String(c.id) === String(currentCampaignId)) return true;
    const status = String(c.status || "");
    return status === "draft" || status === "active";
  });
}

export function attachableActivationWaves(campaigns = [], campaignId, currentWaveId = "") {
  if (!campaignId) return [];
  const campaign = (Array.isArray(campaigns) ? campaigns : []).find(
    (c) => String(c.id) === String(campaignId),
  );
  return (campaign?.waves || []).filter((w) => {
    if (currentWaveId && String(w.id) === String(currentWaveId)) return true;
    const status = String(w.status || "");
    return status === "draft" || status === "active";
  });
}

export function formatActivationAttachmentBadge(article, campaigns = [], { isEn = false, locale } = {}) {
  if (!article?.activationCampaignId) return "";
  const loc = articleLocale({ isEn, locale });
  const campaign = (Array.isArray(campaigns) ? campaigns : []).find(
    (c) => String(c.id) === String(article.activationCampaignId),
  );
  const wave = (campaign?.waves || []).find((w) => String(w.id) === String(article.activationWaveId));
  const campaignLabel =
    campaign?.name ||
    articleT("form.campaignFallback", loc, { id: article.activationCampaignId });
  if (!article.activationWaveId) return campaignLabel;
  const waveLabel =
    wave?.name || articleT("form.waveFallback", loc, { id: article.activationWaveId });
  return `${campaignLabel} · ${waveLabel}`;
}

export function deriveArticleValueJodFromLevel(level) {
  const n = Number(level);
  if (!ARTICLE_LEVELS.includes(n)) return "";
  return n.toFixed(3);
}

export function getInitialMarketplaceArticleFormState(overrides = {}) {
  return {
    title: "",
    description: "",
    targetPlanCode: "STARTER",
    articleLevel: 1,
    requiredWordCount: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS.STARTER.minWords,
    requiredReferencesCount: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS.STARTER.minReferences,
    status: "draft",
    categoryId: "",
    subcategoryId: "",
    bildazoCategoryId: "",
    bildazoCategoryName: "",
    bildazoCategorySlug: "",
    bildazoCategoryPath: "",
    writingMode: "",
    isFakeOrTraining: false,
    requiredBidCount: ARTICLE_INVENTORY_REQUIRED_BID_COUNT_DEFAULT,
    bidCollectionDurationHours: ARTICLE_BID_COLLECTION_DURATION_DEFAULT_HOURS,
    minRequiredBidsAcknowledged: false,
    applicationDeadlineAt: "",
    activationCampaignId: "",
    activationWaveId: "",
    ...overrides,
  };
}

export function articleToMarketplaceFormState(article) {
  if (!article) return getInitialMarketplaceArticleFormState();
  const planFromTier = normalizePackagePlanCode(article.activationPlanTierCode);
  const plan =
    planFromTier || planCodeFromArticleLevel(article.articleLevel) || "STARTER";
  const req = requirementsForPlanCode(plan);
  return getInitialMarketplaceArticleFormState({
    title: article.title || "",
    description: article.description || "",
    targetPlanCode: plan,
    articleLevel: article.articleLevel ?? ARTICLE_PACKAGE_TO_LEVEL[plan],
    requiredWordCount: article.requiredWordCount ?? req.minWords,
    requiredReferencesCount: article.requiredReferencesCount ?? req.minReferences,
    status: article.status || "draft",
    categoryId: article.categoryId || article.category?.id || "",
    subcategoryId: article.subcategoryId || article.subcategory?.id || "",
    bildazoCategoryId: article.bildazoCategoryId || "",
    bildazoCategoryName: article.bildazoCategoryName || "",
    bildazoCategorySlug: article.bildazoCategorySlug || "",
    bildazoCategoryPath: article.bildazoCategoryPath || "",
    writingMode: normalizeWritingMode(article.writingMode) || "",
    isFakeOrTraining: Boolean(article.isFakeOrTraining),
    requiredBidCount:
      article.requiredBidCount || ARTICLE_INVENTORY_REQUIRED_BID_COUNT_DEFAULT,
    bidCollectionDurationHours:
      Number(article.bidCollectionDurationHours) ||
      Number(article.visibilityDurationHours) ||
      ARTICLE_BID_COLLECTION_DURATION_DEFAULT_HOURS,
    minRequiredBidsAcknowledged: Boolean(article.requiredBidCount),
    applicationDeadlineAt: article.applicationDeadlineAt
      ? String(article.applicationDeadlineAt).slice(0, 16)
      : "",
    activationCampaignId: article.activationCampaignId || "",
    activationWaveId: article.activationWaveId || "",
  });
}

export function validateMarketplaceArticleForm(form, { packageRequirements = null, locale = "ar" } = {}) {
  const errors = {};
  const title = String(form.title || "").trim();
  if (!title) errors.title = articleT("validation.titleRequired", locale);
  if (title.length > 240) errors.title = articleT("validation.titleTooLong", locale);
  const planCode = normalizePackagePlanCode(form.targetPlanCode);
  if (!planCode) {
    errors.targetPlanCode = articleT("validation.targetPlanRequired", locale);
  } else {
    const req = requirementsForPlanCode(planCode, packageRequirements);
    if (!req || !req.minWords) {
      errors.targetPlanCode = articleT("validation.targetPlanReadError", locale);
    }
  }
  if (!ARTICLE_STATUSES.includes(String(form.status || ""))) {
    errors.status = articleT("validation.invalidStatus", locale);
  }
  if (!String(form.bildazoCategoryId || "").trim()) {
    errors.bildazoCategoryId = articleT("validation.bildazoRequired", locale);
  }
  if (!normalizeWritingMode(form.writingMode)) {
    errors.writingMode = articleT("validation.writingModeRequired", locale);
  }
  const requiredBidCount = Number(form.requiredBidCount);
  const inventoryMode = Boolean(form.inventorySimplified || form.allowFlexibleBidCount);
  if (inventoryMode) {
    if (
      !Number.isInteger(requiredBidCount) ||
      requiredBidCount < ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MIN ||
      requiredBidCount > ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MAX
    ) {
      errors.requiredBidCount = articleT("validation.bidCountRange", locale, {
        min: ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MIN,
        max: ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MAX,
      });
    }
  } else {
    const allowed = Array.isArray(form.allowedRequiredBidCounts)
      ? form.allowedRequiredBidCounts
      : ARTICLE_ALLOWED_REQUIRED_BID_COUNTS;
    const minRequired = Number(form.minRequiredBids) || ARTICLE_MIN_REQUIRED_BIDS;
    if (!Number.isInteger(requiredBidCount) || requiredBidCount < minRequired) {
      errors.requiredBidCount = articleT("validation.minBids", locale, { min: minRequired });
    } else if (!allowed.includes(requiredBidCount)) {
      errors.requiredBidCount = articleT("validation.bidCountPick", locale, {
        values: allowed.join(locale === "ar" ? "، " : ", "),
      });
    }
    if (!form.minRequiredBidsAcknowledged) {
      errors.minRequiredBidsAcknowledged = articleT("validation.ackRequired", locale);
    }
  }

  const durationHours = Number(form.bidCollectionDurationHours);
  if (
    !Number.isInteger(durationHours) ||
    durationHours < 1 ||
    durationHours > 168
  ) {
    errors.bidCollectionDurationHours = articleT("validation.durationRequired", locale);
  }
  return errors;
}

export function normalizeMarketplaceArticlePayload(form, { packageRequirements = null } = {}) {
  const planCode = normalizePackagePlanCode(form.targetPlanCode);
  const req = requirementsForPlanCode(planCode, packageRequirements) || {
    minWords: Number(form.requiredWordCount) || 600,
    minReferences: Number(form.requiredReferencesCount) || 0,
  };
  const articleLevel = planCode
    ? ARTICLE_PACKAGE_TO_LEVEL[planCode]
    : Number(form.articleLevel) || 1;
  const writingMode = normalizeWritingMode(form.writingMode);
  return {
    title: String(form.title || "").trim(),
    description: String(form.description || "").trim(),
    targetPlanCode: planCode || null,
    articleLevel,
    // Value derived on backend; omit client money forge.
    // Words/refs derived from plan — still sent for legacy API compatibility.
    requiredWordCount: Number(req.minWords),
    requiredReferencesCount: Number(req.minReferences) || 0,
    status: String(form.status || "draft"),
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    subcategoryId: form.subcategoryId ? Number(form.subcategoryId) : null,
    bildazoCategoryId: String(form.bildazoCategoryId || "").trim() || null,
    bildazoCategoryName: String(form.bildazoCategoryName || "").trim() || null,
    bildazoCategorySlug: String(form.bildazoCategorySlug || "").trim() || null,
    bildazoCategoryPath: String(form.bildazoCategoryPath || "").trim() || null,
    writingMode: writingMode || null,
    isFakeOrTraining: Boolean(form.isFakeOrTraining),
    requiredBidCount: Number(form.requiredBidCount),
    bidCollectionDurationHours: Number(form.bidCollectionDurationHours) || ARTICLE_BID_COLLECTION_DURATION_DEFAULT_HOURS,
    visibilityDurationHours: Number(form.bidCollectionDurationHours) || ARTICLE_BID_COLLECTION_DURATION_DEFAULT_HOURS,
    minRequiredBidsAcknowledged: Boolean(form.minRequiredBidsAcknowledged),
    applicationDeadlineAt: form.applicationDeadlineAt || null,
    activationCampaignId: form.activationCampaignId ? Number(form.activationCampaignId) : null,
    activationWaveId: form.activationWaveId ? Number(form.activationWaveId) : null,
  };
}

/** Client-side manuscript checks aligned with OZ-02 Arabic API messages. */
export function validateFreelancerManuscriptForm(form, requirements = {}, locale = "ar") {
  const errors = {};
  const title = String(form.title || "").trim();
  if (!title) errors.title = articleT("validation.manuscriptTitleRequired", locale);
  const content = String(form.content || "").trim();
  if (!content) errors.content = articleT("validation.manuscriptContentRequired", locale);
  const requiredWords = Number(requirements.requiredWordCount) || 0;
  if (requiredWords > 0 && content) {
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < requiredWords) {
      errors.content = articleT("validation.minWords", locale, { count: requiredWords });
    }
  }
  const requiredRefs = Number(requirements.requiredReferencesCount) || 0;
  const referencesText = String(form.referencesText || "").trim();
  if (requiredRefs > 0) {
    const refCount = referencesText
      ? referencesText
          .split(/\n+|;\s+/)
          .map((p) => p.replace(/^\s*\d+[.)\-]\s*/, "").trim())
          .filter(Boolean).length
      : 0;
    if (refCount < requiredRefs) {
      errors.referencesText = articleT("validation.minRefs", locale, { count: requiredRefs });
    }
  }
  const writingSource = normalizeWritingSource(form.writingSource);
  if (!writingSource) {
    errors.writingSource = articleT("validation.writingSourceRequired", locale);
  } else if (
    requirements.writingMode &&
    !writingSourceSatisfiesMode(writingSource, requirements.writingMode)
  ) {
    errors.writingSource = articleT("validation.writingSourceMismatch", locale);
  }
  if (!form.termsAccepted) {
    errors.termsAccepted = articleT("validation.termsRequired", locale);
  }
  return errors;
}

export function defaultPackageRequirementsState() {
  return ARTICLE_PACKAGE_PLAN_CODES.map((planCode) => ({
    planCode,
    minWords: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[planCode].minWords,
    minReferences: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[planCode].minReferences,
  }));
}
