/** Marketplace Article admin form helpers — Phase A2 + min required bids. */

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
export const ARTICLE_OZ05_REFUND_RECYCLE_HINT_AR =
  "إذا لم يصل المقال إلى الحد الأدنى من المتقدمين خلال هذه المدة، سيعود إلى المخزون ويتم إرجاع مبلغ التمويل.";

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

export function formatDerivedPlanRequirementsSummaryAr(planCode, packageRequirements = null) {
  const req = requirementsForPlanCode(planCode, packageRequirements);
  if (!req) {
    return "سيتم تطبيق متطلبات الخطة تلقائياً عند اختيارها.";
  }
  const label = ARTICLE_PACKAGE_PLAN_LABELS_AR[req.planCode] || req.planCode;
  return `سيتم تطبيق متطلبات خطة ${label} تلقائياً: ${req.minWords} كلمة و ${req.minReferences} مراجع.`;
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
export const BILDAZO_AUTHOR_NOT_LINKED_AR =
  "لا يمكن نشر المقال قبل ربط حساب الكاتب في بلدازو.";
export const BILDAZO_CATEGORIES_LOAD_ERROR_AR =
  "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.";

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

export function writingModeLabelAr(mode) {
  return ARTICLE_WRITING_MODE_LABELS_AR[normalizeWritingMode(mode)] || mode || "—";
}

export const ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR =
  "العدد الذي تحدده يمثل الحد الأدنى المطلوب لإتمام المناقصة. إذا انتهت مدة الطلب دون الوصول إلى هذا العدد، فلن يتم إسناد الطلب لأي Freelancer، وسيتم إرجاع المناقصات المستخدمة للمتقدمين، ثم إعادة الطلب لك وإعادة طرحه مرة أخرى.";

export const ARTICLE_MIN_REQUIRED_BIDS_ACK_AR =
  "أقر بأن العدد الذي أحدده يمثل الحد الأدنى المطلوب لإتمام المناقصة. إذا انتهت مدة الطلب دون الوصول إلى هذا العدد، فلن يتم إسناد الطلب لأي Freelancer، وسيتم إرجاع المناقصات المستخدمة للمتقدمين، ثم إعادة طرح الطلب أو إعادته للمراجعة.";

export function formatArticleBidProgressLabel(current, required, { isEn = false } = {}) {
  if (!required) return "";
  const cur = Number(current) || 0;
  if (isEn) return `${cur} of ${required} required applicants`;
  return `${cur} من ${required} متقدمين مطلوبين`;
}

export const ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR = "اكتمل العدد المطلوب — بانتظار الإسناد";
export const ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR = "لم يكتمل الحد الأدنى للمناقصات";
export const ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR = "اكتمل العدد المطلوب ولم يعد التقديم متاحًا";

export function formatArticleBidCollectionLabel(bidCollection, { isEn = false, articleStatus = null } = {}) {
  if (!bidCollection) return "";
  if (bidCollection.label) return bidCollection.label;
  const required = bidCollection.requiredBidCount ?? bidCollection.required;
  const current = bidCollection.currentBidCount ?? bidCollection.current ?? 0;
  const status = bidCollection.bidCollectionStatus ?? bidCollection.status;
  const outcome = bidCollection.bidCollectionOutcome ?? bidCollection.outcome;
  if (status === "minimum_not_met" || outcome === "minimum_not_met") {
    return isEn ? "Minimum required bids were not met" : ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR;
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
      return isEn
        ? "Required count reached; applications are closed."
        : ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR;
    }
    return isEn
      ? "Required count reached — awaiting assignment"
      : ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR;
  }
  return formatArticleBidProgressLabel(current, required, { isEn });
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

export const ARTICLE_FAIR_RANKING_DISCLAIMER_AR =
  "هذا الترتيب إرشادي مبني على قواعد التوزيع العادل، والإسناد ما زال يتطلب تأكيد السوبر أدمن.";

export const ARTICLE_FAIR_RANKING_PENDING_AR = "سيظهر ترتيب التوزيع العادل بعد اكتمال العدد المطلوب.";

export const ARTICLE_FAIR_OVERRIDE_CONFIRM_AR =
  "هذا المتقدم ليس المرشح الأول حسب التوزيع العادل. هل تريد المتابعة؟";

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

export function formatActivationAttachmentBadge(article, campaigns = [], { isEn = false } = {}) {
  if (!article?.activationCampaignId) return "";
  const campaign = (Array.isArray(campaigns) ? campaigns : []).find(
    (c) => String(c.id) === String(article.activationCampaignId),
  );
  const wave = (campaign?.waves || []).find((w) => String(w.id) === String(article.activationWaveId));
  const campaignLabel = campaign?.name || (isEn ? `Campaign ${article.activationCampaignId}` : `حملة ${article.activationCampaignId}`);
  if (!article.activationWaveId) return campaignLabel;
  const waveLabel = wave?.name || (isEn ? `Wave ${article.activationWaveId}` : `موجة ${article.activationWaveId}`);
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

export function validateMarketplaceArticleForm(form, { packageRequirements = null } = {}) {
  const errors = {};
  const title = String(form.title || "").trim();
  if (!title) errors.title = "العنوان مطلوب.";
  if (title.length > 240) errors.title = "العنوان طويل جداً.";
  const planCode = normalizePackagePlanCode(form.targetPlanCode);
  if (!planCode) {
    errors.targetPlanCode = "يجب اختيار الخطة المستهدفة.";
  } else {
    const req = requirementsForPlanCode(planCode, packageRequirements);
    if (!req || !req.minWords) {
      errors.targetPlanCode = "تعذر قراءة متطلبات هذه الخطة.";
    }
  }
  if (!ARTICLE_STATUSES.includes(String(form.status || ""))) {
    errors.status = "حالة غير صالحة.";
  }
  if (!String(form.bildazoCategoryId || "").trim()) {
    errors.bildazoCategoryId = "يجب اختيار صنف بلدازو.";
  }
  if (!normalizeWritingMode(form.writingMode)) {
    errors.writingMode = "يجب اختيار نمط الكتابة.";
  }
  const requiredBidCount = Number(form.requiredBidCount);
  const inventoryMode = Boolean(form.inventorySimplified || form.allowFlexibleBidCount);
  if (inventoryMode) {
    if (
      !Number.isInteger(requiredBidCount) ||
      requiredBidCount < ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MIN ||
      requiredBidCount > ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MAX
    ) {
      errors.requiredBidCount = `أدخل عدداً بين ${ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MIN} و ${ARTICLE_INVENTORY_REQUIRED_BID_COUNT_MAX}.`;
    }
  } else {
    const allowed = Array.isArray(form.allowedRequiredBidCounts)
      ? form.allowedRequiredBidCounts
      : ARTICLE_ALLOWED_REQUIRED_BID_COUNTS;
    const minRequired = Number(form.minRequiredBids) || ARTICLE_MIN_REQUIRED_BIDS;
    if (!Number.isInteger(requiredBidCount) || requiredBidCount < minRequired) {
      errors.requiredBidCount = `الحد الأدنى للمناقصات هو ${minRequired}.`;
    } else if (!allowed.includes(requiredBidCount)) {
      errors.requiredBidCount = `اختر أحد القيم: ${allowed.join("، ")}.`;
    }
    if (!form.minRequiredBidsAcknowledged) {
      errors.minRequiredBidsAcknowledged = "يجب الإقرار بالتحذير قبل الحفظ.";
    }
  }

  const durationHours = Number(form.bidCollectionDurationHours);
  if (
    !Number.isInteger(durationHours) ||
    durationHours < 1 ||
    durationHours > 168
  ) {
    errors.bidCollectionDurationHours = "اختر مدة استقبال التقديمات (1–168 ساعة).";
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
export function validateFreelancerManuscriptForm(form, requirements = {}) {
  const errors = {};
  const title = String(form.title || "").trim();
  if (!title) errors.title = "عنوان المقال النهائي مطلوب.";
  const content = String(form.content || "").trim();
  if (!content) errors.content = "محتوى المقال النهائي مطلوب.";
  const requiredWords = Number(requirements.requiredWordCount) || 0;
  if (requiredWords > 0 && content) {
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < requiredWords) {
      errors.content = `يجب ألا يقل المقال عن ${requiredWords} كلمة.`;
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
      errors.referencesText = `يجب إضافة ${requiredRefs} مرجعًا على الأقل.`;
    }
  }
  const writingSource = normalizeWritingSource(form.writingSource);
  if (!writingSource) {
    errors.writingSource = "يجب تحديد طريقة الكتابة (بشري أو بمساعدة الذكاء الاصطناعي).";
  } else if (
    requirements.writingMode &&
    !writingSourceSatisfiesMode(writingSource, requirements.writingMode)
  ) {
    errors.writingSource = "طريقة الكتابة لا تطابق متطلبات المقال.";
  }
  if (!form.termsAccepted) {
    errors.termsAccepted = "يجب الموافقة على شروط ملكية ونشر المقال قبل التسليم.";
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
