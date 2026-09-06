/**
 * Phase 7 — Fair Distribution lexicographic decision engine.
 *
 * COUNT-ONLY / lexicographic queue. NO numeric fairness_score.
 * Eligibility first. Dormant while fair_work_distribution_enabled=false.
 *
 * Sort (FAIR_DISTRIBUTION_FIRST):
 *   recent_effective_assignments_count ASC
 *   applied_and_lost_waiting_count DESC
 *   active_workload_count ASC
 *   last_effective_assignment_at ASC NULLS FIRST
 *   priority_bid_tokens DESC (Priority Auction candidates only)
 *   submitted_at ASC
 *   stable id ASC
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isFairWorkDistributionActive,
} = require("./marketplaceEconomySettingsService");
const {
  FAIR_DISTRIBUTION_ERROR_CODES,
  FAIR_DISTRIBUTION_REASON_CODES,
  FAIR_ACTIVE_WORKLOAD_STATUSES,
} = require("../constants/marketplaceFairDistribution");
const { FREELANCER_FORBIDDEN_FAIRNESS_FIELDS } = require("../constants/marketplaceEconomy");

async function withOwnTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function fairDistributionSchemaReady(client) {
  const { rows } = await client.query(
    `SELECT to_regclass('public.fair_distribution_decisions') AS d,
            to_regclass('public.fair_distribution_events') AS e`,
  );
  return Boolean(rows[0]?.d && rows[0]?.e);
}

function assertHybridNotOperational(strategy) {
  if (String(strategy) === "HYBRID") {
    throw createAppError(
      "HYBRID Fair Distribution weighting policy is not defined for Phase 7 v1.",
      409,
      {
        exposeToClient: true,
        publicCode: FAIR_DISTRIBUTION_ERROR_CODES.FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED,
      },
    );
  }
}

/**
 * Category/subcategory fairness scope for an Order.
 */
function resolveFairnessScope(order) {
  const categoryId = order.category_id != null ? Number(order.category_id) : null;
  const subcategoryId = order.subcategory_id != null ? Number(order.subcategory_id) : null;
  if (Number.isInteger(subcategoryId) && subcategoryId > 0) {
    return {
      scopeKind: "subcategory",
      categoryId: Number.isInteger(categoryId) ? categoryId : null,
      subcategoryId,
    };
  }
  return {
    scopeKind: "category",
    categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null,
    subcategoryId: null,
  };
}

function buildScopeWhere(alias, scope, startParamIndex) {
  if (scope.scopeKind === "subcategory" && scope.subcategoryId) {
    return {
      clause: `${alias}.subcategory_id = $${startParamIndex}`,
      values: [scope.subcategoryId],
      nextIndex: startParamIndex + 1,
    };
  }
  return {
    clause: `${alias}.category_id = $${startParamIndex}`,
    values: [scope.categoryId],
    nextIndex: startParamIndex + 1,
  };
}

/**
 * Effective assignment: assigned Freelancer with received_at set (genuine allocation).
 * Freelancer cancel after award still counts (received_at already set).
 * Client/admin cancel before received_at does not count.
 */
async function listEffectiveAssignments({
  client,
  freelancerUserId,
  scope,
  sinceAt,
}) {
  const params = [Number(freelancerUserId), sinceAt];
  const scopePart = buildScopeWhere("o", scope, 3);
  params.push(...scopePart.values);
  const { rows } = await client.query(
    `SELECT o.id, o.received_at, o.category_id, o.subcategory_id, o.order_status
     FROM orders o
     WHERE o.assigned_freelancer_id = $1
       AND o.received_at IS NOT NULL
       AND o.received_at >= $2::timestamptz
       AND ${scopePart.clause}
     ORDER BY o.received_at DESC`,
    params,
  );
  return rows;
}

async function getLastEffectiveAssignmentAt({ client, freelancerUserId, scope }) {
  const params = [Number(freelancerUserId)];
  const scopePart = buildScopeWhere("o", scope, 2);
  params.push(...scopePart.values);
  const { rows } = await client.query(
    `SELECT MAX(o.received_at) AS last_at
     FROM orders o
     WHERE o.assigned_freelancer_id = $1
       AND o.received_at IS NOT NULL
       AND ${scopePart.clause}`,
    params,
  );
  return rows[0]?.last_at || null;
}

async function getActiveWorkloadCount({ client, freelancerUserId }) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM orders o
     WHERE o.assigned_freelancer_id = $1
       AND o.received_at IS NOT NULL
       AND o.order_status = ANY($2::text[])`,
    [Number(freelancerUserId), [...FAIR_ACTIVE_WORKLOAD_STATUSES]],
  );
  return Number(rows[0]?.c || 0);
}

/**
 * APPLIED_AND_LOST waiting count since max(lookbackStart, lastEffectiveAssignment).
 * Sources: fair_distribution_events (when present) + derived rejected bids on orders with effective award to another.
 */
async function getAppliedAndLostWaitingCount({
  client,
  freelancerUserId,
  scope,
  sinceAt,
}) {
  const freelancerId = Number(freelancerUserId);
  const eventsReady = await fairDistributionSchemaReady(client);

  if (scope.scopeKind === "subcategory" && scope.subcategoryId) {
    if (eventsReady) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT e.order_id
           FROM fair_distribution_events e
           WHERE e.freelancer_user_id = $1
             AND e.outcome_code = 'APPLIED_AND_LOST'
             AND e.occurred_at >= $2::timestamptz
             AND e.subcategory_id = $3
           UNION
           SELECT b.order_id
           FROM order_freelancer_bids b
           INNER JOIN orders o ON o.id = b.order_id
           WHERE b.freelancer_user_id = $1
             AND b.status = 'rejected'
             AND o.assigned_freelancer_id IS NOT NULL
             AND o.assigned_freelancer_id <> $1
             AND o.received_at IS NOT NULL
             AND o.received_at >= $2::timestamptz
             AND o.subcategory_id = $3
         ) u`,
        [freelancerId, sinceAt, scope.subcategoryId],
      );
      return Number(rows[0]?.c || 0);
    }
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM order_freelancer_bids b
       INNER JOIN orders o ON o.id = b.order_id
       WHERE b.freelancer_user_id = $1
         AND b.status = 'rejected'
         AND o.assigned_freelancer_id IS NOT NULL
         AND o.assigned_freelancer_id <> $1
         AND o.received_at IS NOT NULL
         AND o.received_at >= $2::timestamptz
         AND o.subcategory_id = $3`,
      [freelancerId, sinceAt, scope.subcategoryId],
    );
    return Number(rows[0]?.c || 0);
  }

  if (eventsReady) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS c FROM (
         SELECT e.order_id
         FROM fair_distribution_events e
         WHERE e.freelancer_user_id = $1
           AND e.outcome_code = 'APPLIED_AND_LOST'
           AND e.occurred_at >= $2::timestamptz
           AND e.category_id = $3
           AND e.scope_kind = 'category'
         UNION
         SELECT b.order_id
         FROM order_freelancer_bids b
         INNER JOIN orders o ON o.id = b.order_id
         WHERE b.freelancer_user_id = $1
           AND b.status = 'rejected'
           AND o.assigned_freelancer_id IS NOT NULL
           AND o.assigned_freelancer_id <> $1
           AND o.received_at IS NOT NULL
           AND o.received_at >= $2::timestamptz
           AND o.category_id = $3
       ) u`,
      [freelancerId, sinceAt, scope.categoryId],
    );
    return Number(rows[0]?.c || 0);
  }

  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM order_freelancer_bids b
     INNER JOIN orders o ON o.id = b.order_id
     WHERE b.freelancer_user_id = $1
       AND b.status = 'rejected'
       AND o.assigned_freelancer_id IS NOT NULL
       AND o.assigned_freelancer_id <> $1
       AND o.received_at IS NOT NULL
       AND o.received_at >= $2::timestamptz
       AND o.category_id = $3`,
    [freelancerId, sinceAt, scope.categoryId],
  );
  return Number(rows[0]?.c || 0);
}

async function computeCandidateMetrics({
  client,
  freelancerUserId,
  scope,
  lookbackDays,
  now = null,
}) {
  const { rows: nowRows } = await client.query(`SELECT COALESCE($1::timestamptz, NOW()) AS now`, [
    now,
  ]);
  const at = nowRows[0].now;
  const { rows: lookbackRows } = await client.query(
    `SELECT ($1::timestamptz - make_interval(days => $2::int)) AS since_at`,
    [at, Number(lookbackDays)],
  );
  const lookbackStart = lookbackRows[0].since_at;

  const lastEffectiveAssignmentAt = await getLastEffectiveAssignmentAt({
    client,
    freelancerUserId,
    scope,
  });

  // Waiting-loss boundary: later of lookback start and last effective assignment
  let lossSince = lookbackStart;
  if (lastEffectiveAssignmentAt) {
    const { rows: cmp } = await client.query(
      `SELECT GREATEST($1::timestamptz, $2::timestamptz) AS since_at`,
      [lookbackStart, lastEffectiveAssignmentAt],
    );
    lossSince = cmp[0].since_at;
  }

  const recentAssignments = await listEffectiveAssignments({
    client,
    freelancerUserId,
    scope,
    sinceAt: lookbackStart,
  });

  const appliedAndLostWaitingCount = await getAppliedAndLostWaitingCount({
    client,
    freelancerUserId,
    scope,
    sinceAt: lossSince,
  });

  const activeWorkloadCount = await getActiveWorkloadCount({ client, freelancerUserId });

  return {
    recentEffectiveAssignmentsCount: recentAssignments.length,
    appliedAndLostWaitingCount,
    activeWorkloadCount,
    lastEffectiveAssignmentAt,
    lookbackStart,
    lossSince,
  };
}

/**
 * Lexicographic compare for FAIR_DISTRIBUTION_FIRST.
 * @returns negative if a before b
 */
function compareFairDistributionCandidates(a, b, { includePriorityTokens = false } = {}) {
  if (a.recentEffectiveAssignmentsCount !== b.recentEffectiveAssignmentsCount) {
    return a.recentEffectiveAssignmentsCount - b.recentEffectiveAssignmentsCount;
  }
  if (a.appliedAndLostWaitingCount !== b.appliedAndLostWaitingCount) {
    return b.appliedAndLostWaitingCount - a.appliedAndLostWaitingCount;
  }
  if (a.activeWorkloadCount !== b.activeWorkloadCount) {
    return a.activeWorkloadCount - b.activeWorkloadCount;
  }
  const aLast = a.lastEffectiveAssignmentAt ? new Date(a.lastEffectiveAssignmentAt).getTime() : null;
  const bLast = b.lastEffectiveAssignmentAt ? new Date(b.lastEffectiveAssignmentAt).getTime() : null;
  if (aLast == null && bLast != null) return -1;
  if (aLast != null && bLast == null) return 1;
  if (aLast != null && bLast != null && aLast !== bLast) return aLast - bLast;

  if (includePriorityTokens) {
    const at = a.priorityBidTokens != null ? Number(a.priorityBidTokens) : -1;
    const bt = b.priorityBidTokens != null ? Number(b.priorityBidTokens) : -1;
    if (bt !== at) return bt - at;
  }

  const as = a.submittedAt ? new Date(a.submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bs = b.submittedAt ? new Date(b.submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (as !== bs) return as - bs;

  const aid = String(a.stableId || a.candidateKey || "");
  const bid = String(b.stableId || b.candidateKey || "");
  if (aid < bid) return -1;
  if (aid > bid) return 1;
  return 0;
}

function rankFairDistributionCandidates(candidates, { includePriorityTokens = false } = {}) {
  return [...candidates].sort((a, b) =>
    compareFairDistributionCandidates(a, b, { includePriorityTokens }),
  );
}

function buildReasonCodesForWinner(ranked) {
  if (!ranked.length) return [];
  const winner = ranked[0];
  const codes = [FAIR_DISTRIBUTION_REASON_CODES.FAIR_DISTRIBUTION_FIRST_SELECTED];
  if (winner.recentEffectiveAssignmentsCount === 0) {
    codes.push(FAIR_DISTRIBUTION_REASON_CODES.FEWER_RECENT_ASSIGNMENTS);
  }
  if (winner.lastEffectiveAssignmentAt == null) {
    codes.push(FAIR_DISTRIBUTION_REASON_CODES.NO_PREVIOUS_ASSIGNMENT_IN_SCOPE);
  }
  if (ranked.length > 1) {
    const second = ranked[1];
    if (winner.recentEffectiveAssignmentsCount < second.recentEffectiveAssignmentsCount) {
      codes.push(FAIR_DISTRIBUTION_REASON_CODES.FEWER_RECENT_ASSIGNMENTS);
    } else if (winner.appliedAndLostWaitingCount > second.appliedAndLostWaitingCount) {
      codes.push(FAIR_DISTRIBUTION_REASON_CODES.MORE_WAITING_LOSSES);
    } else if (winner.activeWorkloadCount < second.activeWorkloadCount) {
      codes.push(FAIR_DISTRIBUTION_REASON_CODES.LOWER_ACTIVE_WORKLOAD);
    } else if (
      (winner.lastEffectiveAssignmentAt == null && second.lastEffectiveAssignmentAt != null) ||
      (winner.lastEffectiveAssignmentAt &&
        second.lastEffectiveAssignmentAt &&
        new Date(winner.lastEffectiveAssignmentAt) < new Date(second.lastEffectiveAssignmentAt))
    ) {
      codes.push(FAIR_DISTRIBUTION_REASON_CODES.LONGER_SINCE_PREVIOUS_ASSIGNMENT);
    } else if (
      winner.priorityBidTokens != null &&
      second.priorityBidTokens != null &&
      Number(winner.priorityBidTokens) > Number(second.priorityBidTokens)
    ) {
      codes.push(FAIR_DISTRIBUTION_REASON_CODES.PRIORITY_TOKEN_TIE_BREAK);
    } else {
      codes.push(FAIR_DISTRIBUTION_REASON_CODES.STABLE_ID_TIE_BREAK);
    }
  }
  return [...new Set(codes)];
}

function humanSummaryEn(reasonCodes, scope) {
  const scopeLabel =
    scope.scopeKind === "subcategory" ? "this subcategory" : "this category";
  const parts = [];
  if (reasonCodes.includes(FAIR_DISTRIBUTION_REASON_CODES.FEWER_RECENT_ASSIGNMENTS)) {
    parts.push(`fewer recent assignments in ${scopeLabel}`);
  }
  if (reasonCodes.includes(FAIR_DISTRIBUTION_REASON_CODES.MORE_WAITING_LOSSES)) {
    parts.push("more eligible applications lost while waiting");
  }
  if (reasonCodes.includes(FAIR_DISTRIBUTION_REASON_CODES.LOWER_ACTIVE_WORKLOAD)) {
    parts.push("lower current workload");
  }
  if (reasonCodes.includes(FAIR_DISTRIBUTION_REASON_CODES.LONGER_SINCE_PREVIOUS_ASSIGNMENT)) {
    parts.push("longer time since previous assignment");
  }
  if (reasonCodes.includes(FAIR_DISTRIBUTION_REASON_CODES.NO_PREVIOUS_ASSIGNMENT_IN_SCOPE)) {
    parts.push(`no previous assignment in ${scopeLabel}`);
  }
  if (reasonCodes.includes(FAIR_DISTRIBUTION_REASON_CODES.PRIORITY_TOKEN_TIE_BREAK)) {
    parts.push("priority ranking used only as tie-break");
  }
  if (reasonCodes.includes(FAIR_DISTRIBUTION_REASON_CODES.SELECTED_BY_HIGHEST_TOKEN_ONLY)) {
    parts.push("selected by highest-eligible-first strategy");
  }
  if (!parts.length) parts.push("selected by Fair Distribution lexicographic queue");
  return parts.join("; ");
}

/**
 * Phase 7.1 — factual Fair history is recorded for REAL marketplace outcomes
 * even while fair_work_distribution_enabled=false (prospective history).
 * Ranking/assignment remains gated by the Fair engine flag separately.
 */
const FAIR_HISTORY_RECORDING_WHEN_ENGINE_OFF = "ALWAYS_RECORD_FACTUAL_HISTORY";

function fairIdempotencyKeys(orderId, freelancerUserId) {
  const oid = Number(orderId);
  const fid = Number(freelancerUserId);
  return {
    appliedAndLost: `applied_and_lost:order:${oid}:freelancer:${fid}`,
    offeredAndDeclined: `offered_and_declined:order:${oid}:freelancer:${fid}`,
    freelancerCancelledAfterAward: `freelancer_cancelled_after_award:order:${oid}:freelancer:${fid}`,
    externalCancel: `external_cancel:order:${oid}:freelancer:${fid || 0}`,
    awarded: `awarded:order:${oid}:freelancer:${fid}`,
    effectiveAssignment: `effective_assignment:order:${oid}:freelancer:${fid}`,
    orderCancelledBeforeResolution: `order_cancelled_before_resolution:order:${oid}`,
    noEligibleWinner: `no_eligible_winner:order:${oid}`,
    ineligibleSkipped: (bidOrRefId) =>
      `ineligible_skipped:order:${oid}:freelancer:${fid}:ref:${bidOrRefId}`,
  };
}

/**
 * Fake/training Orders must never create Fair economy history.
 */
function isFakeOrTrainingOrder(order) {
  if (!order) return true;
  const source = String(order.source_type || "");
  if (source === "fake" || source === "training" || source === "fake_order") return true;
  if (order.is_fake === true || order.is_training === true) return true;
  if (order.kind === "fake" || order.kind === "training") return true;
  return false;
}

function assertRealOrderForFairHistory(order) {
  if (isFakeOrTrainingOrder(order)) {
    return { ok: false, reason: "FAKE_TRAINING" };
  }
  if (!order?.id) return { ok: false, reason: "ORDER_MISSING" };
  return { ok: true };
}

/**
 * Record idempotent fairness event. Safe no-op on duplicate key.
 * Phase 7.1: records factual history regardless of fair_work_distribution_enabled.
 */
async function recordFairDistributionEvent({
  client: externalClient = null,
  freelancerUserId,
  orderId,
  outcomeCode,
  scope,
  referenceType,
  referenceId,
  idempotencyKey,
  actorRole = null,
  actorUserId = null,
  reason = null,
  metadata = null,
  occurredAt = null,
} = {}) {
  const run = async (client) => {
    if (!(await fairDistributionSchemaReady(client))) {
      return { recorded: false, skipped: true, reason: "SCHEMA_MISSING" };
    }
    try {
      const { rows } = await client.query(
        `INSERT INTO fair_distribution_events (
           freelancer_user_id, order_id, outcome_code,
           category_id, subcategory_id, scope_kind,
           reference_type, reference_id, idempotency_key,
           actor_role, actor_user_id, reason, metadata_json, occurred_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, COALESCE($14::timestamptz, NOW())
         )
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        [
          Number(freelancerUserId),
          Number(orderId),
          outcomeCode,
          scope?.categoryId ?? null,
          scope?.subcategoryId ?? null,
          scope?.scopeKind || "category",
          String(referenceType),
          String(referenceId),
          String(idempotencyKey),
          actorRole,
          actorUserId != null ? Number(actorUserId) : null,
          reason,
          metadata ? JSON.stringify(metadata) : null,
          occurredAt,
        ],
      );
      return { recorded: Boolean(rows[0]), idempotent: !rows[0], event: rows[0] || null };
    } catch (err) {
      // Unique (freelancer, order) for APPLIED_AND_LOST
      if (err && err.code === "23505") {
        return { recorded: false, idempotent: true, event: null };
      }
      throw err;
    }
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

/**
 * Rank eligible candidates and optionally persist an immutable decision snapshot.
 * Does NOT mutate Order assignment — caller uses canonical assignment.
 */
async function decideFairDistributionFirst({
  order,
  candidates,
  lookbackDays,
  priorityAuctionId = null,
  includePriorityTokens = false,
  persistDecision = true,
  selectionSource = "fair_distribution_first",
  client: externalClient = null,
  now = null,
} = {}) {
  const run = async (client) => {
    assertHybridNotOperational("FAIR_DISTRIBUTION_FIRST");

    const settings = await getMarketplaceEconomySettings(client);
    const days =
      lookbackDays != null
        ? Number(lookbackDays)
        : Number(settings.fairDistributionLookbackDays) || 30;

    const scope = resolveFairnessScope(order);
    if (!scope.categoryId && scope.scopeKind === "category") {
      throw createAppError("Order lacks category for Fair Distribution scope.", 409, {
        exposeToClient: true,
        publicCode: FAIR_DISTRIBUTION_ERROR_CODES.FAIR_DISTRIBUTION_ORDER_INELIGIBLE,
      });
    }

    const enriched = [];
    for (const c of candidates) {
      const freelancerUserId = Number(c.freelancerUserId);
      const eligible = c.eligible !== false;
      let metrics = {
        recentEffectiveAssignmentsCount: 0,
        appliedAndLostWaitingCount: 0,
        activeWorkloadCount: 0,
        lastEffectiveAssignmentAt: null,
      };
      if (eligible) {
        // eslint-disable-next-line no-await-in-loop
        metrics = await computeCandidateMetrics({
          client,
          freelancerUserId,
          scope,
          lookbackDays: days,
          now,
        });
      }
      enriched.push({
        freelancerUserId,
        candidateKey: String(c.candidateKey || `freelancer:${freelancerUserId}`),
        stableId: String(c.stableId || c.applicationOrBidId || freelancerUserId),
        eligible,
        ineligibleReason: eligible ? null : c.ineligibleReason || "NOT_ELIGIBLE",
        recentEffectiveAssignmentsCount: metrics.recentEffectiveAssignmentsCount,
        appliedAndLostWaitingCount: metrics.appliedAndLostWaitingCount,
        activeWorkloadCount: metrics.activeWorkloadCount,
        lastEffectiveAssignmentAt: metrics.lastEffectiveAssignmentAt,
        priorityBidTokens: c.priorityBidTokens != null ? Number(c.priorityBidTokens) : null,
        submittedAt: c.submittedAt || null,
        applicationOrBidId: c.applicationOrBidId != null ? Number(c.applicationOrBidId) : null,
      });
    }

    const eligibleOnly = enriched.filter((c) => c.eligible);
    const ranked = rankFairDistributionCandidates(eligibleOnly, { includePriorityTokens });
    const winner = ranked[0] || null;
    const reasonCodes = winner
      ? buildReasonCodesForWinner(ranked)
      : [FAIR_DISTRIBUTION_REASON_CODES.CANDIDATE_NOT_ELIGIBLE];

    // Full ordinal list: ranked eligible then ineligible
    const ordered = [
      ...ranked,
      ...enriched.filter((c) => !c.eligible),
    ];

    let decision = null;
    if (persistDecision && (await fairDistributionSchemaReady(client))) {
      const summary = humanSummaryEn(reasonCodes, scope);
      const { rows: decRows } = await client.query(
        `INSERT INTO fair_distribution_decisions (
           order_id, assignment_strategy, fair_engine_enabled_snapshot,
           category_id, subcategory_id, scope_kind, lookback_days,
           priority_auction_id, priority_auction_participated,
           selected_freelancer_user_id, selected_candidate_key, selection_source,
           reason_codes_json, human_summary_en
         ) VALUES (
           $1,'FAIR_DISTRIBUTION_FIRST',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13
         )
         ON CONFLICT (order_id) DO NOTHING
         RETURNING *`,
        [
          Number(order.id),
          Boolean(isFairWorkDistributionActive(settings)),
          scope.categoryId,
          scope.subcategoryId,
          scope.scopeKind,
          days,
          priorityAuctionId != null ? Number(priorityAuctionId) : null,
          Boolean(includePriorityTokens || priorityAuctionId),
          winner ? Number(winner.freelancerUserId) : null,
          winner ? winner.candidateKey : null,
          selectionSource,
          JSON.stringify(reasonCodes),
          summary,
        ],
      );
      decision = decRows[0] || null;
      if (!decision) {
        const { rows: existing } = await client.query(
          `SELECT * FROM fair_distribution_decisions WHERE order_id = $1`,
          [Number(order.id)],
        );
        decision = existing[0] || null;
      } else {
        let ordinal = 1;
        for (const c of ordered) {
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            `INSERT INTO fair_distribution_decision_candidates (
               decision_id, ordinal_position, freelancer_user_id, candidate_key,
               eligible, ineligible_reason,
               recent_effective_assignments_count, applied_and_lost_waiting_count,
               active_workload_count, last_effective_assignment_at,
               priority_bid_tokens, submitted_at, application_or_bid_id,
               reason_codes_json
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
            [
              decision.id,
              ordinal,
              c.freelancerUserId,
              c.candidateKey,
              c.eligible,
              c.ineligibleReason,
              c.recentEffectiveAssignmentsCount,
              c.appliedAndLostWaitingCount,
              c.activeWorkloadCount,
              c.lastEffectiveAssignmentAt,
              c.priorityBidTokens,
              c.submittedAt,
              c.applicationOrBidId,
              JSON.stringify(
                c.eligible ? [] : [FAIR_DISTRIBUTION_REASON_CODES.CANDIDATE_NOT_ELIGIBLE],
              ),
            ],
          );
          ordinal += 1;
        }
      }
    }

    return {
      strategy: "FAIR_DISTRIBUTION_FIRST",
      scope,
      lookbackDays: days,
      winner,
      ranked,
      ordered,
      reasonCodes,
      humanSummaryEn: humanSummaryEn(reasonCodes, scope),
      decisionId: decision ? String(decision.id) : null,
      decision,
    };
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

/**
 * Super Admin read of a decision (includes candidate metrics — never Freelancer-facing).
 */
async function getFairDistributionDecisionByOrderId(orderId, { client: db = pool } = {}) {
  if (!(await fairDistributionSchemaReady(db))) return null;
  const { rows } = await db.query(
    `SELECT * FROM fair_distribution_decisions WHERE order_id = $1`,
    [Number(orderId)],
  );
  if (!rows[0]) return null;
  const decision = rows[0];
  const { rows: cands } = await db.query(
    `SELECT * FROM fair_distribution_decision_candidates
     WHERE decision_id = $1
     ORDER BY ordinal_position ASC`,
    [decision.id],
  );
  return {
    id: String(decision.id),
    orderId: String(decision.order_id),
    assignmentStrategy: decision.assignment_strategy,
    fairEngineEnabledSnapshot: Boolean(decision.fair_engine_enabled_snapshot),
    scopeKind: decision.scope_kind,
    categoryId: decision.category_id != null ? String(decision.category_id) : null,
    subcategoryId: decision.subcategory_id != null ? String(decision.subcategory_id) : null,
    lookbackDays: Number(decision.lookback_days),
    priorityAuctionParticipated: Boolean(decision.priority_auction_participated),
    selectedFreelancerUserId:
      decision.selected_freelancer_user_id != null
        ? String(decision.selected_freelancer_user_id)
        : null,
    reasonCodes: decision.reason_codes_json || [],
    humanSummaryEn: decision.human_summary_en,
    decidedAt: decision.decided_at,
    candidates: cands.map((c) => ({
      ordinalPosition: Number(c.ordinal_position),
      freelancerUserId: String(c.freelancer_user_id),
      eligible: Boolean(c.eligible),
      ineligibleReason: c.ineligible_reason,
      recentEffectiveAssignmentsCount: Number(c.recent_effective_assignments_count),
      appliedAndLostWaitingCount: Number(c.applied_and_lost_waiting_count),
      activeWorkloadCount: Number(c.active_workload_count),
      lastEffectiveAssignmentAt: c.last_effective_assignment_at,
      priorityBidTokens: c.priority_bid_tokens != null ? Number(c.priority_bid_tokens) : null,
      submittedAt: c.submitted_at,
    })),
  };
}

/**
 * Strip forbidden fairness fields from Freelancer-facing payloads (defense in depth).
 */
function scrubFreelancerFairnessLeakage(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const out = Array.isArray(payload) ? [...payload] : { ...payload };
  for (const key of FREELANCER_FORBIDDEN_FAIRNESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(out, key)) delete out[key];
  }
  // Extra Phase 7 lexicographic internals
  for (const key of [
    "recentEffectiveAssignmentsCount",
    "appliedAndLostWaitingCount",
    "activeWorkloadCount",
    "lastEffectiveAssignmentAt",
    "fairDistributionRank",
    "fairnessQueuePosition",
    "candidateSnapshots",
    "assignmentWeights",
  ]) {
    if (Object.prototype.hasOwnProperty.call(out, key)) delete out[key];
  }
  return out;
}

function assertNoFreelancerFairnessLeakage(payload, path = "root") {
  if (!payload || typeof payload !== "object") return;
  const forbidden = [
    ...FREELANCER_FORBIDDEN_FAIRNESS_FIELDS,
    "recentEffectiveAssignmentsCount",
    "appliedAndLostWaitingCount",
    "fairDistributionRank",
    "fairnessQueuePosition",
    "fairness_score",
    "fairnessScore",
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`FAIRNESS_LEAKAGE at ${path}.${key}`);
    }
  }
}

/**
 * Dormant-safe: record APPLIED_AND_LOST for freelancers whose valid application lost
 * because another freelancer was ultimately selected. No-op if schema missing / fake.
 * Does NOT count ASSIGNMENT_OFFERED_AND_DECLINED.
 */
async function recordAppliedAndLostForOrderLosers({
  client,
  order,
  winnerFreelancerUserId,
  loserFreelancerUserIds,
  referenceType = "order_freelancer_bid",
  reason = "another_freelancer_selected",
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return [{ skipped: true, reason: gate.reason }];
  if (!Array.isArray(loserFreelancerUserIds)) return [];
  const scope = resolveFairnessScope(order);
  const results = [];
  const winnerId = Number(winnerFreelancerUserId);
  for (const rawId of loserFreelancerUserIds) {
    const freelancerUserId = Number(rawId);
    if (!Number.isInteger(freelancerUserId) || freelancerUserId <= 0) continue;
    if (freelancerUserId === winnerId) continue;
    const keys = fairIdempotencyKeys(order.id, freelancerUserId);
    // eslint-disable-next-line no-await-in-loop
    const result = await recordFairDistributionEvent({
      client,
      freelancerUserId,
      orderId: order.id,
      outcomeCode: "APPLIED_AND_LOST",
      scope,
      referenceType,
      referenceId: String(order.id),
      idempotencyKey: keys.appliedAndLost,
      reason,
    });
    results.push(result);
  }
  return results;
}

/**
 * ASSIGNMENT_OFFERED_AND_DECLINED — distinct from APPLIED_AND_LOST; does NOT boost waiting count.
 */
async function recordOfferedAndDeclined({
  client,
  order,
  freelancerUserId,
  referenceType = "order_offer",
  referenceId,
  actorUserId = null,
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const keys = fairIdempotencyKeys(order.id, freelancerUserId);
  return recordFairDistributionEvent({
    client,
    freelancerUserId,
    orderId: order.id,
    outcomeCode: "ASSIGNMENT_OFFERED_AND_DECLINED",
    scope,
    referenceType,
    referenceId: String(referenceId || order.id),
    idempotencyKey: keys.offeredAndDeclined,
    actorRole: "freelancer",
    actorUserId,
    reason: "freelancer_declined_offer",
  });
}

/**
 * Freelancer cancel after award — FREELANCER_CANCELLED_AFTER_AWARD.
 * Does NOT create APPLIED_AND_LOST; effective assignment (received_at) remains for recency.
 */
async function recordFreelancerCancelledAfterAward({
  client,
  order,
  freelancerUserId,
  actorUserId = null,
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const keys = fairIdempotencyKeys(order.id, freelancerUserId);
  return recordFairDistributionEvent({
    client,
    freelancerUserId,
    orderId: order.id,
    outcomeCode: "FREELANCER_CANCELLED_AFTER_AWARD",
    scope,
    referenceType: "order",
    referenceId: String(order.id),
    idempotencyKey: keys.freelancerCancelledAfterAward,
    actorRole: "freelancer",
    actorUserId,
    reason: "freelancer_cancelled_after_award",
  });
}

/**
 * Client/admin/system cancel — neutral; not a Freelancer penalty.
 * Prefer order-level identity when no assigned Freelancer; otherwise per-assignee.
 */
async function recordExternalCancellationNeutral({
  client,
  order,
  freelancerUserId = null,
  actorRole = "system",
  actorUserId = null,
  reason = "client_admin_system_cancelled",
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const fid =
    freelancerUserId != null
      ? Number(freelancerUserId)
      : order.assigned_freelancer_id != null
        ? Number(order.assigned_freelancer_id)
        : 0;
  const keys = fairIdempotencyKeys(order.id, fid);
  // CLIENT_ADMIN_SYSTEM_CANCELLED requires freelancer_user_id NOT NULL in schema —
  // use assigned Freelancer when present; otherwise skip row-level external event
  // and rely on ORDER_CANCELLED_BEFORE_RESOLUTION for pre-selection cancels.
  if (!fid || fid <= 0) {
    return { skipped: true, reason: "NO_ASSIGNED_FREELANCER" };
  }
  return recordFairDistributionEvent({
    client,
    freelancerUserId: fid,
    orderId: order.id,
    outcomeCode: "CLIENT_ADMIN_SYSTEM_CANCELLED",
    scope,
    referenceType: "order",
    referenceId: String(order.id),
    idempotencyKey: keys.externalCancel,
    actorRole,
    actorUserId,
    reason,
  });
}

/**
 * Pre-resolution Order cancel (no Freelancer selected).
 * Uses a synthetic freelancer_user_id=0 is NOT allowed by FK — record against
 * each pending applicant? Spec says ORDER_CANCELLED_BEFORE_RESOLUTION as event.
 * Schema requires freelancer_user_id REFERENCES users. So we store one event
 * keyed by order using the cancelling actor when they are a user, else skip
 * per-freelancer and use metadata on a dedicated approach:
 *
 * Practical Phase 7.1: record ORDER_CANCELLED_BEFORE_RESOLUTION once per Order
 * using actorUserId as freelancer_user_id only if actor is not applicable —
 * BETTER: pick first pending bidder? No — that misattributes.
 *
 * Schema constraint: freelancer_user_id NOT NULL REFERENCES users(id).
 * For order-level cancel with no assignee, record using actorUserId when it is
 * a real user id (client/admin who cancelled), with metadata noting order-level.
 * If actorUserId missing, skip (schema blocker would be needed for nullable).
 */
async function recordOrderCancelledBeforeResolution({
  client,
  order,
  actorRole = "system",
  actorUserId = null,
  reason = "order_cancelled_before_resolution",
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const subjectUserId =
    actorUserId != null
      ? Number(actorUserId)
      : order.created_by_user_id != null
        ? Number(order.created_by_user_id)
        : null;
  if (!subjectUserId || subjectUserId <= 0) {
    return { skipped: true, reason: "NO_SUBJECT_USER_FOR_ORDER_LEVEL_EVENT" };
  }
  return recordFairDistributionEvent({
    client,
    freelancerUserId: subjectUserId,
    orderId: order.id,
    outcomeCode: "ORDER_CANCELLED_BEFORE_RESOLUTION",
    scope,
    referenceType: "order",
    referenceId: String(order.id),
    idempotencyKey: fairIdempotencyKeys(order.id, 0).orderCancelledBeforeResolution,
    actorRole,
    actorUserId: subjectUserId,
    reason,
    metadata: { orderLevel: true, note: "no_freelancer_selected" },
  });
}

/**
 * AWARDED — Freelancer designated as winner/selected.
 * Distinct from EFFECTIVE_ASSIGNMENT (received_at). Soft selected_pending_payment
 * may record AWARDED without EFFECTIVE_ASSIGNMENT.
 */
async function recordAwarded({
  client,
  order,
  freelancerUserId,
  referenceType = "order",
  referenceId = null,
  actorRole = null,
  actorUserId = null,
  reason = "awarded",
  metadata = null,
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const keys = fairIdempotencyKeys(order.id, freelancerUserId);
  return recordFairDistributionEvent({
    client,
    freelancerUserId,
    orderId: order.id,
    outcomeCode: "AWARDED",
    scope,
    referenceType,
    referenceId: String(referenceId || order.id),
    idempotencyKey: keys.awarded,
    actorRole,
    actorUserId,
    reason,
    metadata,
  });
}

/**
 * EFFECTIVE_ASSIGNMENT — assigned_freelancer_id + received_at IS NOT NULL.
 * selected_pending_payment alone must NOT call this.
 */
async function recordEffectiveAssignment({
  client,
  order,
  freelancerUserId,
  referenceType = "order",
  referenceId = null,
  actorRole = null,
  actorUserId = null,
  reason = "effective_assignment",
  metadata = null,
  occurredAt = null,
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const keys = fairIdempotencyKeys(order.id, freelancerUserId);
  return recordFairDistributionEvent({
    client,
    freelancerUserId,
    orderId: order.id,
    outcomeCode: "EFFECTIVE_ASSIGNMENT",
    scope,
    referenceType,
    referenceId: String(referenceId || order.id),
    idempotencyKey: keys.effectiveAssignment,
    actorRole,
    actorUserId,
    reason,
    metadata,
    occurredAt,
  });
}

/**
 * Canonical final selection where another Freelancer won AND received_at is set.
 * Records: AWARDED + EFFECTIVE_ASSIGNMENT for winner, APPLIED_AND_LOST for losers.
 */
async function recordFinalEffectiveSelectionOutcome({
  client,
  order,
  winnerFreelancerUserId,
  loserFreelancerUserIds = [],
  selectionSource = "selection",
  actorRole = null,
  actorUserId = null,
  occurredAt = null,
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };

  const awarded = await recordAwarded({
    client,
    order,
    freelancerUserId: winnerFreelancerUserId,
    actorRole,
    actorUserId,
    reason: selectionSource,
    metadata: { selectionSource },
  });
  const effective = await recordEffectiveAssignment({
    client,
    order,
    freelancerUserId: winnerFreelancerUserId,
    actorRole,
    actorUserId,
    reason: selectionSource,
    metadata: { selectionSource },
    occurredAt,
  });
  const losses = await recordAppliedAndLostForOrderLosers({
    client,
    order,
    winnerFreelancerUserId,
    loserFreelancerUserIds,
    reason: selectionSource,
  });
  return { awarded, effective, losses };
}

async function recordNoEligibleWinner({
  client,
  order,
  actorRole = "system",
  actorUserId = null,
  reason = "no_eligible_winner",
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const subjectUserId =
    actorUserId != null
      ? Number(actorUserId)
      : order.created_by_user_id != null
        ? Number(order.created_by_user_id)
        : null;
  if (!subjectUserId || subjectUserId <= 0) {
    return { skipped: true, reason: "NO_SUBJECT_USER_FOR_ORDER_LEVEL_EVENT" };
  }
  return recordFairDistributionEvent({
    client,
    freelancerUserId: subjectUserId,
    orderId: order.id,
    outcomeCode: "NO_ELIGIBLE_WINNER",
    scope,
    referenceType: "priority_auction",
    referenceId: String(order.id),
    idempotencyKey: fairIdempotencyKeys(order.id, 0).noEligibleWinner,
    actorRole,
    actorUserId: subjectUserId,
    reason,
    metadata: { orderLevel: true },
  });
}

async function recordIneligibleSkipped({
  client,
  order,
  freelancerUserId,
  referenceId,
  reason = "skipped_ineligible",
  actorRole = "system",
  actorUserId = null,
} = {}) {
  const gate = assertRealOrderForFairHistory(order);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const scope = resolveFairnessScope(order);
  const keys = fairIdempotencyKeys(order.id, freelancerUserId);
  return recordFairDistributionEvent({
    client,
    freelancerUserId,
    orderId: order.id,
    outcomeCode: "INELIGIBLE_SKIPPED",
    scope,
    referenceType: "priority_auction_bid",
    referenceId: String(referenceId),
    idempotencyKey: keys.ineligibleSkipped(referenceId),
    actorRole,
    actorUserId,
    reason,
  });
}

/**
 * Rank normal priced-bid applications under FAIR_DISTRIBUTION_FIRST (no Priority Token key).
 * Caller must pass only already-eligible candidates. Does not assign the Order.
 */
async function decideNormalApplicationFairDistributionFirst({
  client,
  order,
  applications,
  persistDecision = true,
  lookbackDays = null,
} = {}) {
  assertHybridNotOperational("FAIR_DISTRIBUTION_FIRST");
  const candidates = (applications || []).map((a) => ({
    freelancerUserId: a.freelancerUserId ?? a.freelancer_user_id,
    candidateKey: `application:${a.id ?? a.applicationOrBidId}`,
    stableId: String(a.id ?? a.applicationOrBidId),
    eligible: a.eligible !== false,
    ineligibleReason: a.ineligibleReason || null,
    priorityBidTokens: null,
    submittedAt: a.submittedAt || a.created_at || a.submitted_at || null,
    applicationOrBidId: a.id ?? a.applicationOrBidId,
  }));
  return decideFairDistributionFirst({
    client,
    order,
    candidates,
    lookbackDays,
    includePriorityTokens: false,
    persistDecision,
    selectionSource: "normal_application_fair_distribution_first",
  });
}

module.exports = {
  resolveFairnessScope,
  computeCandidateMetrics,
  compareFairDistributionCandidates,
  rankFairDistributionCandidates,
  decideFairDistributionFirst,
  decideNormalApplicationFairDistributionFirst,
  recordFairDistributionEvent,
  recordAppliedAndLostForOrderLosers,
  recordOfferedAndDeclined,
  recordFreelancerCancelledAfterAward,
  recordExternalCancellationNeutral,
  recordOrderCancelledBeforeResolution,
  recordAwarded,
  recordEffectiveAssignment,
  recordFinalEffectiveSelectionOutcome,
  recordNoEligibleWinner,
  recordIneligibleSkipped,
  getFairDistributionDecisionByOrderId,
  assertHybridNotOperational,
  scrubFreelancerFairnessLeakage,
  assertNoFreelancerFairnessLeakage,
  humanSummaryEn,
  fairDistributionSchemaReady,
  fairIdempotencyKeys,
  isFakeOrTrainingOrder,
  FAIR_HISTORY_RECORDING_WHEN_ENGINE_OFF,
  /** Documented: no live pending_freelancer_acceptance decline mutation exists in Phase 7.1. */
  LIVE_ASSIGNMENT_DECLINE_PATH_NOT_PRESENT: true,
  FAIR_DISTRIBUTION_ERROR_CODES,
  FAIR_DISTRIBUTION_REASON_CODES,
};
