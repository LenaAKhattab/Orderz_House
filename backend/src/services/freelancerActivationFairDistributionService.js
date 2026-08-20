/**
 * Phase A4.3 — unique-trial fair distribution scoring.
 * Recommendation order only. Does not assign, reserve Bids, or spend budget.
 */

const { pool } = require("../config/db");
const {
  FREELANCER_ACTIVATION_PAID_TIER_CODES,
} = require("../constants/freelancerActivationEngine");
const {
  ACTIVATION_FAIR_RANKING_VERSION,
  ACTIVATION_FAIR_RANK_GROUPS,
  ACTIVATION_FAIR_REASON_TAGS,
  ACTIVATION_FAIR_NOT_AVAILABLE,
} = require("../constants/freelancerActivationFairDistribution");

const DAY_MS = 24 * 60 * 60 * 1000;

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toOptionalNumber(value) {
  if (value == null || value === ACTIVATION_FAIR_NOT_AVAILABLE) {
    return ACTIVATION_FAIR_NOT_AVAILABLE;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : ACTIVATION_FAIR_NOT_AVAILABLE;
}

function toOptionalBoolean(value) {
  if (value == null || value === ACTIVATION_FAIR_NOT_AVAILABLE) {
    return ACTIVATION_FAIR_NOT_AVAILABLE;
  }
  if (value === true || value === false) return value;
  return ACTIVATION_FAIR_NOT_AVAILABLE;
}

function parseTime(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function uniqueTags(tags) {
  const out = [];
  const seen = new Set();
  for (const tag of tags || []) {
    const key = String(tag || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function emptyActivationFairContext() {
  return {
    trialStatus: null,
    trialStartedAt: null,
    firstBidAt: null,
    acceptedActivationWorkCount: 0,
    publishedActivationWorkCount: 0,
    hasPreviousWin: false,
    activeAssignedWorkCount: 0,
    hasActivePaidSilver: false,
    trainingScore: ACTIVATION_FAIR_NOT_AVAILABLE,
    categoryMatch: ACTIVATION_FAIR_NOT_AVAILABLE,
  };
}

function shouldApplyActivationFairRanking({ engineEnabled, article } = {}) {
  return Boolean(engineEnabled) && article?.activation_campaign_id != null;
}

function receivesTrialFirstBoost(context = {}) {
  return String(context.trialStatus || "") === "trial_active" && !context.hasActivePaidSilver;
}

function waitAnchorMs(application = {}, context = {}) {
  return parseTime(context.trialStartedAt)
    || parseTime(context.firstBidAt)
    || parseTime(application.submittedAt)
    || null;
}

function waitingDaysAt(application, context, now) {
  const anchor = waitAnchorMs(application, context);
  if (anchor == null) return 0;
  return Math.max(0, Math.floor((now.getTime() - anchor) / DAY_MS));
}

function resolveRankGroup({ trialBoost, totalWorks, hasActivePaidSilver }) {
  if (trialBoost && totalWorks === 0) return ACTIVATION_FAIR_RANK_GROUPS.FIRST_ACTIVATION;
  if (trialBoost) return ACTIVATION_FAIR_RANK_GROUPS.TRIAL_ACTIVATION;
  if (hasActivePaidSilver) return ACTIVATION_FAIR_RANK_GROUPS.PAID_MEMBERSHIP;
  return ACTIVATION_FAIR_RANK_GROUPS.STANDARD;
}

function buildExplanation({ trialBoost, totalWorks, accepted, hasPreviousWin, activeAssigned, waitingDays, isEn }) {
  const parts = [];
  if (trialBoost && totalWorks === 0) {
    parts.push(isEn ? "First work opportunity" : "أول فرصة عمل");
  } else if (trialBoost && accepted === 0) {
    parts.push(isEn ? "No previously accepted activation work" : "لم يحصل على عمل مقبول سابقًا");
  }
  if (!hasPreviousWin && !(trialBoost && totalWorks === 0)) {
    parts.push(isEn ? "No previous win" : "لم يحصل على فوز سابق");
  }
  if (activeAssigned === 0) {
    parts.push(isEn ? "Low current workload" : "عبء عمل منخفض");
  }
  if (waitingDays > 0) {
    parts.push(isEn ? `Waiting ${waitingDays} days` : `ينتظر منذ ${waitingDays} أيام`);
  }
  if (!parts.length) {
    return isEn
      ? "Queued by unique-trial activation fairness"
      : "في الترتيب حسب عدالة تفعيل المستقلين";
  }
  return parts.join(" · ");
}

function computeActivationFairnessScoreValue({
  trialBoost,
  totalWorks,
  hasPreviousWin,
  waitingDays,
  activeAssigned,
  trainingScore,
  categoryMatch,
}) {
  let score = 0;
  if (trialBoost) score += 100000;
  if (trialBoost && totalWorks === 0) score += 50000;
  score -= totalWorks * 2000;
  if (!hasPreviousWin) score += 500;
  score += Math.min(waitingDays, 60) * 15;
  score -= activeAssigned * 80;
  if (typeof trainingScore === "number") {
    score += Math.min(Math.max(trainingScore, 0), 100);
  }
  if (categoryMatch === true) score += 25;
  return score;
}

/**
 * Pure scorer. Ranking uses compareActivationFairCandidates, not this numeric score.
 */
function computeActivationFairDistributionScore(application = {}, contextInput = {}, { now = new Date() } = {}) {
  const context = { ...emptyActivationFairContext(), ...contextInput };
  const accepted = Math.max(0, toInt(context.acceptedActivationWorkCount, 0));
  const published = Math.max(0, toInt(context.publishedActivationWorkCount, 0));
  const totalWorks = accepted + published;
  const hasPreviousWin = Boolean(context.hasPreviousWin) || accepted > 0 || published > 0;
  const activeAssigned = Math.max(0, toInt(
    context.activeAssignedWorkCount != null
      ? context.activeAssignedWorkCount
      : application.activeWorkloadCount,
    0,
  ));
  const trainingScore = toOptionalNumber(context.trainingScore);
  const categoryMatch = toOptionalBoolean(context.categoryMatch);
  const trialBoost = receivesTrialFirstBoost(context);
  const waitingDays = waitingDaysAt(application, context, now);
  const rankGroup = resolveRankGroup({
    trialBoost,
    totalWorks,
    hasActivePaidSilver: Boolean(context.hasActivePaidSilver),
  });
  const reasonTags = uniqueTags([
    trialBoost && totalWorks === 0 ? ACTIVATION_FAIR_REASON_TAGS.FIRST_WORK_OPPORTUNITY : null,
    trialBoost && accepted === 0 ? ACTIVATION_FAIR_REASON_TAGS.NO_PREVIOUS_ACCEPTED_WORK : null,
    !hasPreviousWin ? ACTIVATION_FAIR_REASON_TAGS.NO_PREVIOUS_WIN : null,
    activeAssigned === 0 ? ACTIVATION_FAIR_REASON_TAGS.LOW_WORKLOAD : null,
    waitingDays > 0 ? ACTIVATION_FAIR_REASON_TAGS.WAITING : null,
    context.hasActivePaidSilver ? ACTIVATION_FAIR_REASON_TAGS.PAID_MEMBERSHIP : null,
    trainingScore === ACTIVATION_FAIR_NOT_AVAILABLE
      ? ACTIVATION_FAIR_REASON_TAGS.TRAINING_NOT_AVAILABLE
      : null,
    categoryMatch === ACTIVATION_FAIR_NOT_AVAILABLE
      ? ACTIVATION_FAIR_REASON_TAGS.CATEGORY_MATCH_NOT_AVAILABLE
      : null,
  ]);

  return {
    score: computeActivationFairnessScoreValue({
      trialBoost,
      totalWorks,
      hasPreviousWin,
      waitingDays,
      activeAssigned,
      trainingScore,
      categoryMatch,
    }),
    rankGroup,
    reasonTags,
    receivesTrialFirstBoost: trialBoost,
    explanationAr: buildExplanation({
      trialBoost,
      totalWorks,
      accepted,
      hasPreviousWin,
      activeAssigned,
      waitingDays,
      isEn: false,
    }),
    explanationEn: buildExplanation({
      trialBoost,
      totalWorks,
      accepted,
      hasPreviousWin,
      activeAssigned,
      waitingDays,
      isEn: true,
    }),
    metrics: {
      acceptedActivationWorkCount: accepted,
      publishedActivationWorkCount: published,
      hasPreviousWin,
      activeAssignedWorkCount: activeAssigned,
      trialStartedAt: context.trialStartedAt || null,
      firstBidAt: context.firstBidAt || null,
      waitingDays,
      trainingScore,
      categoryMatch,
    },
  };
}

function compareActivationFairCandidates(aScore, bScore, aCandidate = {}, bCandidate = {}) {
  const aBoost = Boolean(aScore?.receivesTrialFirstBoost);
  const bBoost = Boolean(bScore?.receivesTrialFirstBoost);
  if (aBoost !== bBoost) return aBoost ? -1 : 1;

  const aWorks = toInt(aScore?.metrics?.acceptedActivationWorkCount, 0)
    + toInt(aScore?.metrics?.publishedActivationWorkCount, 0);
  const bWorks = toInt(bScore?.metrics?.acceptedActivationWorkCount, 0)
    + toInt(bScore?.metrics?.publishedActivationWorkCount, 0);
  if (aWorks !== bWorks) return aWorks - bWorks;

  const aWin = Boolean(aScore?.metrics?.hasPreviousWin);
  const bWin = Boolean(bScore?.metrics?.hasPreviousWin);
  if (aWin !== bWin) return aWin ? 1 : -1;

  const aWait = waitAnchorMs(aCandidate, {
    trialStartedAt: aScore?.metrics?.trialStartedAt,
    firstBidAt: aScore?.metrics?.firstBidAt,
  });
  const bWait = waitAnchorMs(bCandidate, {
    trialStartedAt: bScore?.metrics?.trialStartedAt,
    firstBidAt: bScore?.metrics?.firstBidAt,
  });
  if (aWait == null && bWait != null) return 1;
  if (aWait != null && bWait == null) return -1;
  if (aWait != null && bWait != null && aWait !== bWait) return aWait - bWait;

  const aLoad = toInt(aScore?.metrics?.activeAssignedWorkCount, 0);
  const bLoad = toInt(bScore?.metrics?.activeAssignedWorkCount, 0);
  if (aLoad !== bLoad) return aLoad - bLoad;

  const aTrain = aScore?.metrics?.trainingScore;
  const bTrain = bScore?.metrics?.trainingScore;
  if (typeof aTrain === "number" && typeof bTrain === "number" && aTrain !== bTrain) {
    return bTrain - aTrain;
  }

  const aCat = aScore?.metrics?.categoryMatch;
  const bCat = bScore?.metrics?.categoryMatch;
  if (aCat === true && bCat === false) return -1;
  if (aCat === false && bCat === true) return 1;

  const aid = Number(aCandidate.applicationId ?? aCandidate.stableId);
  const bid = Number(bCandidate.applicationId ?? bCandidate.stableId);
  if (Number.isFinite(aid) && Number.isFinite(bid) && aid !== bid) return aid - bid;
  const as = String(aCandidate.stableId || aCandidate.applicationId || "");
  const bs = String(bCandidate.stableId || bCandidate.applicationId || "");
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function applyActivationFairRanking(candidates, contextByUserId = new Map(), { now = new Date() } = {}) {
  const scored = (candidates || []).map((candidate) => {
    const userId = Number(candidate.freelancerUserId);
    const context = contextByUserId.get(userId) || emptyActivationFairContext();
    const activationFairness = computeActivationFairDistributionScore(
      candidate,
      context,
      { now },
    );
    return { ...candidate, activationFairness };
  });
  scored.sort((a, b) => compareActivationFairCandidates(
    a.activationFairness,
    b.activationFairness,
    a,
    b,
  ));
  return scored.map((candidate, index) => {
    const tags = index === 0
      ? uniqueTags([
        ACTIVATION_FAIR_REASON_TAGS.PREFERRED_ACTIVATION_CANDIDATE,
        ...(candidate.activationFairness.reasonTags || []),
      ])
      : candidate.activationFairness.reasonTags;
    return {
      ...candidate,
      rank: index + 1,
      activationFairness: {
        ...candidate.activationFairness,
        reasonTags: tags,
      },
    };
  });
}

function resolveArticleFairRankingOrder(built, existingRankFn, activation = { applied: false }) {
  const existing = existingRankFn(built);
  if (!activation.applied) {
    return { ranked: existing, activationFairRankingApplied: false };
  }
  return {
    ranked: applyActivationFairRanking(existing, activation.contextByUserId, {
      now: activation.now,
    }),
    activationFairRankingApplied: true,
  };
}

async function loadActivationFairContextMap(client, { freelancerUserIds } = {}) {
  const runner = client || pool;
  const ids = [...new Set((freelancerUserIds || []).map((id) => Number(id)).filter((id) => id >= 1))];
  const map = new Map();
  for (const id of ids) map.set(id, emptyActivationFairContext());
  if (!ids.length) return map;

  try {
    const { rows } = await runner.query(
      `SELECT freelancer_user_id, status, started_at, first_bid_at,
              accepted_work_count, published_work_count
         FROM freelancer_activation_trials
        WHERE freelancer_user_id = ANY($1::bigint[])`,
      [ids],
    );
    for (const row of rows) {
      const ctx = map.get(Number(row.freelancer_user_id));
      if (!ctx) continue;
      ctx.trialStatus = row.status || null;
      ctx.trialStartedAt = row.started_at || null;
      ctx.firstBidAt = row.first_bid_at || null;
      ctx.acceptedActivationWorkCount = toInt(row.accepted_work_count, 0);
      ctx.publishedActivationWorkCount = toInt(row.published_work_count, 0);
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }

  try {
    const { rows } = await runner.query(
      `SELECT m.freelancer_user_id, p.tier_code
         FROM freelancer_marketplace_memberships m
         JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
        WHERE m.freelancer_user_id = ANY($1::bigint[])
          AND m.is_current = TRUE
          AND m.status IN ('active', 'cancel_at_period_end')`,
      [ids],
    );
    for (const row of rows) {
      const ctx = map.get(Number(row.freelancer_user_id));
      if (!ctx) continue;
      const tier = String(row.tier_code || "").toLowerCase();
      ctx.hasActivePaidSilver = FREELANCER_ACTIVATION_PAID_TIER_CODES.includes(tier);
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }

  try {
    const { rows } = await runner.query(
      `SELECT freelancer_user_id,
              COUNT(*) FILTER (
                WHERE status IN ('selected', 'revision_requested')
              )::int AS active_assigned,
              COUNT(*) FILTER (
                WHERE status IN ('selected', 'approved', 'revision_requested')
              )::int AS previous_wins,
              COUNT(*) FILTER (WHERE status = 'approved')::int AS accepted_apps
         FROM marketplace_article_applications
        WHERE freelancer_user_id = ANY($1::bigint[])
          AND activation_campaign_id IS NOT NULL
        GROUP BY freelancer_user_id`,
      [ids],
    );
    for (const row of rows) {
      const ctx = map.get(Number(row.freelancer_user_id));
      if (!ctx) continue;
      ctx.activeAssignedWorkCount = toInt(row.active_assigned, 0);
      ctx.hasPreviousWin = toInt(row.previous_wins, 0) > 0 || ctx.acceptedActivationWorkCount > 0;
      ctx.acceptedActivationWorkCount = Math.max(
        ctx.acceptedActivationWorkCount,
        toInt(row.accepted_apps, 0),
      );
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }

  try {
    const { rows } = await runner.query(
      `SELECT a.freelancer_user_id, COUNT(*)::int AS published_count
         FROM bildazo_article_publish_records p
         JOIN marketplace_article_applications a
           ON a.id = p.orderz_application_id
        WHERE a.freelancer_user_id = ANY($1::bigint[])
          AND a.activation_campaign_id IS NOT NULL
          AND p.status IN ('published', 'already_imported')
        GROUP BY a.freelancer_user_id`,
      [ids],
    );
    for (const row of rows) {
      const ctx = map.get(Number(row.freelancer_user_id));
      if (!ctx) continue;
      ctx.publishedActivationWorkCount = Math.max(
        ctx.publishedActivationWorkCount,
        toInt(row.published_count, 0),
      );
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }

  for (const ctx of map.values()) {
    if (ctx.acceptedActivationWorkCount > 0 || ctx.publishedActivationWorkCount > 0) {
      ctx.hasPreviousWin = true;
    }
    ctx.trainingScore = ACTIVATION_FAIR_NOT_AVAILABLE;
    ctx.categoryMatch = ACTIVATION_FAIR_NOT_AVAILABLE;
  }

  return map;
}

module.exports = {
  ACTIVATION_FAIR_RANKING_VERSION,
  emptyActivationFairContext,
  shouldApplyActivationFairRanking,
  computeActivationFairDistributionScore,
  compareActivationFairCandidates,
  applyActivationFairRanking,
  resolveArticleFairRankingOrder,
  loadActivationFairContextMap,
};
