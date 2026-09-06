const { BANNER_PRIORITY, STATUS_COPY } = require("../constants/onboarding");

function isBlank(value) {
  return !String(value || "").trim();
}

function areRequiredCoursesComplete(coursesAgg) {
  if (!coursesAgg) return false;
  const total = Number(coursesAgg.total) || 0;
  if (total === 0) return true;
  const completed = Number(coursesAgg.completed) || 0;
  const pendingFinalTest = Number(coursesAgg.pendingFinalTest) || 0;
  return completed === total && pendingFinalTest === 0;
}

/**
 * Display-only facts from existing freelancer rows. Never used for payments.
 */
function buildFreelancerFacts({ userRow, subscription, coursesAgg, welcomeCompleted = false } = {}) {
  const activation = String(subscription?.activationStatus || "").trim().toLowerCase();
  const activated = activation === "company_approved";
  const activationPending = activation === "company_pending";
  const activationRejected = activation === "company_rejected";
  const profileIncomplete = isBlank(userRow?.first_name) || isBlank(userRow?.family_name);
  const verificationIncomplete = userRow?.email_verified === false;
  const trainingComplete = areRequiredCoursesComplete(coursesAgg);
  const trainingIncomplete = !trainingComplete;
  const activationNotRequested =
    !activated && !activationPending && !activationRejected && trainingComplete && !profileIncomplete && !verificationIncomplete;

  return {
    activated,
    activationPending,
    activationRejected,
    profileIncomplete,
    verificationIncomplete,
    trainingComplete,
    trainingIncomplete,
    activationNotRequested,
    welcomeCompleted: Boolean(welcomeCompleted),
    isNew: !activated && !welcomeCompleted,
  };
}

function conditionMatches(conditionKey, facts) {
  switch (String(conditionKey || "")) {
    case "freelancer_new":
      return Boolean(facts.isNew);
    case "profile_incomplete":
      return Boolean(facts.profileIncomplete) && !facts.activated;
    case "verification_incomplete":
      return Boolean(facts.verificationIncomplete) && !facts.activated && !facts.profileIncomplete;
    case "training_incomplete":
      return (
        Boolean(facts.trainingIncomplete) &&
        !facts.activated &&
        !facts.activationPending &&
        !facts.activationRejected &&
        !facts.profileIncomplete &&
        !facts.verificationIncomplete
      );
    case "activation_not_requested":
      return Boolean(facts.activationNotRequested);
    case "activation_pending_review":
      return Boolean(facts.activationPending);
    case "activation_rejected":
      return Boolean(facts.activationRejected);
    case "activated":
      return Boolean(facts.activated);
    case "mini_bid_intro":
    case "article_mini_bid_intro":
      return true;
    default:
      return false;
  }
}

function resolveAccountStatusKey(facts) {
  if (facts.activated) return "activated";
  if (facts.activationRejected) return "activation_rejected";
  if (facts.activationPending) return "activation_pending_review";
  if (facts.activationNotRequested) return "activation_not_requested";
  if (facts.trainingIncomplete && !facts.profileIncomplete && !facts.verificationIncomplete) {
    return "training_incomplete";
  }
  if (facts.profileIncomplete || facts.verificationIncomplete) return "profile_incomplete";
  if (facts.isNew) return "freelancer_new";
  return "profile_incomplete";
}

function computeProgress(facts) {
  const steps = [
    !facts.profileIncomplete,
    !facts.verificationIncomplete,
    facts.trainingComplete,
    facts.activationPending || facts.activated || facts.activationRejected,
    facts.activated,
  ];
  const completedSteps = steps.filter(Boolean).length;
  return {
    completedSteps,
    totalSteps: 5,
    label: `أنجزت ${completedSteps} من 5 خطوات`,
  };
}

function itemIsLive(item, now = new Date()) {
  if (!item?.is_enabled && item?.isEnabled === false) return false;
  if (item.is_enabled === false) return false;
  const starts = item.starts_at || item.startsAt;
  const ends = item.ends_at || item.endsAt;
  if (starts && new Date(starts) > now) return false;
  if (ends && new Date(ends) < now) return false;
  return item.is_enabled !== false && item.isEnabled !== false;
}

function shouldSkipByProgress(item, progress) {
  if (!progress) return false;
  if (progress.completed_at || progress.completedAt) return true;
  const dismissible = item.is_dismissible !== false && item.isDismissible !== false;
  if (dismissible && (progress.dismissed_at || progress.dismissedAt)) return true;
  const maxViews = item.max_views ?? item.maxViews;
  const views = Number(progress.views_count ?? progress.viewsCount) || 0;
  if (maxViews != null && views >= Number(maxViews) && item.item_type !== "required" && item.itemType !== "required") {
    return true;
  }
  return false;
}

function pickBannerItem(items, facts, progressByItemId, now = new Date()) {
  const byCondition = new Map();
  for (const item of items) {
    const placement = item.placement || "";
    if (placement !== "dashboard_banner") continue;
    if (!itemIsLive(item, now)) continue;
    const role = String(item.target_role || item.targetRole || "freelancer");
    if (role !== "freelancer") continue;
    const condition = item.condition_key || item.conditionKey;
    if (!conditionMatches(condition, facts)) continue;
    const progress = progressByItemId.get(String(item.id));
    if (shouldSkipByProgress(item, progress)) continue;
    if (!byCondition.has(condition)) byCondition.set(condition, item);
  }
  for (const key of BANNER_PRIORITY) {
    if (byCondition.has(key)) return byCondition.get(key);
  }
  return null;
}

function compactForItem(item, facts, progress) {
  const views = Number(progress?.views_count ?? progress?.viewsCount) || 0;
  const required = (item.item_type || item.itemType) === "required";
  if (views < 1) return false;
  if (!required && (item.condition_key || item.conditionKey) === "freelancer_new") return true;
  return required || views >= 1;
}

function statusPayload(facts) {
  const key = resolveAccountStatusKey(facts);
  const copy = STATUS_COPY[key] || STATUS_COPY.profile_incomplete;
  return {
    accountStatusKey: key,
    accountStatusLabel: copy.label,
    progress: computeProgress(facts),
  };
}

module.exports = {
  areRequiredCoursesComplete,
  buildFreelancerFacts,
  conditionMatches,
  resolveAccountStatusKey,
  computeProgress,
  pickBannerItem,
  compactForItem,
  statusPayload,
  STATUS_COPY,
};
