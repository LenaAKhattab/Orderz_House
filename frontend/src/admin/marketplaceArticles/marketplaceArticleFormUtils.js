/** Marketplace Article admin form helpers — Phase A2 + min required bids. */

export const ARTICLE_LEVELS = [1, 2, 3, 4, 5];
export const ARTICLE_STATUSES = ["draft", "published", "closed", "cancelled"];
export const ARTICLE_ALLOWED_REQUIRED_BID_COUNTS = [10, 15, 20, 30];
export const ARTICLE_MIN_REQUIRED_BIDS = 10;

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
export const ARTICLE_PACKAGE_PLAN_LABELS_AR = Object.freeze({
  STARTER: "تجريبية / مجانية",
  SILVER: "SILVER",
  PRO: "PRO",
  ELITE: "ELITE",
});
export const ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS = Object.freeze({
  STARTER: { minWords: 600, minReferences: 2 },
  SILVER: { minWords: 1200, minReferences: 4 },
  PRO: { minWords: 1800, minReferences: 6 },
  ELITE: { minWords: 2400, minReferences: 8 },
});
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
    articleLevel: 1,
    requiredWordCount: 500,
    requiredReferencesCount: 0,
    status: "draft",
    categoryId: "",
    subcategoryId: "",
    bildazoCategoryId: "",
    bildazoCategoryName: "",
    bildazoCategorySlug: "",
    bildazoCategoryPath: "",
    writingMode: "",
    isFakeOrTraining: false,
    requiredBidCount: ARTICLE_MIN_REQUIRED_BIDS,
    minRequiredBidsAcknowledged: false,
    applicationDeadlineAt: "",
    activationCampaignId: "",
    activationWaveId: "",
    ...overrides,
  };
}

export function articleToMarketplaceFormState(article) {
  if (!article) return getInitialMarketplaceArticleFormState();
  return getInitialMarketplaceArticleFormState({
    title: article.title || "",
    description: article.description || "",
    articleLevel: article.articleLevel ?? 1,
    requiredWordCount: article.requiredWordCount ?? 500,
    requiredReferencesCount: article.requiredReferencesCount ?? 0,
    status: article.status || "draft",
    categoryId: article.categoryId || article.category?.id || "",
    subcategoryId: article.subcategoryId || article.subcategory?.id || "",
    bildazoCategoryId: article.bildazoCategoryId || "",
    bildazoCategoryName: article.bildazoCategoryName || "",
    bildazoCategorySlug: article.bildazoCategorySlug || "",
    bildazoCategoryPath: article.bildazoCategoryPath || "",
    writingMode: normalizeWritingMode(article.writingMode) || "",
    isFakeOrTraining: Boolean(article.isFakeOrTraining),
    requiredBidCount: article.requiredBidCount || ARTICLE_MIN_REQUIRED_BIDS,
    minRequiredBidsAcknowledged: Boolean(article.requiredBidCount),
    applicationDeadlineAt: article.applicationDeadlineAt
      ? String(article.applicationDeadlineAt).slice(0, 16)
      : "",
    activationCampaignId: article.activationCampaignId || "",
    activationWaveId: article.activationWaveId || "",
  });
}

export function validateMarketplaceArticleForm(form) {
  const errors = {};
  const title = String(form.title || "").trim();
  if (!title) errors.title = "العنوان مطلوب.";
  if (title.length > 240) errors.title = "العنوان طويل جداً.";
  const level = Number(form.articleLevel);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    errors.articleLevel = "مستوى المقال يجب أن يكون بين 1 و 5.";
  }
  const words = Number(form.requiredWordCount);
  if (!Number.isInteger(words) || words <= 0) {
    errors.requiredWordCount = "عدد الكلمات يجب أن يكون أكبر من صفر.";
  }
  const refs = Number(form.requiredReferencesCount);
  if (!Number.isInteger(refs) || refs < 0) {
    errors.requiredReferencesCount = "عدد المراجع يجب أن يكون ≥ 0.";
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
  return errors;
}

export function normalizeMarketplaceArticlePayload(form) {
  const articleLevel = Number(form.articleLevel);
  const writingMode = normalizeWritingMode(form.writingMode);
  return {
    title: String(form.title || "").trim(),
    description: String(form.description || "").trim(),
    articleLevel,
    // Value derived on backend; omit client money forge.
    requiredWordCount: Number(form.requiredWordCount),
    requiredReferencesCount: Number(form.requiredReferencesCount) || 0,
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
