/**
 * Freelancer Activation Engine — Phase A3 campaigns / waves / budget foundation.
 * Phase A4.1 adds article attachment helpers and pause/emergency-stop apply/assignment guards.
 * Phase A4.2 reserves/releases/uses campaign-wave budget on assignment/void/settlement.
 * Does not auto-create articles. Does not change wallet/claims/settlement math.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { parseJodToMillis, millisToJodString } = require("../utils/marketplaceBidPoolMoney");
const {
  FREELANCER_ACTIVATION_ERROR_CODES,
  FREELANCER_ACTIVATION_CAMPAIGN_STATUSES,
  FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS,
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
  normalizeSilverPlanCode,
} = require("../constants/freelancerActivationEngine");
const { getActivationEngineSettings } = require("./freelancerActivationEngineService");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function throwSchemaMissing() {
  throw createAppError("Freelancer activation campaign schema is not applied.", 503, {
    exposeToClient: true,
    publicCode: FREELANCER_ACTIVATION_ERROR_CODES.SCHEMA_MISSING,
  });
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseMoney(value, fallback, label) {
  if (value === undefined || value === null || value === "") {
    return parseJodToMillis(fallback, {
      label,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    });
  }
  return parseJodToMillis(value, {
    label,
    publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
  });
}

function assertShareSplit({ articleTotalMillis, freelancerMillis, companyMillis, reviewerMillis }) {
  if (freelancerMillis + companyMillis + reviewerMillis !== articleTotalMillis) {
    throw createAppError("Freelancer, company, and reviewer shares must sum to the article total value.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_SHARE_SPLIT,
    });
  }
}

function assertDateWindow(startsAt, endsAt) {
  if (!startsAt && !endsAt) return { startsAt: null, endsAt: null };
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && Number.isNaN(start.getTime())) {
    throw createAppError("Invalid starts_at.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    });
  }
  if (end && Number.isNaN(end.getTime())) {
    throw createAppError("Invalid ends_at.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    });
  }
  if (start && end && end.getTime() <= start.getTime()) {
    throw createAppError("ends_at must be after starts_at.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    });
  }
  return {
    startsAt: start ? start.toISOString() : null,
    endsAt: end ? end.toISOString() : null,
  };
}

function computeBudgetSummaryFromParts({
  totalMillis,
  reservedMillis,
  usedMillis,
  allocatedToWavesMillis = 0,
}) {
  const remainingMillis = Math.max(0, totalMillis - reservedMillis - usedMillis);
  const unallocatedMillis = Math.max(0, totalMillis - allocatedToWavesMillis);
  return {
    totalBudgetJod: millisToJodString(totalMillis),
    reservedBudgetJod: millisToJodString(reservedMillis),
    usedBudgetJod: millisToJodString(usedMillis),
    remainingBudgetJod: millisToJodString(remainingMillis),
    allocatedToWavesJod: millisToJodString(allocatedToWavesMillis),
    unallocatedBudgetJod: millisToJodString(unallocatedMillis),
  };
}

function mapCampaignRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    status: row.status,
    totalBudgetJod: millisToJodString(parseJodToMillis(row.total_budget_jod, {
      label: "total",
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    })),
    reservedBudgetJod: millisToJodString(parseJodToMillis(row.reserved_budget_jod, {
      label: "reserved",
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    })),
    usedBudgetJod: millisToJodString(parseJodToMillis(row.used_budget_jod, {
      label: "used",
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    })),
    articleTotalValueJod: String(row.article_total_value_jod),
    freelancerShareJod: String(row.freelancer_share_jod),
    companyShareJod: String(row.company_share_jod),
    reviewerShareJod: String(row.reviewer_share_jod),
    trialBidLimit: toInt(row.trial_bid_limit, 20),
    trialDurationDays: toInt(row.trial_duration_days, 10),
    dailyBidLimit: toInt(row.daily_bid_limit, 2),
    minimumBiddersPerArticle: toInt(row.minimum_bidders_per_article, 10),
    maxTrialWins: toInt(row.max_trial_wins, 2),
    dailyArticleBudgetJod: row.daily_article_budget_jod != null ? String(row.daily_article_budget_jod) : null,
    maxDailyArticles: row.max_daily_articles != null ? toInt(row.max_daily_articles, null) : null,
    verificationRequired: row.verification_required !== false,
    trainingRequired: row.training_required !== false,
    autoPublishToBildazo: row.auto_publish_to_bildazo !== false,
    emergencyStopEnabled: Boolean(row.emergency_stop_enabled),
    pauseNewAssignments: Boolean(row.pause_new_assignments),
    silverPlanCode: row.silver_plan_code || "silver",
    silverPriceJod: String(row.silver_price_jod),
    workInventoryPercentage:
      row.work_inventory_percentage != null ? toInt(row.work_inventory_percentage, null) : null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapWaveRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    name: row.name,
    status: row.status,
    budgetJod: String(row.budget_jod),
    reservedBudgetJod: String(row.reserved_budget_jod),
    usedBudgetJod: String(row.used_budget_jod),
    targetFreelancers: row.target_freelancers != null ? toInt(row.target_freelancers, null) : null,
    dailyBudgetJod: row.daily_budget_jod != null ? String(row.daily_budget_jod) : null,
    maxDailyArticles: row.max_daily_articles != null ? toInt(row.max_daily_articles, null) : null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function moneyMillis(value) {
  return parseJodToMillis(value, {
    label: "amount",
    publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
  });
}

function computeCampaignBudgetSummary(campaign, waves = []) {
  const allocated = waves
    .filter((w) => w.status !== "archived")
    .reduce((sum, w) => sum + moneyMillis(w.budgetJod), 0);
  return computeBudgetSummaryFromParts({
    totalMillis: moneyMillis(campaign.totalBudgetJod),
    reservedMillis: moneyMillis(campaign.reservedBudgetJod),
    usedMillis: moneyMillis(campaign.usedBudgetJod),
    allocatedToWavesMillis: allocated,
  });
}

function computeWaveBudgetSummary(wave) {
  return computeBudgetSummaryFromParts({
    totalMillis: moneyMillis(wave.budgetJod),
    reservedMillis: moneyMillis(wave.reservedBudgetJod),
    usedMillis: moneyMillis(wave.usedBudgetJod),
    allocatedToWavesMillis: 0,
  });
}

function assertStatus(status) {
  const s = String(status || "").trim();
  if (!FREELANCER_ACTIVATION_CAMPAIGN_STATUSES.includes(s)) {
    throw createAppError("Invalid campaign/wave status.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_STATUS_TRANSITION,
    });
  }
  return s;
}

function assertSafeTransition(from, to) {
  if (from === to) return;
  const allowed = {
    draft: ["active", "paused", "archived"],
    active: ["paused", "completed", "archived"],
    paused: ["active", "archived", "completed"],
    completed: ["archived"],
    archived: [],
  };
  if (!(allowed[from] || []).includes(to)) {
    throw createAppError(`Cannot change status from ${from} to ${to}.`, 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_STATUS_TRANSITION,
    });
  }
}

async function getActivationCampaignSettingsSnapshot({ client = null } = {}) {
  const settings = await getActivationEngineSettings(client || pool);
  return {
    engineEnabled: Boolean(settings.engineEnabled),
    trialDurationDays: settings.trialDurationDays,
    trialBids: settings.trialBids,
    dailyBidLimit: settings.dailyBidLimit,
    successfulWorkCap: settings.successfulWorkCap,
    requiresTraining: settings.requiresTraining,
    requiresVerification: settings.requiresVerification,
    silverPlanCode: settings.silverPlanCode,
    archiveAfterDays: settings.archiveAfterDays,
    campaignDefaults: {
      ...FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS,
      trialBidLimit: settings.trialBids ?? FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.trialBids,
      trialDurationDays: settings.trialDurationDays,
      dailyBidLimit: settings.dailyBidLimit,
      maxTrialWins: settings.successfulWorkCap,
      verificationRequired: settings.requiresVerification,
      trainingRequired: settings.requiresTraining,
      silverPlanCode: settings.silverPlanCode,
    },
  };
}

async function insertBudgetEntry(client, row) {
  const params = [
    row.campaignId,
    row.waveId || null,
    row.entryType,
    row.amountJod,
    JSON.stringify(row.metadata || {}),
    row.createdByUserId || null,
    row.articleId || null,
    row.applicationId || null,
    row.freelancerUserId || null,
  ];
  try {
    await client.query(
      `INSERT INTO freelancer_activation_budget_entries (
         campaign_id, wave_id, entry_type, amount_jod, metadata, created_by_user_id,
         article_id, application_id, freelancer_user_id
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
      params,
    );
    return { duplicate: false };
  } catch (err) {
    if (err?.code === "23505") return { duplicate: true };
    if (err?.code === "42703") {
      await client.query(
        `INSERT INTO freelancer_activation_budget_entries (
           campaign_id, wave_id, entry_type, amount_jod, metadata, created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        params.slice(0, 6),
      );
      return { duplicate: false };
    }
    throw err;
  }
}

async function loadWaves(runner, campaignId) {
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_activation_waves
      WHERE campaign_id = $1
      ORDER BY created_at DESC, id DESC`,
    [campaignId],
  );
  return rows.map(mapWaveRow);
}

async function loadCampaign(runner, id) {
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_activation_campaigns WHERE id = $1 LIMIT 1`,
    [id],
  );
  return mapCampaignRow(rows[0]);
}

function normalizeCampaignInput(body, snapshotDefaults) {
  const d = snapshotDefaults || FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS;
  const name = String(body.name || "").trim();
  if (!name) {
    throw createAppError("Campaign name is required.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    });
  }
  const totalMillis = parseMoney(body.totalBudgetJod, d.totalBudgetJod, "total budget");
  const articleMillis = parseMoney(body.articleTotalValueJod, d.articleTotalValueJod, "article total value");
  const freelancerMillis = parseMoney(body.freelancerShareJod, d.freelancerShareJod, "freelancer share");
  const companyMillis = parseMoney(body.companyShareJod, d.companyShareJod, "company share");
  const reviewerMillis = parseMoney(body.reviewerShareJod, d.reviewerShareJod, "reviewer share");
  assertShareSplit({
    articleTotalMillis: articleMillis,
    freelancerMillis,
    companyMillis,
    reviewerMillis,
  });
  const dates = assertDateWindow(body.startsAt, body.endsAt);
  const dailyArticleBudget =
    body.dailyArticleBudgetJod === undefined || body.dailyArticleBudgetJod === null || body.dailyArticleBudgetJod === ""
      ? null
      : millisToJodString(parseMoney(body.dailyArticleBudgetJod, "0", "daily article budget"));
  return {
    name,
    status: body.status ? assertStatus(body.status) : "draft",
    totalBudgetJod: millisToJodString(totalMillis),
    articleTotalValueJod: millisToJodString(articleMillis),
    freelancerShareJod: millisToJodString(freelancerMillis),
    companyShareJod: millisToJodString(companyMillis),
    reviewerShareJod: millisToJodString(reviewerMillis),
    trialBidLimit: toInt(body.trialBidLimit, d.trialBidLimit),
    trialDurationDays: toInt(body.trialDurationDays, d.trialDurationDays),
    dailyBidLimit: toInt(body.dailyBidLimit, d.dailyBidLimit),
    minimumBiddersPerArticle: toInt(body.minimumBiddersPerArticle, d.minimumBiddersPerArticle),
    maxTrialWins: toInt(body.maxTrialWins, d.maxTrialWins),
    dailyArticleBudgetJod: dailyArticleBudget,
    maxDailyArticles:
      body.maxDailyArticles === undefined || body.maxDailyArticles === null || body.maxDailyArticles === ""
        ? null
        : toInt(body.maxDailyArticles, null),
    verificationRequired: body.verificationRequired !== undefined ? Boolean(body.verificationRequired) : d.verificationRequired,
    trainingRequired: body.trainingRequired !== undefined ? Boolean(body.trainingRequired) : d.trainingRequired,
    autoPublishToBildazo: body.autoPublishToBildazo !== undefined ? Boolean(body.autoPublishToBildazo) : d.autoPublishToBildazo,
    silverPlanCode: normalizeSilverPlanCode(body.silverPlanCode || d.silverPlanCode),
    silverPriceJod: millisToJodString(parseMoney(body.silverPriceJod, d.silverPriceJod, "silver price")),
    workInventoryPercentage:
      body.workInventoryPercentage === undefined || body.workInventoryPercentage === null || body.workInventoryPercentage === ""
        ? null
        : toInt(body.workInventoryPercentage, null),
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
  };
}

async function createActivationCampaign(body = {}, { client: externalClient = null, actorUserId = null } = {}) {
  const snapshot = await getActivationCampaignSettingsSnapshot({ client: externalClient });
  const input = normalizeCampaignInput(body, snapshot.campaignDefaults);
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO freelancer_activation_campaigns (
         name, status, total_budget_jod,
         article_total_value_jod, freelancer_share_jod, company_share_jod, reviewer_share_jod,
         trial_bid_limit, trial_duration_days, daily_bid_limit,
         minimum_bidders_per_article, max_trial_wins,
         daily_article_budget_jod, max_daily_articles,
         verification_required, training_required, auto_publish_to_bildazo,
         silver_plan_code, silver_price_jod, work_inventory_percentage,
         starts_at, ends_at, created_by_user_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       ) RETURNING *`,
      [
        input.name,
        input.status,
        input.totalBudgetJod,
        input.articleTotalValueJod,
        input.freelancerShareJod,
        input.companyShareJod,
        input.reviewerShareJod,
        input.trialBidLimit,
        input.trialDurationDays,
        input.dailyBidLimit,
        input.minimumBiddersPerArticle,
        input.maxTrialWins,
        input.dailyArticleBudgetJod,
        input.maxDailyArticles,
        input.verificationRequired,
        input.trainingRequired,
        input.autoPublishToBildazo,
        input.silverPlanCode,
        input.silverPriceJod,
        input.workInventoryPercentage,
        input.startsAt,
        input.endsAt,
        actorUserId,
      ],
    );
    const campaign = mapCampaignRow(rows[0]);
    await insertBudgetEntry(client, {
      campaignId: campaign.id,
      entryType: "budget_allocated",
      amountJod: campaign.totalBudgetJod,
      metadata: { source: "campaign_create" },
      createdByUserId: actorUserId,
    });
    if (own) await client.query("COMMIT");
    return {
      campaign,
      budget: computeCampaignBudgetSummary(campaign, []),
    };
  } catch (err) {
    if (own) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    }
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function listActivationCampaigns({ client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT * FROM freelancer_activation_campaigns ORDER BY updated_at DESC, id DESC`,
    );
    const campaigns = [];
    for (const row of rows) {
      const campaign = mapCampaignRow(row);
      const waves = await loadWaves(runner, campaign.id);
      campaigns.push({
        ...campaign,
        budget: computeCampaignBudgetSummary(campaign, waves),
        waveCount: waves.length,
        waves: waves.map((w) => ({ id: w.id, name: w.name, status: w.status })),
      });
    }
    return { campaigns };
  } catch (err) {
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  }
}

async function getActivationCampaignDetail(id, { client = null } = {}) {
  const runner = client || pool;
  const campaignId = Number(id);
  try {
    const campaign = await loadCampaign(runner, campaignId);
    if (!campaign) {
      throw createAppError("Campaign not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_FOUND,
      });
    }
    const waves = await loadWaves(runner, campaignId);
    let linkedArticlesCount = 0;
    let assignedArticleCount = 0;
    let acceptedArticleCount = 0;
    try {
      const work = await countActivationWork(runner, { campaignId });
      linkedArticlesCount = work.linkedArticlesCount;
      assignedArticleCount = work.assignedArticleCount;
      acceptedArticleCount = work.acceptedArticleCount;
    } catch (err) {
      if (!isMissingSchema(err)) throw err;
    }
    const wavesWithCounts = [];
    for (const wave of waves) {
      let waveWork = { linkedArticlesCount: 0, assignedArticleCount: 0, acceptedArticleCount: 0 };
      try {
        waveWork = await countActivationWork(runner, { waveId: wave.id });
      } catch (err) {
        if (!isMissingSchema(err)) throw err;
      }
      wavesWithCounts.push({
        ...wave,
        budget: computeWaveBudgetSummary(wave),
        linkedArticlesCount: waveWork.linkedArticlesCount,
        assignedArticleCount: waveWork.assignedArticleCount,
        acceptedArticleCount: waveWork.acceptedArticleCount,
      });
    }
    const { rows: entries } = await runner.query(
      `SELECT * FROM freelancer_activation_budget_entries
        WHERE campaign_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 50`,
      [campaignId],
    );
    return {
      campaign,
      waves: wavesWithCounts,
      linkedArticlesCount,
      assignedArticleCount,
      acceptedArticleCount,
      budget: computeCampaignBudgetSummary(campaign, waves),
      recentBudgetEntries: entries.map((e) => ({
        id: Number(e.id),
        campaignId: Number(e.campaign_id),
        waveId: e.wave_id != null ? Number(e.wave_id) : null,
        entryType: e.entry_type,
        amountJod: String(e.amount_jod),
        createdAt: e.created_at,
      })),
    };
  } catch (err) {
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  }
}

async function updateActivationCampaign(id, patch = {}, { client: externalClient = null } = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const current = await loadCampaign(client, Number(id));
    if (!current) {
      throw createAppError("Campaign not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_FOUND,
      });
    }
    const merged = normalizeCampaignInput({ ...current, ...patch, name: patch.name ?? current.name }, {
      ...FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS,
      ...current,
    });
    if (patch.status && patch.status !== current.status) {
      assertSafeTransition(current.status, assertStatus(patch.status));
      merged.status = patch.status;
    } else {
      merged.status = current.status;
    }
    const waves = await loadWaves(client, current.id);
    const allocated = waves
      .filter((w) => w.status !== "archived")
      .reduce((sum, w) => sum + moneyMillis(w.budgetJod), 0);
    const newTotal = moneyMillis(merged.totalBudgetJod);
    if (newTotal < allocated) {
      throw createAppError("Campaign total budget cannot be below allocated wave budgets.", 400, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_BUDGET_EXCEEDS_CAMPAIGN,
      });
    }
    if (newTotal < moneyMillis(current.reservedBudgetJod) + moneyMillis(current.usedBudgetJod)) {
      throw createAppError("Campaign total cannot be below reserved + used budget.", 400, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
      });
    }
    const { rows } = await client.query(
      `UPDATE freelancer_activation_campaigns SET
         name = $2, status = $3, total_budget_jod = $4,
         article_total_value_jod = $5, freelancer_share_jod = $6,
         company_share_jod = $7, reviewer_share_jod = $8,
         trial_bid_limit = $9, trial_duration_days = $10, daily_bid_limit = $11,
         minimum_bidders_per_article = $12, max_trial_wins = $13,
         daily_article_budget_jod = $14, max_daily_articles = $15,
         verification_required = $16, training_required = $17, auto_publish_to_bildazo = $18,
         silver_plan_code = $19, silver_price_jod = $20, work_inventory_percentage = $21,
         starts_at = $22, ends_at = $23, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        current.id,
        merged.name,
        merged.status,
        merged.totalBudgetJod,
        merged.articleTotalValueJod,
        merged.freelancerShareJod,
        merged.companyShareJod,
        merged.reviewerShareJod,
        merged.trialBidLimit,
        merged.trialDurationDays,
        merged.dailyBidLimit,
        merged.minimumBiddersPerArticle,
        merged.maxTrialWins,
        merged.dailyArticleBudgetJod,
        merged.maxDailyArticles,
        merged.verificationRequired,
        merged.trainingRequired,
        merged.autoPublishToBildazo,
        merged.silverPlanCode,
        merged.silverPriceJod,
        merged.workInventoryPercentage,
        merged.startsAt,
        merged.endsAt,
      ],
    );
    if (own) await client.query("COMMIT");
    const campaign = mapCampaignRow(rows[0]);
    return { campaign, budget: computeCampaignBudgetSummary(campaign, waves) };
  } catch (err) {
    if (own) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    }
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function setCampaignLifecycle(id, { status, emergencyStopEnabled, pauseNewAssignments }, { client: externalClient = null } = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const current = await loadCampaign(client, Number(id));
    if (!current) {
      throw createAppError("Campaign not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_FOUND,
      });
    }
    if (status && status !== current.status) {
      assertSafeTransition(current.status, assertStatus(status));
    }
    const nextStatus = status || current.status;
    const { rows } = await client.query(
      `UPDATE freelancer_activation_campaigns SET
         status = $2,
         emergency_stop_enabled = $3,
         pause_new_assignments = $4,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [current.id, nextStatus, Boolean(emergencyStopEnabled), Boolean(pauseNewAssignments)],
    );
    if (emergencyStopEnabled) {
      await client.query(
        `UPDATE freelancer_activation_waves
            SET status = 'paused', updated_at = NOW()
          WHERE campaign_id = $1 AND status = 'active'`,
        [current.id],
      );
    }
    if (own) await client.query("COMMIT");
    const campaign = mapCampaignRow(rows[0]);
    const waves = await loadWaves(client, campaign.id);
    return { campaign, budget: computeCampaignBudgetSummary(campaign, waves), waves };
  } catch (err) {
    if (own) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    }
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function pauseCampaign(id, opts = {}) {
  return setCampaignLifecycle(id, {
    status: "paused",
    emergencyStopEnabled: false,
    pauseNewAssignments: true,
  }, opts);
}

async function resumeCampaign(id, opts = {}) {
  return setCampaignLifecycle(id, {
    status: "active",
    emergencyStopEnabled: false,
    pauseNewAssignments: false,
  }, opts);
}

async function emergencyStopCampaign(id, opts = {}) {
  return setCampaignLifecycle(id, {
    status: "paused",
    emergencyStopEnabled: true,
    pauseNewAssignments: true,
  }, opts);
}

async function listActivationWaves(campaignId, { client = null } = {}) {
  const runner = client || pool;
  try {
    const campaign = await loadCampaign(runner, Number(campaignId));
    if (!campaign) {
      throw createAppError("Campaign not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_FOUND,
      });
    }
    const waves = await loadWaves(runner, campaign.id);
    return {
      campaignId: campaign.id,
      waves: waves.map((wave) => ({ ...wave, budget: computeWaveBudgetSummary(wave) })),
    };
  } catch (err) {
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  }
}

function normalizeWaveInput(body, existing = null) {
  const name = String(body.name || existing?.name || "").trim();
  if (!name) {
    throw createAppError("Wave name is required.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    });
  }
  const dates = assertDateWindow(body.startsAt ?? existing?.startsAt, body.endsAt ?? existing?.endsAt);
  const budgetJod = millisToJodString(parseMoney(body.budgetJod, existing?.budgetJod || "0.000", "wave budget"));
  return {
    name,
    status: body.status ? assertStatus(body.status) : existing?.status || "draft",
    budgetJod,
    targetFreelancers:
      body.targetFreelancers === undefined || body.targetFreelancers === null || body.targetFreelancers === ""
        ? existing?.targetFreelancers ?? null
        : toInt(body.targetFreelancers, null),
    dailyBudgetJod:
      body.dailyBudgetJod === undefined || body.dailyBudgetJod === null || body.dailyBudgetJod === ""
        ? existing?.dailyBudgetJod ?? null
        : millisToJodString(parseMoney(body.dailyBudgetJod, "0", "wave daily budget")),
    maxDailyArticles:
      body.maxDailyArticles === undefined || body.maxDailyArticles === null || body.maxDailyArticles === ""
        ? existing?.maxDailyArticles ?? null
        : toInt(body.maxDailyArticles, null),
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
  };
}

async function createActivationWave(campaignId, body = {}, { client: externalClient = null, actorUserId = null } = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const campaign = await loadCampaign(client, Number(campaignId));
    if (!campaign) {
      throw createAppError("Campaign not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_FOUND,
      });
    }
    const input = normalizeWaveInput(body);
    const waves = await loadWaves(client, campaign.id);
    const allocated = waves
      .filter((w) => w.status !== "archived")
      .reduce((sum, w) => sum + moneyMillis(w.budgetJod), 0);
    const unallocated = moneyMillis(campaign.totalBudgetJod) - allocated;
    if (moneyMillis(input.budgetJod) > unallocated) {
      throw createAppError("Wave budget exceeds campaign unallocated budget.", 400, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_BUDGET_EXCEEDS_CAMPAIGN,
      });
    }
    const { rows } = await client.query(
      `INSERT INTO freelancer_activation_waves (
         campaign_id, name, status, budget_jod,
         target_freelancers, daily_budget_jod, max_daily_articles, starts_at, ends_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        campaign.id,
        input.name,
        input.status,
        input.budgetJod,
        input.targetFreelancers,
        input.dailyBudgetJod,
        input.maxDailyArticles,
        input.startsAt,
        input.endsAt,
      ],
    );
    const wave = mapWaveRow(rows[0]);
    await insertBudgetEntry(client, {
      campaignId: campaign.id,
      waveId: wave.id,
      entryType: "budget_allocated",
      amountJod: wave.budgetJod,
      metadata: { source: "wave_create" },
      createdByUserId: actorUserId,
    });
    if (own) await client.query("COMMIT");
    return { wave, budget: computeWaveBudgetSummary(wave) };
  } catch (err) {
    if (own) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    }
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function updateActivationWave(waveId, patch = {}, { client: externalClient = null } = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const { rows: found } = await client.query(
      `SELECT * FROM freelancer_activation_waves WHERE id = $1 LIMIT 1`,
      [Number(waveId)],
    );
    const existing = mapWaveRow(found[0]);
    if (!existing) {
      throw createAppError("Wave not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_FOUND,
      });
    }
    const input = normalizeWaveInput(patch, existing);
    if (patch.status && patch.status !== existing.status) {
      assertSafeTransition(existing.status, assertStatus(patch.status));
      input.status = patch.status;
    }
    const campaign = await loadCampaign(client, existing.campaignId);
    const waves = await loadWaves(client, existing.campaignId);
    const allocatedOthers = waves
      .filter((w) => w.status !== "archived" && w.id !== existing.id)
      .reduce((sum, w) => sum + moneyMillis(w.budgetJod), 0);
    const unallocated = moneyMillis(campaign.totalBudgetJod) - allocatedOthers;
    if (moneyMillis(input.budgetJod) > unallocated) {
      throw createAppError("Wave budget exceeds campaign unallocated budget.", 400, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_BUDGET_EXCEEDS_CAMPAIGN,
      });
    }
    const { rows } = await client.query(
      `UPDATE freelancer_activation_waves SET
         name = $2, status = $3, budget_jod = $4,
         target_freelancers = $5, daily_budget_jod = $6, max_daily_articles = $7,
         starts_at = $8, ends_at = $9, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        existing.id,
        input.name,
        input.status,
        input.budgetJod,
        input.targetFreelancers,
        input.dailyBudgetJod,
        input.maxDailyArticles,
        input.startsAt,
        input.endsAt,
      ],
    );
    if (own) await client.query("COMMIT");
    const wave = mapWaveRow(rows[0]);
    return { wave, budget: computeWaveBudgetSummary(wave) };
  } catch (err) {
    if (own) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    }
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  } finally {
    if (own) client.release();
  }
}

function parseOptionalPositiveId(value) {
  if (value === undefined) return { present: false, id: null };
  if (value === null || value === "" || value === 0 || value === "0") {
    return { present: true, id: null };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw createAppError("معرّف الحملة أو الموجة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_ATTACHMENT,
    });
  }
  return { present: true, id: n };
}

function assertAttachableLifecycle(entity, { kind }) {
  const status = String(entity?.status || "");
  if (status === "archived" || status === "completed") {
    throw createAppError(
      kind === "wave"
        ? "لا يمكن ربط مقال بموجة مكتملة أو مؤرشفة."
        : "لا يمكن ربط مقال بحملة مكتملة أو مؤرشفة.",
      400,
      {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_ATTACHMENT,
      },
    );
  }
}

async function loadWave(runner, id) {
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_activation_waves WHERE id = $1 LIMIT 1`,
    [id],
  );
  return mapWaveRow(rows[0]);
}

async function resolveActivationAttachment(payload = {}, { client = null } = {}) {
  const runner = client || pool;
  const campaignParsed = parseOptionalPositiveId(
    payload.activationCampaignId ?? payload.activation_campaign_id,
  );
  const waveParsed = parseOptionalPositiveId(
    payload.activationWaveId ?? payload.activation_wave_id,
  );
  if (!campaignParsed.present && !waveParsed.present) {
    return { campaignId: null, waveId: null, skipped: true };
  }

  let campaignId = campaignParsed.present ? campaignParsed.id : null;
  let waveId = waveParsed.present ? waveParsed.id : null;

  if (campaignId == null && waveId == null) {
    return { campaignId: null, waveId: null, skipped: false };
  }

  try {
    if (waveId != null && campaignId == null) {
      const wave = await loadWave(runner, waveId);
      if (!wave) {
        throw createAppError("الموجة غير موجودة.", 404, {
          exposeToClient: true,
          publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_FOUND,
        });
      }
      campaignId = wave.campaignId;
    }

    if (campaignId == null) {
      return { campaignId: null, waveId: null, skipped: false };
    }

    const campaign = await loadCampaign(runner, campaignId);
    if (!campaign) {
      throw createAppError("الحملة غير موجودة.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_FOUND,
      });
    }
    assertAttachableLifecycle(campaign, { kind: "campaign" });

    if (waveId != null) {
      const wave = await loadWave(runner, waveId);
      if (!wave) {
        throw createAppError("الموجة غير موجودة.", 404, {
          exposeToClient: true,
          publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_FOUND,
        });
      }
      if (Number(wave.campaignId) !== Number(campaignId)) {
        throw createAppError("الموجة لا تنتمي إلى الحملة المحددة.", 400, {
          exposeToClient: true,
          publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_ATTACHMENT,
        });
      }
      assertAttachableLifecycle(wave, { kind: "wave" });
    }

    return { campaignId, waveId, skipped: false };
  } catch (err) {
    if (isMissingSchema(err)) throwSchemaMissing();
    throw err;
  }
}

async function persistArticleActivationAttachment(articleId, { campaignId, waveId }, { client } = {}) {
  const runner = client || pool;
  try {
    await runner.query(
      `UPDATE marketplace_articles
          SET activation_campaign_id = $2,
              activation_wave_id = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [Number(articleId), campaignId, waveId],
    );
  } catch (err) {
    if (isMissingSchema(err)) {
      if (campaignId || waveId) throwSchemaMissing();
      return;
    }
    throw err;
  }
}

function isOutsideActiveWindow(startsAt, endsAt, now) {
  const ts = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (startsAt) {
    const start = new Date(startsAt).getTime();
    if (Number.isFinite(start) && start > ts) return true;
  }
  if (endsAt) {
    const end = new Date(endsAt).getTime();
    if (Number.isFinite(end) && end < ts) return true;
  }
  return false;
}

const ACTIVATION_OPPORTUNITY_MESSAGES = Object.freeze({
  [FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_EMERGENCY_STOPPED]:
    "تم إيقاف الحملة مؤقتًا من الإدارة.",
  [FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_PAUSED]:
    "تم إيقاف الحملة مؤقتًا من الإدارة.",
  [FREELANCER_ACTIVATION_ERROR_CODES.WAVE_PAUSED]:
    "تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.",
  [FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_ACTIVE]:
    "تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.",
  [FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_ACTIVE]:
    "تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.",
});

function blockedOpportunity(code, extra = {}) {
  return {
    skipped: false,
    allowed: false,
    code,
    message: ACTIVATION_OPPORTUNITY_MESSAGES[code],
    ...extra,
  };
}

async function evaluateActivationOpportunityGate({ article, now = new Date(), client = null } = {}) {
  let settings;
  try {
    settings = await getActivationEngineSettings(client || pool);
  } catch {
    return { skipped: true, allowed: true, reason: "SETTINGS_UNAVAILABLE" };
  }
  if (!settings.engineEnabled) {
    return { skipped: true, allowed: true, reason: "ENGINE_OFF" };
  }

  const campaignId = toInt(article?.activation_campaign_id ?? article?.activationCampaignId, 0);
  if (!campaignId) {
    return { skipped: true, allowed: true, reason: "NO_CAMPAIGN" };
  }

  let campaign;
  try {
    campaign = await loadCampaign(client || pool, campaignId);
  } catch (err) {
    if (isMissingSchema(err)) {
      return { skipped: true, allowed: true, reason: "SCHEMA_MISSING" };
    }
    throw err;
  }
  if (!campaign) {
    return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_ACTIVE);
  }

  const waveId = toInt(article?.activation_wave_id ?? article?.activationWaveId, 0);
  let wave = null;
  if (waveId) {
    try {
      wave = await loadWave(client || pool, waveId);
    } catch (err) {
      if (isMissingSchema(err)) {
        return { skipped: true, allowed: true, reason: "SCHEMA_MISSING" };
      }
      throw err;
    }
  }

  if (campaign.emergencyStopEnabled) {
    return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_EMERGENCY_STOPPED);
  }
  if (campaign.pauseNewAssignments || campaign.status === "paused") {
    return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_PAUSED);
  }
  if (campaign.status === "completed" || campaign.status === "archived") {
    return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_ACTIVE);
  }
  if (isOutsideActiveWindow(campaign.startsAt, campaign.endsAt, now)) {
    return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_ACTIVE);
  }

  if (wave) {
    if (wave.status === "paused") {
      return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.WAVE_PAUSED);
    }
    if (wave.status === "completed" || wave.status === "archived") {
      return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_ACTIVE);
    }
    if (isOutsideActiveWindow(wave.startsAt, wave.endsAt, now)) {
      return blockedOpportunity(FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_ACTIVE);
    }
  }

  return { skipped: false, allowed: true, reason: "OPEN" };
}

async function assertActivationOpportunityOpen(opts = {}) {
  const result = await evaluateActivationOpportunityGate(opts);
  if (result.skipped || result.allowed) return result;
  throw createAppError(result.message, 409, {
    exposeToClient: true,
    publicCode: result.code,
  });
}

function deriveActivationBudgetState(row = {}) {
  if (row.activation_budget_used_at || row.activationBudgetUsedAt) return "used";
  if (row.activation_budget_released_at || row.activationBudgetReleasedAt) return "released";
  if (row.activation_budget_reserved_at || row.activationBudgetReservedAt) return "reserved";
  if (row.activation_campaign_id || row.activationCampaignId) return "not_reserved";
  return null;
}

function resolveActivationArticleBudgetAmount({ campaign, article } = {}) {
  // Prefer live article gross (A9.1 per-tier release) when present.
  const articleValue = article?.article_value_jod ?? article?.articleValueJod;
  if (articleValue != null && articleValue !== "") {
    return millisToJodString(parseJodToMillis(articleValue, {
      label: "article value",
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    }));
  }
  if (campaign?.articleTotalValueJod != null && campaign.articleTotalValueJod !== "") {
    return millisToJodString(parseJodToMillis(campaign.articleTotalValueJod, {
      label: "article total value",
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    }));
  }
  return millisToJodString(parseJodToMillis("1.000", {
    label: "article total value",
    publicCode: FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
  }));
}

function remainingMillisFromParts(totalJod, reservedJod, usedJod) {
  return moneyMillis(totalJod) - moneyMillis(reservedJod) - moneyMillis(usedJod);
}

async function countActivationWork(runner, { campaignId = null, waveId = null } = {}) {
  const id = campaignId != null ? Number(campaignId) : Number(waveId);
  const col = campaignId != null ? "activation_campaign_id" : "activation_wave_id";
  const empty = { assignedArticleCount: 0, acceptedArticleCount: 0, linkedArticlesCount: 0 };
  if (!Number.isInteger(id) || id < 1) return empty;
  try {
    const apps = await runner.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('selected', 'revision_requested'))::int AS assigned_n,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS accepted_n
         FROM marketplace_article_applications
        WHERE ${col} = $1`,
      [id],
    );
    const articles = await runner.query(
      `SELECT COUNT(*)::int AS n FROM marketplace_articles WHERE ${col} = $1`,
      [id],
    );
    return {
      assignedArticleCount: Number(apps.rows[0]?.assigned_n) || 0,
      acceptedArticleCount: Number(apps.rows[0]?.accepted_n) || 0,
      linkedArticlesCount: Number(articles.rows[0]?.n) || 0,
    };
  } catch (err) {
    if (isMissingSchema(err)) return empty;
    throw err;
  }
}

async function findBudgetEntry(client, { applicationId, entryType }) {
  const { rows } = await client.query(
    `SELECT * FROM freelancer_activation_budget_entries
      WHERE application_id = $1 AND entry_type = $2
      ORDER BY id DESC
      LIMIT 1`,
    [Number(applicationId), entryType],
  );
  return rows[0] || null;
}

async function lockCampaignAndWave(client, campaignId, waveId) {
  const { rows: campaignRows } = await client.query(
    `SELECT * FROM freelancer_activation_campaigns WHERE id = $1 FOR UPDATE`,
    [Number(campaignId)],
  );
  const campaign = mapCampaignRow(campaignRows[0]);
  let wave = null;
  if (waveId) {
    const { rows: waveRows } = await client.query(
      `SELECT * FROM freelancer_activation_waves WHERE id = $1 FOR UPDATE`,
      [Number(waveId)],
    );
    wave = mapWaveRow(waveRows[0]);
  }
  return { campaign, wave };
}

async function applyCounterDelta(client, { campaignId, waveId, reservedDeltaJod, usedDeltaJod }) {
  const reservedDelta = reservedDeltaJod || "0.000";
  const usedDelta = usedDeltaJod || "0.000";
  await client.query(
    `UPDATE freelancer_activation_campaigns
        SET reserved_budget_jod = reserved_budget_jod + $2::numeric,
            used_budget_jod = used_budget_jod + $3::numeric,
            updated_at = NOW()
      WHERE id = $1`,
    [Number(campaignId), reservedDelta, usedDelta],
  );
  if (waveId) {
    await client.query(
      `UPDATE freelancer_activation_waves
          SET reserved_budget_jod = reserved_budget_jod + $2::numeric,
              used_budget_jod = used_budget_jod + $3::numeric,
              updated_at = NOW()
        WHERE id = $1`,
      [Number(waveId), reservedDelta, usedDelta],
    );
  }
}

async function stampApplicationBudget(client, applicationId, patch) {
  const sets = [];
  const params = [Number(applicationId)];
  if (patch.amountJod != null) {
    params.push(patch.amountJod);
    sets.push(`activation_budget_amount_jod = COALESCE(activation_budget_amount_jod, $${params.length}::numeric)`);
  }
  if (patch.reserved) {
    sets.push("activation_budget_reserved_at = COALESCE(activation_budget_reserved_at, NOW())");
  }
  if (patch.released) {
    sets.push("activation_budget_released_at = COALESCE(activation_budget_released_at, NOW())");
  }
  if (patch.used) {
    sets.push("activation_budget_used_at = COALESCE(activation_budget_used_at, NOW())");
  }
  if (!sets.length) return;
  try {
    await client.query(
      `UPDATE marketplace_article_applications
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $1`,
      params,
    );
  } catch (err) {
    if (err?.code !== "42703") throw err;
  }
}

function resolveLinkedIds(article, application) {
  const campaignId = toInt(
    application?.activation_campaign_id
      ?? application?.activationCampaignId
      ?? article?.activation_campaign_id
      ?? article?.activationCampaignId,
    0,
  );
  const waveId = toInt(
    application?.activation_wave_id
      ?? application?.activationWaveId
      ?? article?.activation_wave_id
      ?? article?.activationWaveId,
    0,
  );
  return {
    campaignId: campaignId || null,
    waveId: waveId || null,
  };
}

async function engineAllowsBudgetOps(client) {
  try {
    const settings = await getActivationEngineSettings(client || pool);
    return Boolean(settings.engineEnabled);
  } catch {
    return false;
  }
}

async function reserveActivationBudgetForAssignment({
  client,
  article,
  application,
  actorUserId = null,
} = {}) {
  if (!client) {
    throw createAppError("Activation budget reserve requires a transaction client.", 500);
  }
  if (!(await engineAllowsBudgetOps(client))) {
    return { skipped: true, reason: "ENGINE_OFF" };
  }
  const ids = resolveLinkedIds(article, application);
  if (!ids.campaignId) {
    return { skipped: true, reason: "NO_CAMPAIGN" };
  }
  try {
    const { campaign, wave } = await lockCampaignAndWave(client, ids.campaignId, ids.waveId);
    if (!campaign) {
      throw createAppError("الحملة غير موجودة.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_FOUND,
      });
    }
    if (ids.waveId && !wave) {
      throw createAppError("الموجة غير موجودة.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_FOUND,
      });
    }
    const existing = await findBudgetEntry(client, {
      applicationId: application.id,
      entryType: "budget_reserved",
    });
    if (existing) {
      return { skipped: false, alreadyReserved: true, amountJod: String(existing.amount_jod) };
    }
    const amountJod = resolveActivationArticleBudgetAmount({ campaign, article });
    const amountMillis = moneyMillis(amountJod);
    const campaignRemaining = remainingMillisFromParts(
      campaign.totalBudgetJod,
      campaign.reservedBudgetJod,
      campaign.usedBudgetJod,
    );
    if (amountMillis > campaignRemaining) {
      throw createAppError("ميزانية الحملة لا تكفي لإسناد هذه المقالة.", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_BUDGET_INSUFFICIENT,
      });
    }
    if (wave) {
      const waveRemaining = remainingMillisFromParts(
        wave.budgetJod,
        wave.reservedBudgetJod,
        wave.usedBudgetJod,
      );
      if (amountMillis > waveRemaining) {
        throw createAppError("ميزانية الموجة لا تكفي لإسناد هذه المقالة.", 409, {
          exposeToClient: true,
          publicCode: FREELANCER_ACTIVATION_ERROR_CODES.WAVE_BUDGET_INSUFFICIENT,
        });
      }
    }
    const inserted = await insertBudgetEntry(client, {
      campaignId: ids.campaignId,
      waveId: ids.waveId,
      entryType: "budget_reserved",
      amountJod,
      articleId: article.id || article.article_id,
      applicationId: application.id,
      freelancerUserId: application.freelancer_user_id,
      createdByUserId: actorUserId,
      metadata: { source: "assignment_select" },
    });
    if (inserted.duplicate) {
      return { skipped: false, alreadyReserved: true, amountJod };
    }
    await applyCounterDelta(client, {
      campaignId: ids.campaignId,
      waveId: ids.waveId,
      reservedDeltaJod: amountJod,
      usedDeltaJod: "0.000",
    });
    await stampApplicationBudget(client, application.id, { amountJod, reserved: true });
    return { skipped: false, alreadyReserved: false, amountJod };
  } catch (err) {
    if (isMissingSchema(err)) {
      return { skipped: true, reason: "SCHEMA_MISSING" };
    }
    throw err;
  }
}

async function releaseActivationBudgetIfReserved({
  client,
  article,
  application,
  actorUserId = null,
  reason = "assignment_voided",
} = {}) {
  if (!client) {
    throw createAppError("Activation budget release requires a transaction client.", 500);
  }
  if (!(await engineAllowsBudgetOps(client))) {
    return { skipped: true, reason: "ENGINE_OFF" };
  }
  const ids = resolveLinkedIds(article, application);
  if (!ids.campaignId) {
    return { skipped: true, reason: "NO_CAMPAIGN" };
  }
  try {
    await lockCampaignAndWave(client, ids.campaignId, ids.waveId);
    const used = await findBudgetEntry(client, {
      applicationId: application.id,
      entryType: "budget_used",
    });
    if (used) {
      return { skipped: false, alreadyUsed: true };
    }
    const released = await findBudgetEntry(client, {
      applicationId: application.id,
      entryType: "budget_released",
    });
    if (released) {
      return { skipped: false, alreadyReleased: true };
    }
    const reserved = await findBudgetEntry(client, {
      applicationId: application.id,
      entryType: "budget_reserved",
    });
    if (!reserved) {
      return { skipped: false, nothingToRelease: true };
    }
    const amountJod = String(reserved.amount_jod);
    const inserted = await insertBudgetEntry(client, {
      campaignId: ids.campaignId,
      waveId: ids.waveId || reserved.wave_id,
      entryType: "budget_released",
      amountJod,
      articleId: article?.id || reserved.article_id,
      applicationId: application.id,
      freelancerUserId: application.freelancer_user_id,
      createdByUserId: actorUserId,
      metadata: { source: reason },
    });
    if (inserted.duplicate) {
      return { skipped: false, alreadyReleased: true, amountJod };
    }
    await applyCounterDelta(client, {
      campaignId: ids.campaignId,
      waveId: ids.waveId || reserved.wave_id,
      reservedDeltaJod: `-${amountJod}`,
      usedDeltaJod: "0.000",
    });
    await stampApplicationBudget(client, application.id, { released: true });
    return { skipped: false, released: true, amountJod };
  } catch (err) {
    if (isMissingSchema(err)) {
      return { skipped: true, reason: "SCHEMA_MISSING" };
    }
    throw err;
  }
}

async function markActivationBudgetUsed({
  client,
  article,
  application,
  actorUserId = null,
} = {}) {
  if (!client) {
    throw createAppError("Activation budget use requires a transaction client.", 500);
  }
  if (!(await engineAllowsBudgetOps(client))) {
    return { skipped: true, reason: "ENGINE_OFF" };
  }
  const ids = resolveLinkedIds(article, application);
  if (!ids.campaignId) {
    return { skipped: true, reason: "NO_CAMPAIGN" };
  }
  try {
    const { campaign, wave } = await lockCampaignAndWave(client, ids.campaignId, ids.waveId);
    if (!campaign) {
      return { skipped: true, reason: "CAMPAIGN_MISSING" };
    }
    const alreadyUsed = await findBudgetEntry(client, {
      applicationId: application.id,
      entryType: "budget_used",
    });
    if (alreadyUsed) {
      return { skipped: false, alreadyUsed: true, amountJod: String(alreadyUsed.amount_jod) };
    }
    const reserved = await findBudgetEntry(client, {
      applicationId: application.id,
      entryType: "budget_reserved",
    });
    const amountJod = reserved
      ? String(reserved.amount_jod)
      : resolveActivationArticleBudgetAmount({ campaign, article });
    const lateUse = !reserved;
    const inserted = await insertBudgetEntry(client, {
      campaignId: ids.campaignId,
      waveId: ids.waveId || reserved?.wave_id || null,
      entryType: "budget_used",
      amountJod,
      articleId: article?.id || reserved?.article_id,
      applicationId: application.id,
      freelancerUserId: application.freelancer_user_id,
      createdByUserId: actorUserId,
      metadata: lateUse
        ? { source: "final_approval", late_use_without_reservation: true }
        : { source: "final_approval" },
    });
    if (inserted.duplicate) {
      return { skipped: false, alreadyUsed: true, amountJod };
    }
    if (lateUse) {
      const remaining = remainingMillisFromParts(
        campaign.totalBudgetJod,
        campaign.reservedBudgetJod,
        campaign.usedBudgetJod,
      );
      const waveRemaining = wave
        ? remainingMillisFromParts(wave.budgetJod, wave.reservedBudgetJod, wave.usedBudgetJod)
        : remaining;
      if (moneyMillis(amountJod) > remaining || (wave && moneyMillis(amountJod) > waveRemaining)) {
        return {
          skipped: false,
          lateUseWithoutReservation: true,
          countersUpdated: false,
          amountJod,
        };
      }
      await applyCounterDelta(client, {
        campaignId: ids.campaignId,
        waveId: ids.waveId,
        reservedDeltaJod: "0.000",
        usedDeltaJod: amountJod,
      });
    } else {
      await applyCounterDelta(client, {
        campaignId: ids.campaignId,
        waveId: ids.waveId || reserved.wave_id,
        reservedDeltaJod: `-${amountJod}`,
        usedDeltaJod: amountJod,
      });
    }
    await stampApplicationBudget(client, application.id, { amountJod, used: true });
    return {
      skipped: false,
      alreadyUsed: false,
      lateUseWithoutReservation: lateUse,
      amountJod,
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return { skipped: true, reason: "SCHEMA_MISSING" };
    }
    throw err;
  }
}

module.exports = {
  getActivationCampaignSettingsSnapshot,
  createActivationCampaign,
  updateActivationCampaign,
  listActivationCampaigns,
  getActivationCampaignDetail,
  createActivationWave,
  updateActivationWave,
  listActivationWaves,
  pauseCampaign,
  resumeCampaign,
  emergencyStopCampaign,
  computeCampaignBudgetSummary,
  computeWaveBudgetSummary,
  computeBudgetSummaryFromParts,
  assertShareSplit,
  normalizeCampaignInput,
  normalizeWaveInput,
  resolveActivationAttachment,
  persistArticleActivationAttachment,
  evaluateActivationOpportunityGate,
  assertActivationOpportunityOpen,
  resolveActivationArticleBudgetAmount,
  deriveActivationBudgetState,
  reserveActivationBudgetForAssignment,
  releaseActivationBudgetIfReserved,
  markActivationBudgetUsed,
  countActivationWork,
};
