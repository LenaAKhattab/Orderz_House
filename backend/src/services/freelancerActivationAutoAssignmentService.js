/**
 * Phase A9.3 — Automatic winner assignment with seeded weighted fair lottery.
 * Reuses selectArticleApplication (A4.1/A4.2 + A10 loser Bid consume for real articles).
 * Does NOT auto-approve, settle, publish, or pay.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  ACTIVATION_WEIGHTED_FAIR_ALGORITHM_VERSION,
  ACTIVATION_AUTO_ASSIGN_OVERRIDE_REASON,
  ACTIVATION_AUTO_ASSIGN_ERROR_CODES,
  ACTIVATION_WEIGHTED_FAIR_WEIGHTS,
} = require("../constants/freelancerActivationAutoAssignment");
const fairCtx = require("./freelancerActivationFairDistributionService");
const campaignService = require("./freelancerActivationCampaignService");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function schemaMissingError() {
  return createAppError("Freelancer activation A9.3 auto-assignment schema is not applied.", 503, {
    exposeToClient: true,
    publicCode: ACTIVATION_AUTO_ASSIGN_ERROR_CODES.SCHEMA_MISSING,
  });
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Deterministic 32-bit seed from string. */
function hashSeedString(input) {
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — reproducible from seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

/**
 * Pure weight computation for weighted fair lottery.
 */
function computeWeightedFairWeight(metrics = {}) {
  const W = ACTIVATION_WEIGHTED_FAIR_WEIGHTS;
  const accepted = Math.max(0, toInt(metrics.acceptedActivationWorkCount, 0));
  const published = Math.max(0, toInt(metrics.publishedActivationWorkCount, 0));
  const totalWorks = accepted + published;
  const wins = Math.max(0, toInt(metrics.previousActivationWins, 0));
  const losses = Math.max(0, toInt(metrics.previousActivationLosses, 0));
  const waitingLosses = Math.max(0, toInt(metrics.waitingLosses, losses));
  const activeAssigned = Math.max(0, toInt(metrics.activeAssignedMiniArticleWorkCount, 0));
  const waitingDays = Math.max(0, Math.min(W.WAITING_DAY_CAP, toInt(metrics.waitingDays, 0)));
  const isTrialActive = Boolean(metrics.isTrialActive);
  const isPaidActive = Boolean(metrics.isPaidActive);

  let weight = W.BASE;
  const reasonTags = [];

  const trialFirstEligible = isTrialActive && !isPaidActive;
  if (trialFirstEligible && totalWorks === 0) {
    weight += W.ZERO_WORK_BOOST;
    reasonTags.push("zero_activation_work_boost");
  } else if (totalWorks === 0 && !isPaidActive) {
    weight += Math.floor(W.ZERO_WORK_BOOST * 0.6);
    reasonTags.push("zero_work_boost");
  }

  if (waitingLosses > 0) {
    weight += waitingLosses * W.LOSS_PER;
    if (waitingLosses > 1) {
      weight += (waitingLosses - 1) * W.EXTRA_LOSS_PER_AFTER_FIRST;
    }
    reasonTags.push("previous_loss_boost");
  }

  if (waitingDays > 0) {
    weight += waitingDays * W.WAITING_DAY;
    reasonTags.push("waiting_time_boost");
  }

  if (wins > 0) {
    weight -= wins * W.WIN_PENALTY;
    reasonTags.push("previous_win_penalty");
  }
  if (totalWorks > 0) {
    weight -= totalWorks * W.WORK_PENALTY;
    reasonTags.push("prior_work_penalty");
  }
  if (activeAssigned > 0) {
    weight -= activeAssigned * W.ACTIVE_ASSIGNED_PENALTY;
    reasonTags.push("active_workload_penalty");
  }
  if (isPaidActive) {
    reasonTags.push("paid_membership_no_trial_boost");
  }

  weight = Math.max(W.MIN_WEIGHT, Math.floor(weight));
  return { weight, reasonTags: uniqueTags(reasonTags) };
}

/**
 * Seeded weighted lottery. Returns index into candidates array.
 */
function selectWeightedFairIndex(candidates, seedString) {
  const seed = hashSeedString(seedString);
  const rng = mulberry32(seed);
  const total = candidates.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  if (total <= 0 || !candidates.length) return { index: -1, seed, totalWeight: 0, draw: null };
  const draw = rng() * total;
  let cumulative = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    cumulative += Number(candidates[i].weight || 0);
    if (draw < cumulative) {
      return { index: i, seed, totalWeight: total, draw };
    }
  }
  return { index: candidates.length - 1, seed, totalWeight: total, draw };
}

async function loadLossCounts(runner, freelancerUserIds) {
  const ids = [...new Set((freelancerUserIds || []).map(Number).filter((id) => id >= 1))];
  const map = new Map();
  for (const id of ids) map.set(id, 0);
  if (!ids.length) return map;
  try {
    const { rows } = await runner.query(
      `SELECT freelancer_user_id, COUNT(*)::int AS losses
         FROM marketplace_article_applications
        WHERE freelancer_user_id = ANY($1::bigint[])
          AND activation_campaign_id IS NOT NULL
          AND status = 'rejected'
        GROUP BY freelancer_user_id`,
      [ids],
    );
    for (const row of rows) {
      map.set(Number(row.freelancer_user_id), toInt(row.losses, 0));
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }
  return map;
}

async function loadWinCounts(runner, freelancerUserIds) {
  const ids = [...new Set((freelancerUserIds || []).map(Number).filter((id) => id >= 1))];
  const map = new Map();
  for (const id of ids) map.set(id, 0);
  if (!ids.length) return map;
  try {
    const { rows } = await runner.query(
      `SELECT freelancer_user_id, COUNT(*)::int AS wins
         FROM marketplace_article_applications
        WHERE freelancer_user_id = ANY($1::bigint[])
          AND activation_campaign_id IS NOT NULL
          AND status IN ('selected', 'assigned', 'writing', 'submitted', 'under_review',
                         'revision_requested', 'approved')
        GROUP BY freelancer_user_id`,
      [ids],
    );
    for (const row of rows) {
      map.set(Number(row.freelancer_user_id), toInt(row.wins, 0));
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }
  return map;
}

function isAutoAssignEnabledOnArticle(article) {
  if (!article) return false;
  if (article.activation_campaign_id == null && article.activationCampaignId == null) return false;
  const enabled = Boolean(
    article.activation_auto_assign_enabled ?? article.activationAutoAssignEnabled,
  );
  const mode = String(
    article.activation_auto_assign_mode ?? article.activationAutoAssignMode ?? "disabled",
  );
  const whenMin = Boolean(
    article.activation_auto_assign_when_min_bidders_reached
      ?? article.activationAutoAssignWhenMinBiddersReached,
  );
  return enabled && mode === "weighted_fair" && whenMin;
}

async function evaluateAutoAssignmentReadiness(articleId, { client = null } = {}) {
  const runner = client || pool;
  const aid = Number(articleId);
  try {
    const { rows } = await runner.query(
      `SELECT * FROM marketplace_articles WHERE id = $1`,
      [aid],
    );
    const article = rows[0];
    if (!article) {
      return { ready: false, status: "skipped", skipReason: "article_not_found", article: null };
    }
    if (article.activation_campaign_id == null) {
      return {
        ready: false,
        status: "disabled",
        skipReason: "not_activation_article",
        article,
      };
    }
    if (!isAutoAssignEnabledOnArticle(article)) {
      return {
        ready: false,
        status: "disabled",
        skipReason: "auto_assign_disabled",
        article,
      };
    }

    const { rows: winners } = await runner.query(
      `SELECT id FROM marketplace_article_applications
        WHERE article_id = $1
          AND status IN ('selected', 'assigned', 'writing', 'submitted', 'under_review',
                         'revision_requested', 'approved')
        LIMIT 1`,
      [aid],
    );
    if (winners[0]) {
      return {
        ready: false,
        status: "auto-assigned",
        skipReason: "already_assigned",
        article,
        selectedApplicationId: Number(winners[0].id),
      };
    }

    const collectionService = require("./opportunityBidCollectionService");
    let progress;
    try {
      progress = await collectionService.getArticleBidCollectionProgress(aid, { client: runner });
    } catch {
      progress = null;
    }
    const required = toInt(
      progress?.requiredBidCount ?? progress?.required ?? article.required_bid_count,
      10,
    );
    const qualified = toInt(progress?.currentCount ?? progress?.count, 0);
    if (qualified < required) {
      return {
        ready: false,
        status: "waiting_for_bidders",
        skipReason: "below_min_bidders",
        article,
        requiredBidders: required,
        qualifiedBiddersCount: qualified,
      };
    }

    const gate = await campaignService.evaluateActivationOpportunityGate({
      article,
      client: runner,
    });
    if (!gate.skipped && !gate.allowed) {
      return {
        ready: false,
        status: "skipped",
        skipReason: gate.code || "campaign_blocked",
        article,
        requiredBidders: required,
        qualifiedBiddersCount: qualified,
        gate,
      };
    }

    return {
      ready: true,
      status: "ready",
      skipReason: null,
      article,
      requiredBidders: required,
      qualifiedBiddersCount: qualified,
      gate,
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return { ready: false, status: "skipped", skipReason: "schema_missing", article: null };
    }
    throw err;
  }
}

async function computeWeightedFairCandidates(articleId, { client = null, now = new Date() } = {}) {
  const runner = client || pool;
  const aid = Number(articleId);
  const { rows: apps } = await runner.query(
    `SELECT * FROM marketplace_article_applications
      WHERE article_id = $1 AND status = 'pending'
      ORDER BY id ASC`,
    [aid],
  );
  const userIds = apps.map((a) => Number(a.freelancer_user_id));
  const contextMap = await fairCtx.loadActivationFairContextMap(runner, {
    freelancerUserIds: userIds,
  });
  const lossMap = await loadLossCounts(runner, userIds);
  const winMap = await loadWinCounts(runner, userIds);

  const candidates = apps.map((app) => {
    const uid = Number(app.freelancer_user_id);
    const ctx = contextMap.get(uid) || fairCtx.emptyActivationFairContext();
    const waitingDays = (() => {
      const anchor =
        ctx.trialStartedAt || ctx.firstBidAt || app.submitted_at || app.created_at;
      if (!anchor) return 0;
      const ms = now.getTime() - new Date(anchor).getTime();
      return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
    })();
    const metrics = {
      applicationId: Number(app.id),
      freelancerUserId: uid,
      isTrialActive: String(ctx.trialStatus || "") === "trial_active",
      isPaidActive: Boolean(ctx.hasActivePaidSilver),
      acceptedActivationWorkCount: toInt(ctx.acceptedActivationWorkCount, 0),
      publishedActivationWorkCount: toInt(ctx.publishedActivationWorkCount, 0),
      previousActivationWins: winMap.get(uid) || 0,
      previousActivationLosses: lossMap.get(uid) || 0,
      waitingLosses: lossMap.get(uid) || 0,
      activeAssignedMiniArticleWorkCount: toInt(ctx.activeAssignedWorkCount, 0),
      trialStartedAt: ctx.trialStartedAt,
      firstBidAt: ctx.firstBidAt,
      submittedAt: app.submitted_at || app.created_at,
      currentApplicationSubmittedAt: app.submitted_at || app.created_at,
      waitingDays,
    };
    const { weight, reasonTags } = computeWeightedFairWeight(metrics);
    return {
      applicationId: Number(app.id),
      freelancerUserId: uid,
      weight,
      reasonTags,
      metrics,
    };
  });

  // Rank by weight desc for audit display (lottery still uses weights, not rank).
  const ranked = [...candidates].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.applicationId - b.applicationId;
  });
  ranked.forEach((c, i) => {
    c.candidateRank = i + 1;
  });
  return ranked;
}

async function insertRun(runner, fields) {
  const { rows } = await runner.query(
    `INSERT INTO freelancer_activation_auto_assignment_runs (
       article_id, campaign_id, wave_id, plan_tier_code, run_type, status,
       skip_reason, error_code, required_bidders, qualified_bidders_count,
       selected_application_id, selected_freelancer_user_id,
       algorithm_version, seed, total_weight, metadata, triggered_by_user_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12,
       $13, $14, $15::numeric, $16::jsonb, $17
     ) RETURNING *`,
    [
      fields.articleId,
      fields.campaignId,
      fields.waveId,
      fields.planTierCode,
      fields.runType,
      fields.status,
      fields.skipReason || null,
      fields.errorCode || null,
      fields.requiredBidders ?? null,
      fields.qualifiedBiddersCount ?? null,
      fields.selectedApplicationId || null,
      fields.selectedFreelancerUserId || null,
      fields.algorithmVersion || ACTIVATION_WEIGHTED_FAIR_ALGORITHM_VERSION,
      fields.seed || null,
      fields.totalWeight != null ? String(fields.totalWeight) : null,
      fields.metadata ? JSON.stringify(fields.metadata) : null,
      fields.triggeredByUserId || null,
    ],
  );
  return rows[0];
}

async function insertCandidates(runner, runId, candidates, selectedApplicationId) {
  const out = [];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await runner.query(
      `INSERT INTO freelancer_activation_auto_assignment_candidates (
         run_id, application_id, freelancer_user_id, candidate_rank,
         weight, selected, metrics, reason_tags
       ) VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::jsonb, $8::jsonb)
       RETURNING *`,
      [
        runId,
        c.applicationId,
        c.freelancerUserId,
        c.candidateRank || null,
        String(c.weight),
        Number(c.applicationId) === Number(selectedApplicationId),
        JSON.stringify(c.metrics || {}),
        JSON.stringify(c.reasonTags || []),
      ],
    );
    out.push(rows[0]);
  }
  return out;
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    articleId: Number(row.article_id),
    campaignId: row.campaign_id != null ? Number(row.campaign_id) : null,
    waveId: row.wave_id != null ? Number(row.wave_id) : null,
    planTierCode: row.plan_tier_code || null,
    runType: row.run_type,
    status: row.status,
    skipReason: row.skip_reason || null,
    errorCode: row.error_code || null,
    requiredBidders: row.required_bidders != null ? Number(row.required_bidders) : null,
    qualifiedBiddersCount:
      row.qualified_bidders_count != null ? Number(row.qualified_bidders_count) : null,
    selectedApplicationId:
      row.selected_application_id != null ? Number(row.selected_application_id) : null,
    selectedFreelancerUserId:
      row.selected_freelancer_user_id != null ? Number(row.selected_freelancer_user_id) : null,
    algorithmVersion: row.algorithm_version,
    seed: row.seed || null,
    totalWeight: row.total_weight != null ? String(row.total_weight) : null,
    metadata: row.metadata || null,
    triggeredByUserId:
      row.triggered_by_user_id != null ? Number(row.triggered_by_user_id) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapCandidate(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    runId: Number(row.run_id),
    applicationId: Number(row.application_id),
    freelancerUserId: Number(row.freelancer_user_id),
    candidateRank: row.candidate_rank != null ? Number(row.candidate_rank) : null,
    weight: String(row.weight),
    selected: Boolean(row.selected),
    metrics: row.metrics || null,
    reasonTags: row.reason_tags || null,
    createdAt: row.created_at || null,
  };
}

/**
 * Core runner. Concurrency-safe via article FOR UPDATE + unique completed index.
 */
async function runAutoAssignmentForArticle(articleId, {
  runType = "manual_admin_run",
  actorUserId = null,
  client = null,
  force = false,
} = {}) {
  const own = !client;
  const runner = client || (await pool.connect());
  const aid = Number(articleId);

  try {
    if (own) await runner.query("BEGIN");

    await runner.query(`SELECT id FROM marketplace_articles WHERE id = $1 FOR UPDATE`, [aid]);

    const readiness = await evaluateAutoAssignmentReadiness(aid, { client: runner });
    if (!readiness.ready && !force) {
      const skipped = await insertRun(runner, {
        articleId: aid,
        campaignId: readiness.article?.activation_campaign_id || null,
        waveId: readiness.article?.activation_wave_id || null,
        planTierCode: readiness.article?.activation_plan_tier_code || null,
        runType,
        status: "skipped",
        skipReason: readiness.skipReason || "not_ready",
        errorCode: readiness.skipReason === "auto_assign_disabled"
          ? ACTIVATION_AUTO_ASSIGN_ERROR_CODES.DISABLED
          : readiness.skipReason === "below_min_bidders"
            ? ACTIVATION_AUTO_ASSIGN_ERROR_CODES.BELOW_MIN_BIDDERS
            : ACTIVATION_AUTO_ASSIGN_ERROR_CODES.BLOCKED,
        requiredBidders: readiness.requiredBidders,
        qualifiedBiddersCount: readiness.qualifiedBiddersCount,
        triggeredByUserId: actorUserId,
        metadata: { status: readiness.status },
      });
      if (own) await runner.query("COMMIT");
      return {
        autoAssigned: false,
        run: mapRun(skipped),
        candidates: [],
        readiness,
      };
    }

    // Already has completed run?
    const { rows: existingCompleted } = await runner.query(
      `SELECT * FROM freelancer_activation_auto_assignment_runs
        WHERE article_id = $1 AND status = 'completed'
        LIMIT 1`,
      [aid],
    );
    if (existingCompleted[0]) {
      const { rows: cands } = await runner.query(
        `SELECT * FROM freelancer_activation_auto_assignment_candidates WHERE run_id = $1`,
        [existingCompleted[0].id],
      );
      if (own) await runner.query("COMMIT");
      return {
        autoAssigned: true,
        alreadyAssigned: true,
        run: mapRun(existingCompleted[0]),
        candidates: cands.map(mapCandidate),
        readiness,
      };
    }

    const candidates = await computeWeightedFairCandidates(aid, { client: runner });
    if (!candidates.length) {
      const skipped = await insertRun(runner, {
        articleId: aid,
        campaignId: readiness.article?.activation_campaign_id || null,
        waveId: readiness.article?.activation_wave_id || null,
        planTierCode: readiness.article?.activation_plan_tier_code || null,
        runType,
        status: "skipped",
        skipReason: "no_candidates",
        errorCode: ACTIVATION_AUTO_ASSIGN_ERROR_CODES.NO_CANDIDATES,
        requiredBidders: readiness.requiredBidders,
        qualifiedBiddersCount: readiness.qualifiedBiddersCount,
        triggeredByUserId: actorUserId,
      });
      if (own) await runner.query("COMMIT");
      return { autoAssigned: false, run: mapRun(skipped), candidates: [], readiness };
    }

    const roundId = readiness.article?.current_bid_collection_round_id || "none";
    const provisionalRunId = `pending:${aid}:${Date.now()}`;
    const seedString = `${aid}:${roundId}:${candidates.length}:${provisionalRunId}`;
    const pick = selectWeightedFairIndex(candidates, seedString);
    if (pick.index < 0) {
      throw createAppError("Weighted lottery failed.", 500, {
        exposeToClient: true,
        publicCode: ACTIVATION_AUTO_ASSIGN_ERROR_CODES.SELECTION_FAILED,
      });
    }
    const winner = candidates[pick.index];

    // Persist run as completed only after successful selection.
    // First insert a placeholder then update — or insert completed after select.
    // Select via existing path (own transaction if we pass no client — we need shared).
    const applicationsService = require("./marketplaceArticleApplicationsService");

    let selectionResult;
    try {
      selectionResult = await applicationsService.selectArticleApplication({
        applicationId: winner.applicationId,
        actorUserId: actorUserId || null,
        overrideReason: ACTIVATION_AUTO_ASSIGN_OVERRIDE_REASON,
        client: runner,
        selectionSource: "activation_weighted_fair_auto_assign",
      });
    } catch (err) {
      const code = err?.publicCode || ACTIVATION_AUTO_ASSIGN_ERROR_CODES.SELECTION_FAILED;
      const isBudget =
        String(code).includes("BUDGET") || String(err?.message || "").toLowerCase().includes("budget");
      const failed = await insertRun(runner, {
        articleId: aid,
        campaignId: readiness.article?.activation_campaign_id || null,
        waveId: readiness.article?.activation_wave_id || null,
        planTierCode: readiness.article?.activation_plan_tier_code || null,
        runType,
        status: isBudget ? "skipped" : "failed",
        skipReason: isBudget ? "insufficient_budget" : "selection_failed",
        errorCode: isBudget
          ? ACTIVATION_AUTO_ASSIGN_ERROR_CODES.BUDGET_INSUFFICIENT
          : code,
        requiredBidders: readiness.requiredBidders,
        qualifiedBiddersCount: readiness.qualifiedBiddersCount,
        algorithmVersion: ACTIVATION_WEIGHTED_FAIR_ALGORITHM_VERSION,
        seed: String(pick.seed),
        totalWeight: pick.totalWeight,
        triggeredByUserId: actorUserId,
        metadata: {
          intendedApplicationId: winner.applicationId,
          errorMessage: err?.message || null,
          autoApprove: false,
          autoSettle: false,
          autoPublish: false,
        },
      });
      await insertCandidates(runner, failed.id, candidates, null);
      if (own) await runner.query("COMMIT");
      return {
        autoAssigned: false,
        run: mapRun(failed),
        candidates: candidates.map((c) => ({
          ...c,
          selected: false,
        })),
        error: err,
        readiness,
      };
    }

    const completed = await insertRun(runner, {
      articleId: aid,
      campaignId: readiness.article?.activation_campaign_id || null,
      waveId: readiness.article?.activation_wave_id || null,
      planTierCode: readiness.article?.activation_plan_tier_code || null,
      runType,
      status: "completed",
      requiredBidders: readiness.requiredBidders,
      qualifiedBiddersCount: readiness.qualifiedBiddersCount,
      selectedApplicationId: winner.applicationId,
      selectedFreelancerUserId: winner.freelancerUserId,
      algorithmVersion: ACTIVATION_WEIGHTED_FAIR_ALGORITHM_VERSION,
      seed: String(pick.seed),
      totalWeight: pick.totalWeight,
      triggeredByUserId: actorUserId,
      metadata: {
        draw: pick.draw,
        autoApprove: false,
        autoSettle: false,
        autoPublish: false,
        selectionSource: "activation_weighted_fair_auto_assign",
        alreadySelected: Boolean(selectionResult?.alreadySelected),
      },
    });
    const savedCandidates = await insertCandidates(
      runner,
      completed.id,
      candidates,
      winner.applicationId,
    );

    if (own) await runner.query("COMMIT");
    return {
      autoAssigned: true,
      run: mapRun(completed),
      candidates: savedCandidates.map(mapCandidate),
      selectedApplicationId: winner.applicationId,
      selectedFreelancerUserId: winner.freelancerUserId,
      selectionResult,
      readiness,
    };
  } catch (err) {
    if (own) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (isMissingSchema(err)) throw schemaMissingError();
    if (err?.code === "23505") {
      // Concurrent completed run — treat as already assigned
      const readiness = await evaluateAutoAssignmentReadiness(aid, { client: runner }).catch(() => null);
      return {
        autoAssigned: true,
        alreadyAssigned: true,
        concurrent: true,
        readiness,
      };
    }
    throw err;
  } finally {
    if (own) runner.release();
  }
}

/**
 * Post-apply trigger (after Bid reserve + commit). Never throws to caller.
 */
async function maybeTriggerAfterApplication({ articleId, applicationId = null } = {}) {
  try {
    const readiness = await evaluateAutoAssignmentReadiness(articleId);
    if (!readiness.ready) {
      return { triggered: false, reason: readiness.skipReason || readiness.status };
    }
    const result = await runAutoAssignmentForArticle(articleId, {
      runType: "auto_after_min_bidders",
      actorUserId: null,
    });
    return { triggered: true, applicationId, ...result };
  } catch (err) {
    return {
      triggered: false,
      reason: "trigger_error",
      errorCode: err?.publicCode || err?.code || null,
      message: err?.message || null,
    };
  }
}

async function getLatestAutoAssignmentForArticle(articleId, { client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT * FROM freelancer_activation_auto_assignment_runs
        WHERE article_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [Number(articleId)],
    );
    if (!rows[0]) {
      const readiness = await evaluateAutoAssignmentReadiness(articleId, { client: runner });
      return {
        schemaReady: true,
        run: null,
        candidates: [],
        readiness,
        autoAssignedBadge: false,
      };
    }
    const { rows: cands } = await runner.query(
      `SELECT * FROM freelancer_activation_auto_assignment_candidates
        WHERE run_id = $1
        ORDER BY candidate_rank ASC NULLS LAST, id ASC`,
      [rows[0].id],
    );
    const readiness = await evaluateAutoAssignmentReadiness(articleId, { client: runner });
    return {
      schemaReady: true,
      run: mapRun(rows[0]),
      candidates: cands.map(mapCandidate),
      readiness,
      autoAssignedBadge: rows[0].status === "completed",
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return { schemaReady: false, run: null, candidates: [], autoAssignedBadge: false };
    }
    throw err;
  }
}

module.exports = {
  hashSeedString,
  mulberry32,
  computeWeightedFairWeight,
  selectWeightedFairIndex,
  isAutoAssignEnabledOnArticle,
  evaluateAutoAssignmentReadiness,
  computeWeightedFairCandidates,
  runAutoAssignmentForArticle,
  maybeTriggerAfterApplication,
  getLatestAutoAssignmentForArticle,
  ACTIVATION_WEIGHTED_FAIR_ALGORITHM_VERSION,
  ACTIVATION_AUTO_ASSIGN_OVERRIDE_REASON,
};
