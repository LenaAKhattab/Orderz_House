/**
 * Explicit fair-ranking override reason (Phase 4B).
 * Manual select/accept only. Does not auto-assign.
 * Does not write fair_distribution_decisions (order_id unique).
 */

const { createAppError } = require("../utils/AppError");
const {
  BID_COLLECTION_ERROR_CODES,
  ARTICLE_FAIR_OVERRIDE_REASON_REQUIRED_AR,
  OPPORTUNITY_TYPES,
} = require("../constants/opportunityBidCollection");

const FAIR_OVERRIDE_REASON_MIN = 10;
const FAIR_OVERRIDE_REASON_MAX = 500;

function normalizeOverrideReason(value) {
  return String(value || "").trim();
}

function isValidFairOverrideReason(value) {
  const text = normalizeOverrideReason(value);
  return text.length >= FAIR_OVERRIDE_REASON_MIN && text.length <= FAIR_OVERRIDE_REASON_MAX;
}

function assertFairOverrideReason(value, publicCode) {
  const text = normalizeOverrideReason(value);
  if (!isValidFairOverrideReason(text)) {
    throw createAppError(ARTICLE_FAIR_OVERRIDE_REASON_REQUIRED_AR, 400, {
      exposeToClient: true,
      publicCode,
    });
  }
  return text;
}

function recommendedIdFromRanking(ranking, idKey) {
  if (idKey === "bidId") return ranking?.recommendedBidId ?? null;
  return ranking?.recommendedApplicationId ?? null;
}

function needsFairSelectionOverride(ranking, selectedCandidateId, idKey) {
  if (!ranking || ranking.rankingSkipped === true) return false;
  if (ranking.eligibleForAssignment !== true) return false;
  const recommended = recommendedIdFromRanking(ranking, idKey);
  if (recommended == null || recommended === "") return false;
  if (selectedCandidateId == null || selectedCandidateId === "") return false;
  return String(recommended) !== String(selectedCandidateId);
}

function rankForCandidate(ranking, candidateId, idKey) {
  const list = ranking?.candidates || [];
  const hit = list.find((c) => String(c[idKey]) === String(candidateId));
  return hit?.rank != null ? Number(hit.rank) : null;
}

async function recordFairSelectionOverride(client, payload) {
  const sql = `INSERT INTO fair_distribution_selection_overrides (
         opportunity_type, opportunity_id, collection_round_id,
         selected_candidate_id, recommended_candidate_id,
         selected_rank, recommended_rank, override_reason,
         actor_user_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id`;
  const params = [
    payload.opportunityType,
    Number(payload.opportunityId),
    payload.collectionRoundId != null ? Number(payload.collectionRoundId) : null,
    Number(payload.selectedCandidateId),
    payload.recommendedCandidateId != null ? Number(payload.recommendedCandidateId) : null,
    payload.selectedRank != null ? Number(payload.selectedRank) : null,
    payload.recommendedRank != null ? Number(payload.recommendedRank) : 1,
    payload.overrideReason,
    payload.actorUserId != null ? Number(payload.actorUserId) : null,
    JSON.stringify(payload.metadata || {}),
  ];
  try {
    const { rows } = await client.query(sql, params);
    return { overrideRecorded: true, overrideId: rows[0]?.id || null };
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") {
      // eslint-disable-next-line no-console
      console.warn("[fair-override] table not ready (apply 162); reason captured in logs only", {
        opportunityType: payload.opportunityType,
        opportunityId: String(payload.opportunityId),
        selectedCandidateId: String(payload.selectedCandidateId),
        recommendedCandidateId: payload.recommendedCandidateId != null ? String(payload.recommendedCandidateId) : null,
        actorUserId: payload.actorUserId != null ? String(payload.actorUserId) : null,
      });
      return { overrideRecorded: false, overrideId: null, pendingMigration: "162_fair_selection_overrides" };
    }
    throw err;
  }
}

async function enforceFairSelectionOverride({
  client,
  ranking,
  selectedCandidateId,
  idKey,
  overrideReason,
  opportunityType,
  opportunityId,
  collectionRoundId,
  actorUserId,
  publicCode,
} = {}) {
  if (!needsFairSelectionOverride(ranking, selectedCandidateId, idKey)) {
    return { required: false, overrideRecorded: false };
  }
  const reason = assertFairOverrideReason(overrideReason, publicCode);
  const recommendedId = recommendedIdFromRanking(ranking, idKey);
  const recorded = await recordFairSelectionOverride(client, {
    opportunityType,
    opportunityId,
    collectionRoundId: collectionRoundId || ranking?.collectionRoundId || null,
    selectedCandidateId,
    recommendedCandidateId: recommendedId,
    selectedRank: rankForCandidate(ranking, selectedCandidateId, idKey),
    recommendedRank: 1,
    overrideReason: reason,
    actorUserId,
    metadata: {
      rankingSource: ranking?.rankingSource || null,
      rankingVersion: ranking?.rankingVersion || null,
    },
  });
  return { required: true, ...recorded };
}

module.exports = {
  FAIR_OVERRIDE_REASON_MIN,
  FAIR_OVERRIDE_REASON_MAX,
  OPPORTUNITY_TYPES,
  normalizeOverrideReason,
  isValidFairOverrideReason,
  assertFairOverrideReason,
  needsFairSelectionOverride,
  recordFairSelectionOverride,
  enforceFairSelectionOverride,
  BID_COLLECTION_ERROR_CODES,
};
