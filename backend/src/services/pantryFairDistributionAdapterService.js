/**
 * Pantry House Fair Distribution Adapter (Phase 3B).
 *
 * Ranking only — does NOT auto-assign.
 * Does not persist into fair_distribution_decisions (that table is order_id unique).
 * Does not fake order_id. Does not touch ordersService, Stripe, or freelancer Pantry UI.
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
 * Missing Pantry-specific metrics (documented):
 *   - Pantry win/loss history is not stored in fair_distribution_events
 *   - Pantry assignment counts are not in orders.received_at
 *   Fallback: order-scoped category metrics when pantry category_id exists; otherwise zeros,
 *   then submittedAt ASC, then bidId ASC.
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

const PANTRY_FAIR_RANKING_VERSION = "pantry_fair_adapter_v1";
const PANTRY_FAIR_RANKING_SOURCE = "fair_distribution_adapter";

const PANTRY_FAIR_RANKING_ELIGIBLE_STATUSES = Object.freeze(["pending"]);

const PANTRY_FAIR_METRICS_NOTES = Object.freeze({
  used: [
    "recentEffectiveAssignmentsCount (orders in pantry request category/subcategory)",
    "appliedAndLostWaitingCount (order bid losses in scope)",
    "activeWorkloadCount (active orders)",
    "lastEffectiveAssignmentAt (orders in scope)",
    "submittedAt (pantry bid created_at)",
    "bidId (stable tie-break)",
  ],
  missing: [
    "pantry-specific assignment history",
    "pantry waiting-loss events",
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
    bidId: String(candidate.bidId),
    freelancerUserId: String(candidate.freelancerUserId),
    freelancerName: candidate.freelancerName || null,
    status: candidate.status,
    amount: candidate.amount != null ? Number(candidate.amount) : null,
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

function rankPantryFairCandidates(candidates) {
  const eligible = (candidates || []).filter((c) => c.eligible !== false);
  const ranked = fairDist.rankFairDistributionCandidates(eligible, {
    includePriorityTokens: false,
  });
  return ranked.map((c, i) => ({ ...c, rank: i + 1 }));
}

function buildNotEligiblePayload(progress, extra = {}) {
  return {
    pantryRequestId: extra.pantryRequestId != null ? String(extra.pantryRequestId) : null,
    collectionRoundId: progress?.roundId || extra.collectionRoundId || null,
    requiredBidCount: progress?.requiredBidCount ?? progress?.required ?? extra.requiredBidCount ?? null,
    currentBidCount: progress?.currentBidCount ?? progress?.current ?? 0,
    bidCollectionStatus: progress?.bidCollectionStatus ?? progress?.status ?? null,
    eligibleForAssignment: false,
    recommendedBidId: null,
    candidates: [],
    rankingSource: PANTRY_FAIR_RANKING_SOURCE,
    rankingVersion: PANTRY_FAIR_RANKING_VERSION,
    autoAssigned: false,
    metricsNotes: PANTRY_FAIR_METRICS_NOTES,
    messageAr: "سيظهر ترتيب التوزيع العادل بعد اكتمال العدد المطلوب.",
    messageEn: "Fair ranking appears after the required applicant count is reached.",
    ...extra,
  };
}

async function loadEligibleBids(db, pantryRequestId, roundId) {
  const statuses = [...PANTRY_FAIR_RANKING_ELIGIBLE_STATUSES];
  try {
    if (roundId != null) {
      const { rows } = await db.query(
        `SELECT b.id, b.pantry_request_id, b.freelancer_id, b.status, b.amount, b.created_at,
                b.collection_round_id,
                NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
           FROM pantry_bids b
           JOIN users u ON u.id = b.freelancer_id
          WHERE b.pantry_request_id = $1
            AND b.status = ANY($3::text[])
            AND (b.collection_round_id = $2 OR b.collection_round_id IS NULL)
          ORDER BY b.created_at ASC, b.id ASC`,
        [Number(pantryRequestId), Number(roundId), statuses],
      );
      return rows;
    }
    const { rows } = await db.query(
      `SELECT b.id, b.pantry_request_id, b.freelancer_id, b.status, b.amount, b.created_at,
              b.collection_round_id,
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
         FROM pantry_bids b
         JOIN users u ON u.id = b.freelancer_id
        WHERE b.pantry_request_id = $1
          AND b.status = ANY($2::text[])
        ORDER BY b.created_at ASC, b.id ASC`,
      [Number(pantryRequestId), statuses],
    );
    return rows;
  } catch (err) {
    if (err?.code !== "42703") throw err;
    const { rows } = await db.query(
      `SELECT b.id, b.pantry_request_id, b.freelancer_id, b.status, b.amount, b.created_at,
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
         FROM pantry_bids b
         JOIN users u ON u.id = b.freelancer_id
        WHERE b.pantry_request_id = $1
          AND b.status = ANY($2::text[])
        ORDER BY b.created_at ASC, b.id ASC`,
      [Number(pantryRequestId), statuses],
    );
    return rows;
  }
}

async function getPantryFairRanking(pantryRequestId, { client: db = pool } = {}) {
  const pid = Number(pantryRequestId);
  if (!Number.isInteger(pid) || pid < 1) {
    throw createAppError("طلب بيت المونة غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "NOT_FOUND",
    });
  }

  const collectionService = require("./opportunityBidCollectionService");
  const progress = await collectionService.getPantryBidCollectionProgress(pid, { client: db });
  let pantry;
  try {
    const { rows } = await db.query(
      `SELECT id, category_id, subcategory_id, current_bid_collection_round_id,
              required_bid_count, status
         FROM pantry_requests
        WHERE id = $1`,
      [pid],
    );
    pantry = rows[0];
  } catch (err) {
    if (err?.code === "42703") {
      const { rows } = await db.query(
        `SELECT id, category_id, subcategory_id, status FROM pantry_requests WHERE id = $1`,
        [pid],
      );
      pantry = rows[0];
    } else {
      throw err;
    }
  }
  if (!pantry) {
    throw createAppError("طلب بيت المونة غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "NOT_FOUND",
    });
  }

  const required = pantry.required_bid_count != null ? Number(pantry.required_bid_count) : null;
  const roundId = pantry.current_bid_collection_round_id || null;
  const status = progress?.bidCollectionStatus || progress?.status || null;

  if (!Number.isInteger(required) || required < 1) {
    return buildNotEligiblePayload(progress, {
      pantryRequestId: pid,
      collectionRoundId: roundId ? String(roundId) : null,
      requiredBidCount: null,
      rankingSkipped: true,
    });
  }

  const eligibleForAssignment = isThresholdStatus(status);
  if (!eligibleForAssignment) {
    return buildNotEligiblePayload(progress, {
      pantryRequestId: pid,
      collectionRoundId: roundId ? String(roundId) : null,
      requiredBidCount: required,
    });
  }

  const bids = await loadEligibleBids(db, pid, roundId);
  const settings = await getMarketplaceEconomySettings(db);
  const lookbackDays = Number(settings.fairDistributionLookbackDays) || 30;
  const scope = fairDist.resolveFairnessScope(pantry);
  const hasScope = Boolean(scope.categoryId || scope.subcategoryId);

  const built = [];
  for (const bid of bids) {
    let metrics = emptyMetrics();
    if (hasScope) {
      try {
        // eslint-disable-next-line no-await-in-loop
        metrics = await fairDist.computeCandidateMetrics({
          client: db,
          freelancerUserId: bid.freelancer_id,
          scope,
          lookbackDays,
        });
      } catch {
        metrics = emptyMetrics();
      }
    }
    built.push({
      bidId: bid.id,
      freelancerUserId: bid.freelancer_id,
      freelancerName: bid.freelancer_name || null,
      status: bid.status,
      amount: bid.amount,
      submittedAt: bid.created_at,
      eligible: bid.status === "pending",
      candidateKey: `pantry_bid:${bid.id}`,
      stableId: String(bid.id),
      priorityBidTokens: null,
      recentEffectiveAssignmentsCount: Number(metrics.recentEffectiveAssignmentsCount) || 0,
      appliedAndLostWaitingCount: Number(metrics.appliedAndLostWaitingCount) || 0,
      activeWorkloadCount: Number(metrics.activeWorkloadCount) || 0,
      lastEffectiveAssignmentAt: metrics.lastEffectiveAssignmentAt || null,
    });
  }

  const ranked = rankPantryFairCandidates(built);
  const publicCandidates = ranked.map((c, i) => toPublicCandidate(c, i + 1));
  const recommended = publicCandidates[0] || null;

  return {
    pantryRequestId: String(pid),
    collectionRoundId: roundId != null ? String(roundId) : null,
    requiredBidCount: progress?.requiredBidCount ?? progress?.required ?? required,
    currentBidCount: progress?.currentBidCount ?? progress?.current ?? publicCandidates.length,
    bidCollectionStatus: status,
    eligibleForAssignment: true,
    recommendedBidId: recommended ? recommended.bidId : null,
    candidates: publicCandidates,
    rankingSource: PANTRY_FAIR_RANKING_SOURCE,
    rankingVersion: PANTRY_FAIR_RANKING_VERSION,
    autoAssigned: false,
    metricsNotes: PANTRY_FAIR_METRICS_NOTES,
  };
}

module.exports = {
  PANTRY_FAIR_RANKING_VERSION,
  PANTRY_FAIR_RANKING_SOURCE,
  PANTRY_FAIR_RANKING_ELIGIBLE_STATUSES,
  PANTRY_FAIR_METRICS_NOTES,
  rankPantryFairCandidates,
  toPublicCandidate,
  getPantryFairRanking,
  buildNotEligiblePayload,
};
