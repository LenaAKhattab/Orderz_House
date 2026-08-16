/**
 * Mini Bid Article Fair Distribution Adapter (Phase 2B).
 *
 * Ranking only — does NOT auto-assign.
 * Does not persist into fair_distribution_decisions (that table is order_id unique).
 * Does not fake order_id. Does not touch ordersService, Stripe, or Pantry.
 *
 * Reused from marketplaceFairDistributionService:
 *   - rankFairDistributionCandidates / compareFairDistributionCandidates (pure lexicographic sort)
 *   - resolveFairnessScope + computeCandidateMetrics (order-category workload / recent assignments)
 *
 * Not reused:
 *   - decideFairDistributionFirst persist path
 *   - fair_distribution_decisions.order_id
 *   - Priority Token tie-break
 *
 * Missing article-specific metrics (documented):
 *   - Mini Bid Article win/loss history is not stored in fair_distribution_events
 *   - Article assignment counts are not in orders.received_at
 *   Fallback: order-scoped category metrics when category_id exists; otherwise zeros,
 *   then submittedAt ASC, then applicationId ASC.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
} = require("./marketplaceEconomySettingsService");
const fairDist = require("./marketplaceFairDistributionService");
const {
  isThresholdStatus,
} = require("../constants/opportunityBidCollection");
const {
  ARTICLE_APPLICATION_ERROR_CODES,
} = require("../constants/marketplaceArticleApplications");

const ARTICLE_FAIR_RANKING_VERSION = "article_fair_adapter_v1";
const ARTICLE_FAIR_RANKING_SOURCE = "fair_distribution_adapter";

const ARTICLE_FAIR_RANKING_ELIGIBLE_STATUSES = Object.freeze(["pending", "selected"]);

const ARTICLE_FAIR_METRICS_NOTES = Object.freeze({
  used: [
    "recentEffectiveAssignmentsCount (orders in article category/subcategory)",
    "appliedAndLostWaitingCount (order bid losses in scope)",
    "activeWorkloadCount (active orders)",
    "lastEffectiveAssignmentAt (orders in scope)",
    "submittedAt (article application)",
    "applicationId (stable tie-break)",
  ],
  missing: [
    "article-specific assignment history",
    "article waiting-loss events",
    "priority tokens (intentionally omitted)",
  ],
});

function emptyMetrics() {
  return {
    recentEffectiveAssignmentsCount: 0,
    appliedAndLostWaitingCount: 0,
    activeWorkloadCount: 0,
    lastEffectiveAssignmentAt: null,
  };
}

function rankingReasonLabel(candidate, rank, { isEn = false } = {}) {
  if (rank === 1) {
    return isEn
      ? "Ranked first by fair lexicographic queue"
      : "الأول حسب طابور التوزيع العادل";
  }
  if (candidate.recentEffectiveAssignmentsCount === 0 && candidate.activeWorkloadCount === 0) {
    return isEn ? "Queued by submission time after fair factors" : "في الطابور حسب وقت التقديم بعد عوامل العدل";
  }
  return isEn ? "Queued by fair lexicographic order" : "في الطابور حسب ترتيب التوزيع العادل";
}

function toPublicCandidate(candidate, rank) {
  return {
    rank,
    applicationId: String(candidate.applicationId),
    freelancerUserId: String(candidate.freelancerUserId),
    freelancerName: candidate.freelancerName || null,
    freelancerAccountId: candidate.freelancerAccountId || null,
    status: candidate.status,
    submittedAt: candidate.submittedAt,
    eligible: candidate.eligible !== false,
    rankingReason: rankingReasonLabel(candidate, rank, { isEn: false }),
    rankingReasonEn: rankingReasonLabel(candidate, rank, { isEn: true }),
    metrics: {
      recentEffectiveAssignmentsCount: candidate.recentEffectiveAssignmentsCount,
      appliedAndLostWaitingCount: candidate.appliedAndLostWaitingCount,
      activeWorkloadCount: candidate.activeWorkloadCount,
      lastEffectiveAssignmentAt: candidate.lastEffectiveAssignmentAt,
    },
  };
}

function rankArticleFairCandidates(candidates) {
  const eligible = (candidates || []).filter((c) => c.eligible !== false);
  const ranked = fairDist.rankFairDistributionCandidates(eligible, {
    includePriorityTokens: false,
  });
  return ranked.map((c, i) => ({ ...c, rank: i + 1 }));
}

function buildNotEligiblePayload(progress, extra = {}) {
  return {
    collectionRoundId: progress?.roundId || extra.collectionRoundId || null,
    requiredBidCount: progress?.requiredBidCount ?? progress?.required ?? null,
    currentBidCount: progress?.currentBidCount ?? progress?.current ?? 0,
    bidCollectionStatus: progress?.bidCollectionStatus ?? progress?.status ?? null,
    eligibleForAssignment: false,
    recommendedApplicationId: null,
    candidates: [],
    rankingSource: ARTICLE_FAIR_RANKING_SOURCE,
    rankingVersion: ARTICLE_FAIR_RANKING_VERSION,
    autoAssigned: false,
    metricsNotes: ARTICLE_FAIR_METRICS_NOTES,
    messageAr: "سيظهر ترتيب التوزيع العادل بعد اكتمال العدد المطلوب.",
    messageEn: "Fair ranking appears after the required applicant count is reached.",
    ...extra,
  };
}

async function loadEligibleApplications(db, articleId, roundId) {
  const statuses = [...ARTICLE_FAIR_RANKING_ELIGIBLE_STATUSES];
  try {
    if (roundId != null) {
      const { rows } = await db.query(
        `SELECT a.id, a.article_id, a.freelancer_user_id, a.status, a.submitted_at,
                a.collection_round_id,
                u.first_name AS freelancer_first_name,
                u.family_name AS freelancer_family_name,
                u.account_id AS freelancer_account_id
           FROM marketplace_article_applications a
           JOIN users u ON u.id = a.freelancer_user_id
          WHERE a.article_id = $1
            AND a.status = ANY($3::text[])
            AND (a.collection_round_id = $2 OR a.collection_round_id IS NULL)
          ORDER BY a.submitted_at ASC, a.id ASC`,
        [Number(articleId), Number(roundId), statuses],
      );
      return rows;
    }
    const { rows } = await db.query(
      `SELECT a.id, a.article_id, a.freelancer_user_id, a.status, a.submitted_at,
              a.collection_round_id,
              u.first_name AS freelancer_first_name,
              u.family_name AS freelancer_family_name,
              u.account_id AS freelancer_account_id
         FROM marketplace_article_applications a
         JOIN users u ON u.id = a.freelancer_user_id
        WHERE a.article_id = $1
          AND a.status = ANY($2::text[])
        ORDER BY a.submitted_at ASC, a.id ASC`,
      [Number(articleId), statuses],
    );
    return rows;
  } catch (err) {
    if (err?.code !== "42703") throw err;
    const { rows } = await db.query(
      `SELECT a.id, a.article_id, a.freelancer_user_id, a.status, a.submitted_at,
              u.first_name AS freelancer_first_name,
              u.family_name AS freelancer_family_name,
              u.account_id AS freelancer_account_id
         FROM marketplace_article_applications a
         JOIN users u ON u.id = a.freelancer_user_id
        WHERE a.article_id = $1
          AND a.status = ANY($2::text[])
        ORDER BY a.submitted_at ASC, a.id ASC`,
      [Number(articleId), statuses],
    );
    return rows;
  }
}

async function getArticleFairRanking(articleId, { client: db = pool } = {}) {
  const collectionService = require("./opportunityBidCollectionService");
  const progress = await collectionService.getArticleBidCollectionProgress(articleId, {
    client: db,
  });
  const { rows: articleRows } = await db.query(
    `SELECT id, category_id, subcategory_id, current_bid_collection_round_id,
            required_bid_count, status
       FROM marketplace_articles
      WHERE id = $1`,
    [Number(articleId)],
  );
  const article = articleRows[0];
  if (!article) {
    throw createAppError("Article not found.", 404, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_NOT_FOUND,
    });
  }

  const status = progress?.bidCollectionStatus || progress?.status || null;
  const eligibleForAssignment = isThresholdStatus(status);
  const roundId = article.current_bid_collection_round_id || null;

  if (!eligibleForAssignment) {
    return buildNotEligiblePayload(progress, { collectionRoundId: roundId ? String(roundId) : null });
  }

  const apps = await loadEligibleApplications(db, articleId, roundId);
  const settings = await getMarketplaceEconomySettings(db);
  const lookbackDays = Number(settings.fairDistributionLookbackDays) || 30;
  const scope = fairDist.resolveFairnessScope(article);
  const hasScope = Boolean(scope.categoryId || scope.subcategoryId);

  const built = [];
  for (const app of apps) {
    let metrics = emptyMetrics();
    if (hasScope) {
      try {
        // eslint-disable-next-line no-await-in-loop
        metrics = await fairDist.computeCandidateMetrics({
          client: db,
          freelancerUserId: app.freelancer_user_id,
          scope,
          lookbackDays,
        });
      } catch {
        metrics = emptyMetrics();
      }
    }
    const name = [app.freelancer_first_name, app.freelancer_family_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    built.push({
      applicationId: app.id,
      freelancerUserId: app.freelancer_user_id,
      freelancerName: name || null,
      freelancerAccountId: app.freelancer_account_id || null,
      status: app.status,
      submittedAt: app.submitted_at,
      eligible: app.status === "pending" || app.status === "selected",
      candidateKey: `article_application:${app.id}`,
      stableId: String(app.id),
      priorityBidTokens: null,
      recentEffectiveAssignmentsCount: Number(metrics.recentEffectiveAssignmentsCount) || 0,
      appliedAndLostWaitingCount: Number(metrics.appliedAndLostWaitingCount) || 0,
      activeWorkloadCount: Number(metrics.activeWorkloadCount) || 0,
      lastEffectiveAssignmentAt: metrics.lastEffectiveAssignmentAt || null,
    });
  }

  const ranked = rankArticleFairCandidates(built);
  const publicCandidates = ranked.map((c, i) => toPublicCandidate(c, i + 1));
  const recommended = publicCandidates[0] || null;

  return {
    collectionRoundId: roundId != null ? String(roundId) : null,
    requiredBidCount: progress?.requiredBidCount ?? progress?.required ?? article.required_bid_count,
    currentBidCount: progress?.currentBidCount ?? progress?.current ?? publicCandidates.length,
    bidCollectionStatus: status,
    eligibleForAssignment: true,
    recommendedApplicationId: recommended ? recommended.applicationId : null,
    candidates: publicCandidates,
    rankingSource: ARTICLE_FAIR_RANKING_SOURCE,
    rankingVersion: ARTICLE_FAIR_RANKING_VERSION,
    autoAssigned: false,
    metricsNotes: ARTICLE_FAIR_METRICS_NOTES,
  };
}

function assertApplicationInCurrentRound(articleRow, applicationRow) {
  const currentRoundId = articleRow?.current_bid_collection_round_id;
  if (currentRoundId == null) return;
  const appRound = applicationRow?.collection_round_id;
  if (appRound == null) return;
  if (Number(appRound) !== Number(currentRoundId)) {
    throw createAppError("لا يمكن اختيار متقدم من جولة سابقة.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_WRONG_COLLECTION_ROUND,
    });
  }
}

module.exports = {
  ARTICLE_FAIR_RANKING_VERSION,
  ARTICLE_FAIR_RANKING_SOURCE,
  ARTICLE_FAIR_RANKING_ELIGIBLE_STATUSES,
  ARTICLE_FAIR_METRICS_NOTES,
  rankArticleFairCandidates,
  toPublicCandidate,
  getArticleFairRanking,
  assertApplicationInCurrentRound,
  buildNotEligiblePayload,
};
