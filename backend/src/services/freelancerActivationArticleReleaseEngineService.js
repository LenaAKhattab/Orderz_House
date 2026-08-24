/**
 * Phase A9.2 — Daily Mini Article release engine + inventory recycling.
 * Reuses A9.1 inventory release + fund ledger. No auto-assign / cron / wallet / claims.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { millisToJodString } = require("../utils/marketplaceBidPoolMoney");
const {
  FREELANCER_ACTIVATION_A92_ERROR_CODES,
  normalizePlanTierCode,
} = require("../constants/freelancerActivationArticleOps");
const campaignService = require("./freelancerActivationCampaignService");
const articleOps = require("./freelancerActivationArticleOpsService");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function schemaMissingError() {
  return createAppError("Freelancer activation A9.2 release schema is not applied.", 503, {
    exposeToClient: true,
    publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.SCHEMA_MISSING,
  });
}

function toDateOnly(raw) {
  if (!raw) {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw createAppError("Invalid run date (YYYY-MM-DD).", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.INVALID_DATE,
    });
  }
  return s;
}

/** Clamp interval to 1..30. Missing/invalid → 1 (daily, backward compatible). */
function normalizeReleaseIntervalDays(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 30);
}

function utcDayNumber(dateOnly) {
  const [y, m, d] = String(dateOnly).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Release day check relative to allocation anchor (created_at date).
 * interval 1 = every day; 2 = every other day from anchor; etc.
 */
function isReleaseDayForInterval({ runDate, intervalDays, anchorDate } = {}) {
  const interval = normalizeReleaseIntervalDays(intervalDays);
  if (interval === 1) return true;
  const run = toDateOnly(runDate);
  const anchor = anchorDate ? toDateOnly(String(anchorDate).slice(0, 10)) : run;
  const daysSince = utcDayNumber(run) - utcDayNumber(anchor);
  if (daysSince < 0) return false;
  return daysSince % interval === 0;
}

const NOT_RELEASE_DAY_MESSAGE_AR = "ليس يوم إنزال حسب الجدولة الحالية.";

function mapReleaseRun(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    waveId: row.wave_id != null ? Number(row.wave_id) : null,
    planTierCode: row.plan_tier_code || null,
    runDate: row.run_date instanceof Date
      ? row.run_date.toISOString().slice(0, 10)
      : String(row.run_date).slice(0, 10),
    runType: row.run_type,
    status: row.status,
    requestedByUserId: row.requested_by_user_id != null ? Number(row.requested_by_user_id) : null,
    releasedCount: Number(row.released_count) || 0,
    totalReservedValueJod: String(row.total_reserved_value_jod ?? "0.000"),
    metadata: row.metadata || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapReleaseItem(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    runId: Number(row.run_id),
    inventoryItemId: row.inventory_item_id != null ? Number(row.inventory_item_id) : null,
    marketplaceArticleId:
      row.marketplace_article_id != null ? Number(row.marketplace_article_id) : null,
    planTierCode: row.plan_tier_code,
    totalArticleValueJod: String(row.total_article_value_jod),
    freelancerShareJod: String(row.freelancer_share_jod),
    companyShareJod: String(row.company_share_jod),
    reviewerShareJod: String(row.reviewer_share_jod),
    status: row.status,
    skipReason: row.skip_reason || null,
    metadata: row.metadata || null,
    createdAt: row.created_at || null,
  };
}

function inventoryCanRelease(item, { allowRecycle = false } = {}) {
  if (!item) return false;
  const status = String(item.status);
  if (status === "archived" || status === "exhausted" || status === "draft") return false;
  if (item.release_strategy === "one_time" && Number(item.released_count) >= 1) return false;
  if (item.max_releases != null && Number(item.released_count) >= Number(item.max_releases)) {
    return false;
  }
  if (status === "ready") return true;
  if (status === "released" && allowRecycle && item.release_strategy === "reusable") return true;
  return false;
}

/**
 * Compute how many articles may still be released today for an allocation.
 * Stricter of budget/count wins; also capped by fund and remaining daily capacity.
 */
function computeDailyReleaseCapacity({
  allocation,
  fundBalanceMillis,
  alreadyReleasedToday = 0,
} = {}) {
  const unitMillis = articleOps.parseMoney(
    allocation.totalArticleValueJod ?? allocation.total_article_value_jod,
    "total article value",
  );
  if (unitMillis <= 0) {
    return {
      unitValueJod: "0.000",
      capByBudget: 0,
      capByCount: 0,
      capByFund: 0,
      alreadyReleasedToday: Number(alreadyReleasedToday) || 0,
      remainingCapacity: 0,
      reason: "invalid_unit_value",
    };
  }

  let capByBudget = Number.POSITIVE_INFINITY;
  const dailyBudget =
    allocation.dailyBudgetJod != null
      ? allocation.dailyBudgetJod
      : allocation.daily_budget_jod;
  if (dailyBudget != null && dailyBudget !== "") {
    const budgetMillis = articleOps.parseMoney(dailyBudget, "daily budget");
    capByBudget = Math.floor(budgetMillis / unitMillis);
  }

  let capByCount = Number.POSITIVE_INFINITY;
  const maxDaily =
    allocation.maxDailyArticles != null
      ? allocation.maxDailyArticles
      : allocation.max_daily_articles;
  if (maxDaily != null && maxDaily !== "") {
    capByCount = Math.max(0, Number(maxDaily));
  }

  const capByFund = Math.floor(Number(fundBalanceMillis) / unitMillis);
  const dailyCap = Math.min(capByBudget, capByCount);
  const already = Math.max(0, Number(alreadyReleasedToday) || 0);
  const remainingCapacity = Math.max(0, Math.min(dailyCap - already, capByFund));

  return {
    unitValueJod: millisToJodString(unitMillis),
    dailyBudgetJod: dailyBudget != null ? String(dailyBudget) : null,
    maxDailyArticles: maxDaily != null ? Number(maxDaily) : null,
    capByBudget: Number.isFinite(capByBudget) ? capByBudget : null,
    capByCount: Number.isFinite(capByCount) ? capByCount : null,
    capByFund,
    alreadyReleasedToday: already,
    remainingCapacity,
    reason: remainingCapacity > 0 ? "ok" : "capacity_exhausted",
  };
}

async function countArticlesReleasedToday(runner, {
  campaignId,
  waveId = null,
  planTierCode,
  runDate,
}) {
  const params = [Number(campaignId), planTierCode, runDate];
  let waveClause = "";
  if (waveId != null) {
    params.push(Number(waveId));
    waveClause = `AND activation_wave_id = $4`;
  } else {
    waveClause = `AND activation_wave_id IS NULL`;
  }
  try {
    const { rows } = await runner.query(
      `SELECT COUNT(*)::int AS cnt
         FROM marketplace_articles
        WHERE activation_campaign_id = $1
          AND activation_plan_tier_code = $2
          AND (published_at AT TIME ZONE 'UTC')::date = $3::date
          ${waveClause}`,
      params,
    );
    return Number(rows[0]?.cnt) || 0;
  } catch (err) {
    if (isMissingSchema(err)) return 0;
    throw err;
  }
}

async function loadInventoryCandidates(runner, {
  campaignId,
  waveId = null,
  planTierCode,
  recycle = false,
}) {
  const params = [Number(campaignId), planTierCode];
  let waveClause = "";
  if (waveId != null) {
    params.push(Number(waveId));
    waveClause = `AND (wave_id = $3 OR wave_id IS NULL)`;
  }
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_activation_article_inventory_items
      WHERE campaign_id = $1
        AND plan_tier_code = $2
        AND status IN ('ready', 'released')
        ${waveClause}
      ORDER BY
        CASE WHEN status = 'ready' THEN 0 ELSE 1 END ASC,
        id ASC`,
    params,
  );

  const ready = [];
  const recyclable = [];
  for (const row of rows) {
    if (inventoryCanRelease(row, { allowRecycle: false })) {
      ready.push(row);
    } else if (recycle && inventoryCanRelease(row, { allowRecycle: true })) {
      recyclable.push(row);
    }
  }
  return { ready, recyclable };
}

async function findCompletedIdempotentRun(runner, {
  campaignId,
  waveId = null,
  planTierCode = null,
  runDate,
  runType,
}) {
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_activation_article_release_runs
      WHERE campaign_id = $1
        AND COALESCE(wave_id, 0) = COALESCE($2::bigint, 0)
        AND COALESCE(plan_tier_code, '') = COALESCE($3, '')
        AND run_date = $4::date
        AND run_type = $5
        AND status = 'completed'
      ORDER BY id DESC
      LIMIT 1`,
    [
      Number(campaignId),
      waveId != null ? Number(waveId) : null,
      planTierCode || null,
      runDate,
      runType,
    ],
  );
  return rows[0] || null;
}

async function insertReleaseRun(runner, {
  campaignId,
  waveId = null,
  planTierCode = null,
  runDate,
  runType,
  status,
  actorUserId = null,
  releasedCount = 0,
  totalReservedValueJod = "0.000",
  metadata = null,
}) {
  const { rows } = await runner.query(
    `INSERT INTO freelancer_activation_article_release_runs (
       campaign_id, wave_id, plan_tier_code, run_date, run_type, status,
       requested_by_user_id, released_count, total_reserved_value_jod, metadata
     ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9::numeric, $10::jsonb)
     RETURNING *`,
    [
      Number(campaignId),
      waveId != null ? Number(waveId) : null,
      planTierCode || null,
      runDate,
      runType,
      status,
      actorUserId,
      releasedCount,
      totalReservedValueJod,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  return rows[0];
}

async function insertReleaseItem(runner, {
  runId,
  inventoryItemId = null,
  marketplaceArticleId = null,
  planTierCode,
  totalArticleValueJod,
  freelancerShareJod,
  companyShareJod,
  reviewerShareJod,
  status,
  skipReason = null,
  metadata = null,
}) {
  const { rows } = await runner.query(
    `INSERT INTO freelancer_activation_article_release_items (
       run_id, inventory_item_id, marketplace_article_id, plan_tier_code,
       total_article_value_jod, freelancer_share_jod, company_share_jod, reviewer_share_jod,
       status, skip_reason, metadata
     ) VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8::numeric, $9, $10, $11::jsonb)
     RETURNING *`,
    [
      Number(runId),
      inventoryItemId,
      marketplaceArticleId,
      planTierCode,
      totalArticleValueJod,
      freelancerShareJod,
      companyShareJod,
      reviewerShareJod,
      status,
      skipReason,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  return rows[0];
}

async function loadItemsForRun(runner, runId) {
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_activation_article_release_items
      WHERE run_id = $1 ORDER BY id ASC`,
    [Number(runId)],
  );
  return rows.map(mapReleaseItem);
}

/**
 * Build release plan for one allocation (preview or execute).
 */
async function planReleaseForAllocation(runner, allocation, {
  runDate,
  dryRun = true,
  includeManualMode = false,
  bypassInterval = false,
} = {}) {
  const skipBase = {
    allocationId: allocation.id,
    planTierCode: allocation.planTierCode,
    items: [],
    plannedCount: 0,
    plannedValueJod: "0.000",
    capacity: null,
    skipped: true,
    skipReason: null,
    messageAr: null,
    releaseIntervalDays: normalizeReleaseIntervalDays(allocation.releaseIntervalDays),
  };

  if (!allocation.isEnabled) {
    return { ...skipBase, skipReason: "allocation_disabled" };
  }
  if (allocation.releaseMode === "manual" && !includeManualMode) {
    return { ...skipBase, skipReason: "manual_mode_skipped" };
  }
  if (allocation.releaseMode !== "daily_auto" && allocation.releaseMode !== "manual") {
    return { ...skipBase, skipReason: "unsupported_release_mode" };
  }

  // Auto schedule respects interval; admin manual run (bypassInterval) and inventory publish do not.
  const intervalDays = normalizeReleaseIntervalDays(allocation.releaseIntervalDays);
  if (
    !bypassInterval &&
    allocation.releaseMode === "daily_auto" &&
    intervalDays > 1
  ) {
    const anchorRaw = allocation.createdAt || allocation.created_at || null;
    const anchorDate = anchorRaw ? String(anchorRaw).slice(0, 10) : runDate;
    if (!isReleaseDayForInterval({ runDate, intervalDays, anchorDate })) {
      return {
        ...skipBase,
        skipReason: "not_release_day",
        messageAr: NOT_RELEASE_DAY_MESSAGE_AR,
        releaseIntervalDays: intervalDays,
      };
    }
  }

  const gate = await campaignService.evaluateActivationOpportunityGate({
    article: {
      activation_campaign_id: allocation.campaignId,
      activation_wave_id: allocation.waveId,
    },
    client: runner,
  });
  if (!gate.skipped && !gate.allowed) {
    return {
      ...skipBase,
      skipReason: gate.code || "campaign_blocked",
      gate,
    };
  }

  const fundMillis = await articleOps.computeFundBalanceMillis(runner, {
    campaignId: allocation.campaignId,
  });
  const already = await countArticlesReleasedToday(runner, {
    campaignId: allocation.campaignId,
    waveId: allocation.waveId,
    planTierCode: allocation.planTierCode,
    runDate,
  });
  const capacity = computeDailyReleaseCapacity({
    allocation,
    fundBalanceMillis: fundMillis,
    alreadyReleasedToday: already,
  });

  if (capacity.remainingCapacity <= 0) {
    return {
      ...skipBase,
      skipped: true,
      skipReason: fundMillis <= 0 ? "insufficient_fund" : "capacity_exhausted",
      capacity: {
        ...capacity,
        fundBalanceJod: millisToJodString(fundMillis),
      },
      gate,
    };
  }

  const recycle = Boolean(allocation.recycleWhenInventoryEmpty);
  const { ready, recyclable } = await loadInventoryCandidates(runner, {
    campaignId: allocation.campaignId,
    waveId: allocation.waveId,
    planTierCode: allocation.planTierCode,
    recycle,
  });

  const queue = [...ready];
  if (recycle) queue.push(...recyclable);

  const planned = [];
  const usedIds = new Set();
  let skippedActivePublished = 0;
  for (const item of queue) {
    if (planned.length >= capacity.remainingCapacity) break;
    if (usedIds.has(item.id)) continue;
    // one_time already released cannot be reused even in recycle path
    if (!inventoryCanRelease(item, { allowRecycle: recycle })) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await articleOps.hasActivePublishedArticleForInventory(runner, item.id)) {
      skippedActivePublished += 1;
      continue;
    }
    usedIds.add(item.id);
    planned.push({
      inventoryItemId: Number(item.id),
      title: item.title,
      planTierCode: item.plan_tier_code,
      totalArticleValueJod: String(item.total_article_value_jod),
      freelancerShareJod: String(item.freelancer_share_jod),
      companyShareJod: String(item.company_share_jod),
      reviewerShareJod: String(item.reviewer_share_jod),
      minimumBiddersPerArticle: Number(item.minimum_bidders_per_article) || 10,
      releaseStrategy: item.release_strategy,
      status: item.status,
      recycled: item.status === "released",
      _row: item,
    });
  }

  if (planned.length === 0) {
    return {
      ...skipBase,
      skipped: true,
      skipReason: skippedActivePublished > 0 ? "active_published_exists" : "inventory_empty",
      capacity: {
        ...capacity,
        fundBalanceJod: millisToJodString(fundMillis),
        readyInventoryCount: ready.length,
        reusableInventoryCount: recyclable.length,
        recycleWhenInventoryEmpty: recycle,
        skippedActivePublished,
      },
      gate,
    };
  }

  const plannedValueMillis = planned.reduce(
    (sum, p) => sum + articleOps.parseMoney(p.totalArticleValueJod, "article value"),
    0,
  );

  return {
    allocationId: allocation.id,
    planTierCode: allocation.planTierCode,
    items: planned.map(({ _row, ...rest }) => rest),
    _rows: planned.map((p) => p._row),
    plannedCount: planned.length,
    plannedValueJod: millisToJodString(plannedValueMillis),
    capacity: {
      ...capacity,
      fundBalanceJod: millisToJodString(fundMillis),
      readyInventoryCount: ready.length,
      reusableInventoryCount: recyclable.length,
      recycleWhenInventoryEmpty: recycle,
    },
    skipped: false,
    skipReason: null,
    dryRun,
    gate,
  };
}

async function resolveAllocations(runner, {
  campaignId,
  waveId = null,
  planTierCode = null,
}) {
  const listed = await articleOps.listPlanAllocations(campaignId, { client: runner });
  let allocations = listed.allocations || [];
  if (waveId != null) {
    allocations = allocations.filter(
      (a) => a.waveId == null || Number(a.waveId) === Number(waveId),
    );
  }
  if (planTierCode) {
    const tier = normalizePlanTierCode(planTierCode);
    allocations = allocations.filter((a) => a.planTierCode === tier);
  }
  return { schemaReady: listed.schemaReady !== false, allocations };
}

/**
 * Dry-run / capacity preview. Never creates marketplace_articles.
 */
async function previewDailyMiniArticleRelease({
  campaignId,
  waveId = null,
  planTierCode = null,
  date = null,
  includeManualMode = true,
  client = null,
} = {}) {
  const runner = client || pool;
  const runDate = toDateOnly(date);
  const cid = Number(campaignId);
  if (!Number.isInteger(cid) || cid < 1) {
    throw createAppError("campaignId is required.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.RELEASE_BLOCKED,
    });
  }

  try {
    const { allocations, schemaReady } = await resolveAllocations(runner, {
      campaignId: cid,
      waveId,
      planTierCode,
    });
    if (!schemaReady) {
      return { schemaReady: false, runDate, allocations: [], plannedCount: 0 };
    }

    const plans = [];
    for (const alloc of allocations) {
      // Preview shows all allocations; includeManualMode defaults true so admin sees capacity.
      const plan = await planReleaseForAllocation(runner, alloc, {
        runDate,
        dryRun: true,
        includeManualMode,
      });
      delete plan._rows;
      plans.push(plan);
    }

    const plannedCount = plans.reduce((n, p) => n + (p.plannedCount || 0), 0);
    const fundMillis = await articleOps.computeFundBalanceMillis(runner, { campaignId: cid });

    return {
      schemaReady: true,
      dryRun: true,
      autoAssigned: false,
      runDate,
      campaignId: cid,
      waveId: waveId != null ? Number(waveId) : null,
      planTierCode: planTierCode ? normalizePlanTierCode(planTierCode) : null,
      fundBalanceJod: millisToJodString(fundMillis),
      plannedCount,
      plannedValueJod: millisToJodString(
        plans.reduce(
          (sum, p) =>
            sum +
            (p.plannedValueJod
              ? articleOps.parseMoney(p.plannedValueJod, "planned")
              : 0),
          0,
        ),
      ),
      allocations: plans,
      noteAr:
        "معاينة فقط — لا يتم إنشاء مقالات حية ولا إسناد فائزين. صندوق المقالات منفصل عن ميزانية الإسناد A4.2.",
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return { schemaReady: false, runDate, allocations: [], plannedCount: 0 };
    }
    throw err;
  }
}

/**
 * Execute daily/manual release for matching allocations.
 * Admin "Run now" uses runType=manual and includeManualMode=true.
 * Programmatic daily_auto path uses runType=daily_auto and includeManualMode=false.
 */
async function runDailyMiniArticleRelease({
  campaignId,
  waveId = null,
  planTierCode = null,
  date = null,
  actorUserId = null,
  force = false,
  runType = "manual",
  client = null,
} = {}) {
  const own = !client;
  const runner = client || (await pool.connect());
  const runDate = toDateOnly(date);
  const cid = Number(campaignId);
  const effectiveRunType = runType === "daily_auto" ? "daily_auto" : "manual";
  const includeManualMode = effectiveRunType === "manual";

  if (!Number.isInteger(cid) || cid < 1) {
    throw createAppError("campaignId is required.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.RELEASE_BLOCKED,
    });
  }

  try {
    if (own) await runner.query("BEGIN");

    if (!force) {
      const existing = await findCompletedIdempotentRun(runner, {
        campaignId: cid,
        waveId,
        planTierCode: planTierCode ? normalizePlanTierCode(planTierCode) : null,
        runDate,
        runType: effectiveRunType,
      });
      if (existing) {
        const items = await loadItemsForRun(runner, existing.id);
        if (own) await runner.query("COMMIT");
        return {
          schemaReady: true,
          idempotent: true,
          autoAssigned: false,
          run: mapReleaseRun(existing),
          items,
          messageAr: "تم تشغيل الإنزال مسبقًا لهذا اليوم/الباقة. استخدم force لإعادة التشغيل.",
        };
      }
    }

    const { allocations, schemaReady } = await resolveAllocations(runner, {
      campaignId: cid,
      waveId,
      planTierCode,
    });
    if (!schemaReady) throw schemaMissingError();

    const runRow = await insertReleaseRun(runner, {
      campaignId: cid,
      waveId,
      planTierCode: planTierCode ? normalizePlanTierCode(planTierCode) : null,
      runDate,
      runType: effectiveRunType,
      status: "preview",
      actorUserId,
      metadata: { force: Boolean(force), phase: "A9.2" },
    });

    const releasedArticles = [];
    const itemRows = [];
    let totalValueMillis = 0;
    let releasedCount = 0;
    const allocationSummaries = [];
    let remainingFundMillis = await articleOps.computeFundBalanceMillis(runner, {
      campaignId: cid,
    });

    for (const alloc of allocations) {
      const plan = await planReleaseForAllocation(runner, alloc, {
        runDate,
        dryRun: false,
        includeManualMode,
        // Admin "تشغيل إنزال الآن" uses runType=manual → bypass schedule day.
        bypassInterval: includeManualMode,
      });

      // Re-cap planned rows by remaining fund in this run (multi-tier safety).
      if (!plan.skipped && plan._rows?.length) {
        const unit = articleOps.parseMoney(alloc.totalArticleValueJod, "total article value");
        const maxByFund = unit > 0 ? Math.floor(remainingFundMillis / unit) : 0;
        if (maxByFund < plan._rows.length) {
          plan._rows = plan._rows.slice(0, Math.max(0, maxByFund));
          plan.plannedCount = plan._rows.length;
          if (plan._rows.length === 0) {
            plan.skipped = true;
            plan.skipReason = "insufficient_fund";
          }
        }
      }

      if (plan.skipped) {
        allocationSummaries.push({
          allocationId: plan.allocationId,
          planTierCode: plan.planTierCode,
          skipReason: plan.skipReason,
          plannedCount: 0,
          capacity: plan.capacity,
        });
        if (plan.skipReason) {
          await insertReleaseItem(runner, {
            runId: runRow.id,
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: alloc.totalArticleValueJod,
            freelancerShareJod: alloc.freelancerShareJod,
            companyShareJod: alloc.companyShareJod,
            reviewerShareJod: alloc.reviewerShareJod,
            status: "skipped",
            skipReason: plan.skipReason,
            metadata: { allocationId: alloc.id },
          });
        }
        continue;
      }

      const rows = plan._rows || [];
      for (const item of rows) {
        const { rows: locked } = await runner.query(
          `SELECT * FROM freelancer_activation_article_inventory_items WHERE id = $1 FOR UPDATE`,
          [item.id],
        );
        const lockedItem = locked[0];
        if (!inventoryCanRelease(lockedItem, { allowRecycle: Boolean(alloc.recycleWhenInventoryEmpty) })) {
          const skip = await insertReleaseItem(runner, {
            runId: runRow.id,
            inventoryItemId: item.id,
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: String(item.total_article_value_jod),
            freelancerShareJod: String(item.freelancer_share_jod),
            companyShareJod: String(item.company_share_jod),
            reviewerShareJod: String(item.reviewer_share_jod),
            status: "skipped",
            skipReason: "inventory_not_releasable",
          });
          itemRows.push(mapReleaseItem(skip));
          continue;
        }

        if (await articleOps.hasActivePublishedArticleForInventory(runner, lockedItem.id)) {
          const skip = await insertReleaseItem(runner, {
            runId: runRow.id,
            inventoryItemId: lockedItem.id,
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: String(item.total_article_value_jod),
            freelancerShareJod: String(item.freelancer_share_jod),
            companyShareJod: String(item.company_share_jod),
            reviewerShareJod: String(item.reviewer_share_jod),
            status: "skipped",
            skipReason: "active_published_exists",
          });
          itemRows.push(mapReleaseItem(skip));
          continue;
        }

        const releaseItem = {
          ...lockedItem,
          total_article_value_jod: alloc.totalArticleValueJod,
          freelancer_share_jod: alloc.freelancerShareJod,
          company_share_jod: alloc.companyShareJod,
          reviewer_share_jod: alloc.reviewerShareJod,
          minimum_bidders_per_article:
            alloc.minimumBiddersPerArticle || lockedItem.minimum_bidders_per_article,
          wave_id: alloc.waveId != null ? alloc.waveId : lockedItem.wave_id,
          auto_assign_enabled: Boolean(alloc.autoAssignEnabled),
          auto_assign_mode: alloc.autoAssignMode || "disabled",
          auto_assign_when_min_bidders_reached: Boolean(alloc.autoAssignWhenMinBiddersReached),
        };

        const valueMillis = articleOps.parseMoney(
          releaseItem.total_article_value_jod,
          "article value",
        );
        if (valueMillis > remainingFundMillis) {
          const skip = await insertReleaseItem(runner, {
            runId: runRow.id,
            inventoryItemId: lockedItem.id,
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: String(releaseItem.total_article_value_jod),
            freelancerShareJod: String(releaseItem.freelancer_share_jod),
            companyShareJod: String(releaseItem.company_share_jod),
            reviewerShareJod: String(releaseItem.reviewer_share_jod),
            status: "skipped",
            skipReason: "insufficient_fund",
          });
          itemRows.push(mapReleaseItem(skip));
          continue;
        }

        const result = await articleOps.executeInventoryReleaseOnRunner(runner, releaseItem, {
          actorUserId,
          skipFundCheck: true,
        });

        remainingFundMillis -= valueMillis;
        totalValueMillis += valueMillis;
        releasedCount += 1;
        releasedArticles.push(result.article);

        const line = await insertReleaseItem(runner, {
          runId: runRow.id,
          inventoryItemId: lockedItem.id,
          marketplaceArticleId: result.article.id,
          planTierCode: alloc.planTierCode,
          totalArticleValueJod: result.article.articleValueJod,
          freelancerShareJod: result.article.freelancerShareJod,
          companyShareJod: result.article.companyShareJod,
          reviewerShareJod: result.article.reviewerShareJod,
          status: "released",
          metadata: { autoAssigned: false },
        });
        itemRows.push(mapReleaseItem(line));
      }

      allocationSummaries.push({
        allocationId: plan.allocationId,
        planTierCode: plan.planTierCode,
        plannedCount: plan.plannedCount,
        releasedCount: rows.length,
        capacity: plan.capacity,
        skipReason: null,
      });
    }

    if (totalValueMillis > 0) {
      await articleOps.recordArticleFundDailyAllocation(runner, {
        campaignId: cid,
        waveId: waveId != null ? Number(waveId) : null,
        amountJod: millisToJodString(totalValueMillis),
        reason: "a92_daily_release",
        metadata: {
          runId: Number(runRow.id),
          runDate,
          releasedCount,
          note: "Operating fund daily_allocation at release. A4.2 assignment reserve is separate.",
        },
        actorUserId,
      });
    }

    const finalStatus = releasedCount > 0 ? "completed" : "skipped";
    const { rows: updatedRuns } = await runner.query(
      `UPDATE freelancer_activation_article_release_runs SET
         status = $2,
         released_count = $3,
         total_reserved_value_jod = $4::numeric,
         metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        runRow.id,
        finalStatus,
        releasedCount,
        millisToJodString(totalValueMillis),
        JSON.stringify({
          allocationSummaries,
          autoAssigned: false,
          force: Boolean(force),
        }),
      ],
    );

    if (own) await runner.query("COMMIT");

    return {
      schemaReady: true,
      idempotent: false,
      autoAssigned: false,
      dryRun: false,
      run: mapReleaseRun(updatedRuns[0]),
      items: itemRows,
      articles: releasedArticles,
      allocationSummaries,
      noteAr:
        "تم إنزال المقالات دون إسناد فائز. حجز ميزانية الإسناد يتم لاحقًا عبر A4.2 عند الاختيار.",
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
    // Unique idempotency violation → treat as already completed
    if (err?.code === "23505") {
      throw createAppError("تم تشغيل الإنزال مسبقًا لهذا اليوم.", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.IDEMPOTENT_RUN_EXISTS,
      });
    }
    throw err;
  } finally {
    if (own) runner.release();
  }
}

async function listArticleReleaseRuns({
  campaignId = null,
  waveId = null,
  planTierCode = null,
  dateFrom = null,
  dateTo = null,
  limit = 25,
  client = null,
} = {}) {
  const runner = client || pool;
  const params = [];
  const where = [];
  if (campaignId != null) {
    params.push(Number(campaignId));
    where.push(`campaign_id = $${params.length}`);
  }
  if (waveId != null) {
    params.push(Number(waveId));
    where.push(`wave_id = $${params.length}`);
  }
  if (planTierCode) {
    params.push(normalizePlanTierCode(planTierCode));
    where.push(`plan_tier_code = $${params.length}`);
  }
  if (dateFrom) {
    params.push(toDateOnly(dateFrom));
    where.push(`run_date >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(toDateOnly(dateTo));
    where.push(`run_date <= $${params.length}::date`);
  }
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
  params.push(lim);
  try {
    const { rows } = await runner.query(
      `SELECT * FROM freelancer_activation_article_release_runs
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY run_date DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );
    return { schemaReady: true, runs: rows.map(mapReleaseRun) };
  } catch (err) {
    if (isMissingSchema(err)) return { schemaReady: false, runs: [] };
    throw err;
  }
}

async function getArticleReleaseRun(runId, { client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT * FROM freelancer_activation_article_release_runs WHERE id = $1`,
      [Number(runId)],
    );
    if (!rows[0]) {
      throw createAppError("Release run not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.RELEASE_BLOCKED,
      });
    }
    const items = await loadItemsForRun(runner, rows[0].id);
    return { schemaReady: true, run: mapReleaseRun(rows[0]), items, autoAssigned: false };
  } catch (err) {
    if (isMissingSchema(err)) throw schemaMissingError();
    throw err;
  }
}

module.exports = {
  computeDailyReleaseCapacity,
  inventoryCanRelease,
  previewDailyMiniArticleRelease,
  runDailyMiniArticleRelease,
  listArticleReleaseRuns,
  getArticleReleaseRun,
  mapReleaseRun,
  mapReleaseItem,
  planReleaseForAllocation,
  normalizeReleaseIntervalDays,
  isReleaseDayForInterval,
  NOT_RELEASE_DAY_MESSAGE_AR,
};
