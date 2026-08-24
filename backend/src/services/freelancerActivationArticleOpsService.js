/**
 * Phase A9.1 — Mini Article operating fund, plan allocations, inventory + manual release.
 * Separate from A4.2 assignment budget_entries. No wallet/claims/Stripe/auto-assign/cron.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { millisToJodString, parseJodToMillis } = require("../utils/marketplaceBidPoolMoney");
const {
  FREELANCER_ACTIVATION_PLAN_TIER_CODES,
  FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS,
  FREELANCER_ACTIVATION_INVENTORY_STATUSES,
  FREELANCER_ACTIVATION_RELEASE_MODES,
  FREELANCER_ACTIVATION_INVENTORY_RELEASE_STRATEGIES,
  FREELANCER_ACTIVATION_A91_ERROR_CODES,
  normalizePlanTierCode,
  resolveArticleLevelForTier,
  normalizeVisibilityDurationHours,
  parseVisibilityDurationHoursOrThrow,
} = require("../constants/freelancerActivationArticleOps");
const campaignService = require("./freelancerActivationCampaignService");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function schemaMissingError() {
  return createAppError("Freelancer activation A9.1 schema is not applied.", 503, {
    exposeToClient: true,
    publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.SCHEMA_MISSING,
  });
}

function parseMoney(value, label) {
  return parseJodToMillis(String(value), {
    label,
    publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_FUND_AMOUNT,
  });
}

function assertShareSplit({ totalArticleValueJod, freelancerShareJod, companyShareJod, reviewerShareJod }) {
  const total = parseMoney(totalArticleValueJod, "total article value");
  const fre = parseMoney(freelancerShareJod, "freelancer share");
  const co = parseMoney(companyShareJod, "company share");
  const rev = parseMoney(reviewerShareJod, "reviewer share");
  if (fre + co + rev !== total) {
    throw createAppError(
      "حصة الفريلانسر + حصة الشركة + حصة التدقيق يجب أن تساوي إجمالي قيمة المقال.",
      400,
      {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_SHARE_SPLIT,
      },
    );
  }
  return {
    totalArticleValueJod: millisToJodString(total),
    freelancerShareJod: millisToJodString(fre),
    companyShareJod: millisToJodString(co),
    reviewerShareJod: millisToJodString(rev),
  };
}

function assertPlanTier(raw) {
  const code = normalizePlanTierCode(raw);
  if (!FREELANCER_ACTIVATION_PLAN_TIER_CODES.includes(code)) {
    throw createAppError("Invalid plan tier code.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_PLAN_TIER,
    });
  }
  return code;
}

function defaultSplitForTier(tierCode) {
  const key = normalizePlanTierCode(tierCode);
  return FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[key] || FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS.starter;
}

function mapFundEntry(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    campaignId: row.campaign_id != null ? Number(row.campaign_id) : null,
    waveId: row.wave_id != null ? Number(row.wave_id) : null,
    entryType: row.entry_type,
    amountJod: String(row.amount_jod),
    reason: row.reason || null,
    metadata: row.metadata || null,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at || null,
  };
}

function mapAllocation(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    waveId: row.wave_id != null ? Number(row.wave_id) : null,
    planTierCode: row.plan_tier_code,
    dailyBudgetJod: row.daily_budget_jod != null ? String(row.daily_budget_jod) : null,
    maxDailyArticles: row.max_daily_articles != null ? Number(row.max_daily_articles) : null,
    totalArticleValueJod: String(row.total_article_value_jod),
    freelancerShareJod: String(row.freelancer_share_jod),
    companyShareJod: String(row.company_share_jod),
    reviewerShareJod: String(row.reviewer_share_jod),
    minimumBiddersPerArticle: Number(row.minimum_bidders_per_article) || 10,
    isEnabled: Boolean(row.is_enabled),
    releaseMode: row.release_mode || "manual",
    releaseIntervalDays:
      row.release_interval_days != null ? Math.max(1, Math.min(30, Number(row.release_interval_days) || 1)) : 1,
    recycleWhenInventoryEmpty: Boolean(row.recycle_when_inventory_empty),
    autoAssignEnabled: Boolean(row.auto_assign_enabled),
    autoAssignMode: row.auto_assign_mode || "disabled",
    autoAssignWhenMinBiddersReached: Boolean(row.auto_assign_when_min_bidders_reached),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapInventoryItem(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    waveId: row.wave_id != null ? Number(row.wave_id) : null,
    planTierCode: row.plan_tier_code,
    title: row.title,
    description: row.description || "",
    requirements: row.requirements || "",
    categoryId: row.category_id != null ? Number(row.category_id) : null,
    subcategoryId: row.subcategory_id != null ? Number(row.subcategory_id) : null,
    totalArticleValueJod: String(row.total_article_value_jod),
    freelancerShareJod: String(row.freelancer_share_jod),
    companyShareJod: String(row.company_share_jod),
    reviewerShareJod: String(row.reviewer_share_jod),
    minimumBiddersPerArticle: Number(row.minimum_bidders_per_article) || 10,
    visibilityDurationHours: normalizeVisibilityDurationHours(
      row.visibility_duration_hours ?? row.visibilityDurationHours,
    ),
    status: row.status,
    releaseStrategy: row.release_strategy || "one_time",
    maxReleases: row.max_releases != null ? Number(row.max_releases) : null,
    releasedCount: Number(row.released_count) || 0,
    lastReleasedAt: row.last_released_at || null,
    metadata: row.metadata || null,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function computeFundBalanceMillis(runner, { campaignId = null } = {}) {
  const params = [];
  let where = "";
  if (campaignId != null) {
    params.push(Number(campaignId));
    where = `WHERE campaign_id = $1`;
  }
  const { rows: simple } = await runner.query(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type = 'fund_deposit' THEN amount_jod ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN entry_type = 'fund_withdrawal' THEN amount_jod ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN entry_type = 'daily_allocation' THEN amount_jod ELSE 0 END), 0)
       + COALESCE(SUM(CASE WHEN entry_type = 'daily_allocation_released' THEN amount_jod ELSE 0 END), 0)
       + COALESCE(SUM(CASE WHEN entry_type = 'manual_adjustment'
            AND COALESCE(metadata->>'direction', 'credit') = 'credit' THEN amount_jod ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN entry_type = 'manual_adjustment'
            AND COALESCE(metadata->>'direction', 'credit') = 'debit' THEN amount_jod ELSE 0 END), 0)
         AS balance
       FROM freelancer_activation_article_fund_entries
       ${where}`,
    params,
  );
  return parseMoney(simple[0]?.balance ?? "0", "fund balance");
}

async function getArticleFundSummary({ campaignId = null, recentLimit = 25, client = null } = {}) {
  const runner = client || pool;
  try {
    const balanceMillis = await computeFundBalanceMillis(runner, { campaignId });
    const params = [];
    let where = "";
    if (campaignId != null) {
      params.push(Number(campaignId));
      where = `WHERE campaign_id = $1`;
    }
    const limit = Math.min(Math.max(Number(recentLimit) || 25, 1), 100);
    const recentParams = [...params, limit];
    const recent = await runner.query(
      `SELECT * FROM freelancer_activation_article_fund_entries
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${recentParams.length}`,
      recentParams,
    );
    const totals = await runner.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'fund_deposit' THEN amount_jod ELSE 0 END), 0) AS deposits,
         COALESCE(SUM(CASE WHEN entry_type = 'fund_withdrawal' THEN amount_jod ELSE 0 END), 0) AS withdrawals
         FROM freelancer_activation_article_fund_entries
         ${where}`,
      params,
    );
    return {
      schemaReady: true,
      campaignId: campaignId != null ? Number(campaignId) : null,
      currentBalanceJod: millisToJodString(balanceMillis),
      totalDepositsJod: millisToJodString(parseMoney(totals.rows[0]?.deposits ?? "0", "deposits")),
      totalWithdrawalsJod: millisToJodString(parseMoney(totals.rows[0]?.withdrawals ?? "0", "withdrawals")),
      recentEntries: (recent.rows || []).map(mapFundEntry),
      noteAr:
        "صندوق المقالات سجل داخلي لإدارة تمويل فرص Mini Article، وهو منفصل عن ميزانية الإسناد (A4.2) وعن محفظة المستقل.",
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return {
        schemaReady: false,
        currentBalanceJod: "0.000",
        totalDepositsJod: "0.000",
        totalWithdrawalsJod: "0.000",
        recentEntries: [],
      };
    }
    throw err;
  }
}

async function listArticleFundEntries({ campaignId = null, limit = 50, client = null } = {}) {
  const summary = await getArticleFundSummary({
    campaignId,
    recentLimit: limit,
    client,
  });
  return { schemaReady: summary.schemaReady, entries: summary.recentEntries || [] };
}

async function insertFundEntry(runner, {
  campaignId = null,
  waveId = null,
  entryType,
  amountJod,
  reason = null,
  metadata = null,
  actorUserId = null,
}) {
  const { rows } = await runner.query(
    `INSERT INTO freelancer_activation_article_fund_entries (
       campaign_id, wave_id, entry_type, amount_jod, reason, metadata, created_by_user_id
     ) VALUES ($1, $2, $3, $4::numeric, $5, $6::jsonb, $7)
     RETURNING *`,
    [
      campaignId,
      waveId,
      entryType,
      amountJod,
      reason,
      metadata ? JSON.stringify(metadata) : null,
      actorUserId,
    ],
  );
  return mapFundEntry(rows[0]);
}

async function addArticleFundDeposit({
  amountJod,
  campaignId = null,
  waveId = null,
  reason = null,
  actorUserId = null,
  client = null,
} = {}) {
  const runner = client || pool;
  const millis = parseMoney(amountJod, "deposit");
  if (millis <= 0) {
    throw createAppError("مبلغ الإيداع يجب أن يكون أكبر من صفر.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_FUND_AMOUNT,
    });
  }
  try {
    const entry = await insertFundEntry(runner, {
      campaignId: campaignId != null ? Number(campaignId) : null,
      waveId: waveId != null ? Number(waveId) : null,
      entryType: "fund_deposit",
      amountJod: millisToJodString(millis),
      reason,
      actorUserId,
    });
    const summary = await getArticleFundSummary({ campaignId, client: runner });
    return { entry, summary };
  } catch (err) {
    if (isMissingSchema(err)) throw schemaMissingError();
    throw err;
  }
}

async function withdrawArticleFundAmount({
  amountJod,
  campaignId = null,
  waveId = null,
  reason = null,
  actorUserId = null,
  client = null,
} = {}) {
  const own = !client;
  const runner = client || (await pool.connect());
  try {
    if (own) await runner.query("BEGIN");
    const millis = parseMoney(amountJod, "withdrawal");
    if (millis <= 0) {
      throw createAppError("مبلغ السحب يجب أن يكون أكبر من صفر.", 400, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_FUND_AMOUNT,
      });
    }
    const balance = await computeFundBalanceMillis(runner, { campaignId });
    if (millis > balance) {
      throw createAppError("الرصيد في صندوق المقالات غير كافٍ للسحب.", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INSUFFICIENT_FUND,
      });
    }
    const entry = await insertFundEntry(runner, {
      campaignId: campaignId != null ? Number(campaignId) : null,
      waveId: waveId != null ? Number(waveId) : null,
      entryType: "fund_withdrawal",
      amountJod: millisToJodString(millis),
      reason,
      actorUserId,
    });
    if (own) await runner.query("COMMIT");
    const summary = await getArticleFundSummary({ campaignId, client: runner });
    return { entry, summary };
  } catch (err) {
    if (own) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (isMissingSchema(err)) throw schemaMissingError();
    throw err;
  } finally {
    if (own) runner.release();
  }
}

async function listPlanAllocations(campaignId, { client = null } = {}) {
  const runner = client || pool;
  const id = Number(campaignId);
  try {
    const { rows } = await runner.query(
      `SELECT * FROM freelancer_activation_plan_daily_allocations
        WHERE campaign_id = $1
        ORDER BY plan_tier_code ASC, id ASC`,
      [id],
    );
    return { schemaReady: true, allocations: rows.map(mapAllocation) };
  } catch (err) {
    if (isMissingSchema(err)) return { schemaReady: false, allocations: [] };
    throw err;
  }
}

async function upsertPlanAllocation(campaignId, body = {}, { actorUserId = null, client = null } = {}) {
  const runner = client || pool;
  const id = Number(campaignId);
  const tier = assertPlanTier(body.planTierCode || body.plan_tier_code);
  const defaults = defaultSplitForTier(tier);
  const split = assertShareSplit({
    totalArticleValueJod: body.totalArticleValueJod ?? body.total_article_value_jod ?? defaults.totalArticleValueJod,
    freelancerShareJod: body.freelancerShareJod ?? body.freelancer_share_jod ?? defaults.freelancerShareJod,
    companyShareJod: body.companyShareJod ?? body.company_share_jod ?? defaults.companyShareJod,
    reviewerShareJod: body.reviewerShareJod ?? body.reviewer_share_jod ?? defaults.reviewerShareJod,
  });
  const waveId =
    body.waveId != null && body.waveId !== ""
      ? Number(body.waveId)
      : body.wave_id != null && body.wave_id !== ""
        ? Number(body.wave_id)
        : null;
  const releaseMode = String(body.releaseMode || body.release_mode || "manual").toLowerCase();
  if (!FREELANCER_ACTIVATION_RELEASE_MODES.includes(releaseMode)) {
    throw createAppError("Invalid release mode.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_PLAN_TIER,
    });
  }
  const releaseIntervalRaw = body.releaseIntervalDays ?? body.release_interval_days;
  let releaseIntervalDays = 1;
  if (releaseIntervalRaw != null && releaseIntervalRaw !== "") {
    const n = Number(releaseIntervalRaw);
    if (!Number.isInteger(n) || n < 1 || n > 30) {
      throw createAppError("فترة الإنزال يجب أن تكون بين 1 و 30 يومًا.", 400, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_PLAN_TIER,
      });
    }
    releaseIntervalDays = n;
  }
  const dailyBudget =
    body.dailyBudgetJod != null && body.dailyBudgetJod !== ""
      ? millisToJodString(parseMoney(body.dailyBudgetJod, "daily budget"))
      : null;
  const maxDaily =
    body.maxDailyArticles != null && body.maxDailyArticles !== ""
      ? Math.max(0, Number(body.maxDailyArticles))
      : null;
  const minBidders = Math.max(1, Number(body.minimumBiddersPerArticle ?? body.minimum_bidders_per_article ?? 10) || 10);
  const isEnabled = body.isEnabled !== undefined ? Boolean(body.isEnabled) : true;
  const recycle = Boolean(body.recycleWhenInventoryEmpty ?? body.recycle_when_inventory_empty);
  const autoAssignEnabled = Boolean(body.autoAssignEnabled ?? body.auto_assign_enabled);
  let autoAssignMode = String(body.autoAssignMode ?? body.auto_assign_mode ?? "disabled").toLowerCase();
  if (autoAssignEnabled && autoAssignMode === "disabled") autoAssignMode = "weighted_fair";
  if (!["disabled", "weighted_fair"].includes(autoAssignMode)) autoAssignMode = "disabled";
  const autoAssignWhenMin = Boolean(
    body.autoAssignWhenMinBiddersReached ?? body.auto_assign_when_min_bidders_reached ?? autoAssignEnabled,
  );

  try {
    await campaignService.getActivationCampaignDetail(id);
    const waveParam = Number.isInteger(waveId) && waveId > 0 ? waveId : null;
    const { rows: existing } = await runner.query(
      `SELECT id FROM freelancer_activation_plan_daily_allocations
        WHERE campaign_id = $1 AND plan_tier_code = $2
          AND (($3::bigint IS NULL AND wave_id IS NULL) OR wave_id = $3)
        LIMIT 1`,
      [id, tier, waveParam],
    );
    if (existing[0]) {
      return patchPlanAllocation(existing[0].id, {
        dailyBudgetJod: dailyBudget,
        maxDailyArticles: maxDaily,
        totalArticleValueJod: split.totalArticleValueJod,
        freelancerShareJod: split.freelancerShareJod,
        companyShareJod: split.companyShareJod,
        reviewerShareJod: split.reviewerShareJod,
        minimumBiddersPerArticle: minBidders,
        isEnabled,
        releaseMode,
        releaseIntervalDays,
        recycleWhenInventoryEmpty: recycle,
        autoAssignEnabled,
        autoAssignMode,
        autoAssignWhenMinBiddersReached: autoAssignWhenMin,
      }, { client: runner });
    }
    try {
      const { rows } = await runner.query(
        `INSERT INTO freelancer_activation_plan_daily_allocations (
           campaign_id, wave_id, plan_tier_code,
           daily_budget_jod, max_daily_articles,
           total_article_value_jod, freelancer_share_jod, company_share_jod, reviewer_share_jod,
           minimum_bidders_per_article, is_enabled, release_mode, release_interval_days,
           recycle_when_inventory_empty,
           auto_assign_enabled, auto_assign_mode, auto_assign_when_min_bidders_reached
         ) VALUES (
           $1, $2, $3,
           $4::numeric, $5,
           $6::numeric, $7::numeric, $8::numeric, $9::numeric,
           $10, $11, $12, $13, $14,
           $15, $16, $17
         ) RETURNING *`,
        [
          id,
          waveParam,
          tier,
          dailyBudget,
          Number.isInteger(maxDaily) ? maxDaily : null,
          split.totalArticleValueJod,
          split.freelancerShareJod,
          split.companyShareJod,
          split.reviewerShareJod,
          minBidders,
          isEnabled,
          releaseMode,
          releaseIntervalDays,
          recycle,
          autoAssignEnabled,
          autoAssignMode,
          autoAssignWhenMin,
        ],
      );
      return mapAllocation(rows[0]);
    } catch (colErr) {
      if (colErr?.code !== "42703") throw colErr;
      const { rows } = await runner.query(
        `INSERT INTO freelancer_activation_plan_daily_allocations (
           campaign_id, wave_id, plan_tier_code,
           daily_budget_jod, max_daily_articles,
           total_article_value_jod, freelancer_share_jod, company_share_jod, reviewer_share_jod,
           minimum_bidders_per_article, is_enabled, release_mode, recycle_when_inventory_empty,
           auto_assign_enabled, auto_assign_mode, auto_assign_when_min_bidders_reached
         ) VALUES (
           $1, $2, $3,
           $4::numeric, $5,
           $6::numeric, $7::numeric, $8::numeric, $9::numeric,
           $10, $11, $12, $13,
           $14, $15, $16
         ) RETURNING *`,
        [
          id,
          waveParam,
          tier,
          dailyBudget,
          Number.isInteger(maxDaily) ? maxDaily : null,
          split.totalArticleValueJod,
          split.freelancerShareJod,
          split.companyShareJod,
          split.reviewerShareJod,
          minBidders,
          isEnabled,
          releaseMode,
          recycle,
          autoAssignEnabled,
          autoAssignMode,
          autoAssignWhenMin,
        ],
      );
      return mapAllocation(rows[0]);
    }
  } catch (err) {
    if (isMissingSchema(err)) throw schemaMissingError();
    // Pre-175 schema without auto_assign columns
    if (err?.code === "42703") {
      const { rows } = await runner.query(
        `INSERT INTO freelancer_activation_plan_daily_allocations (
           campaign_id, wave_id, plan_tier_code,
           daily_budget_jod, max_daily_articles,
           total_article_value_jod, freelancer_share_jod, company_share_jod, reviewer_share_jod,
           minimum_bidders_per_article, is_enabled, release_mode, recycle_when_inventory_empty
         ) VALUES (
           $1, $2, $3,
           $4::numeric, $5,
           $6::numeric, $7::numeric, $8::numeric, $9::numeric,
           $10, $11, $12, $13
         ) RETURNING *`,
        [
          id,
          Number.isInteger(waveId) && waveId > 0 ? waveId : null,
          tier,
          dailyBudget,
          Number.isInteger(maxDaily) ? maxDaily : null,
          split.totalArticleValueJod,
          split.freelancerShareJod,
          split.companyShareJod,
          split.reviewerShareJod,
          minBidders,
          isEnabled,
          releaseMode,
          recycle,
        ],
      );
      return mapAllocation(rows[0]);
    }
    throw err;
  }
}

async function patchPlanAllocation(allocationId, body = {}, { client = null } = {}) {
  const runner = client || pool;
  const id = Number(allocationId);
  try {
    const { rows: existingRows } = await runner.query(
      `SELECT * FROM freelancer_activation_plan_daily_allocations WHERE id = $1`,
      [id],
    );
    const existing = existingRows[0];
    if (!existing) {
      throw createAppError("Plan allocation not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.ALLOCATION_NOT_FOUND,
      });
    }
    const merged = {
      totalArticleValueJod: body.totalArticleValueJod ?? existing.total_article_value_jod,
      freelancerShareJod: body.freelancerShareJod ?? existing.freelancer_share_jod,
      companyShareJod: body.companyShareJod ?? existing.company_share_jod,
      reviewerShareJod: body.reviewerShareJod ?? existing.reviewer_share_jod,
    };
    const split = assertShareSplit(merged);
    const releaseMode = String(body.releaseMode ?? existing.release_mode ?? "manual").toLowerCase();
    const dailyBudget =
      body.dailyBudgetJod !== undefined
        ? body.dailyBudgetJod === null || body.dailyBudgetJod === ""
          ? null
          : millisToJodString(parseMoney(body.dailyBudgetJod, "daily budget"))
        : existing.daily_budget_jod;
    const maxDaily =
      body.maxDailyArticles !== undefined
        ? body.maxDailyArticles === null || body.maxDailyArticles === ""
          ? null
          : Math.max(0, Number(body.maxDailyArticles))
        : existing.max_daily_articles;
    const autoAssignEnabled =
      body.autoAssignEnabled !== undefined
        ? Boolean(body.autoAssignEnabled)
        : Boolean(existing.auto_assign_enabled);
    let autoAssignMode =
      body.autoAssignMode !== undefined
        ? String(body.autoAssignMode || "disabled").toLowerCase()
        : String(existing.auto_assign_mode || "disabled");
    if (autoAssignEnabled && autoAssignMode === "disabled") autoAssignMode = "weighted_fair";
    if (!["disabled", "weighted_fair"].includes(autoAssignMode)) autoAssignMode = "disabled";
    const autoAssignWhenMin =
      body.autoAssignWhenMinBiddersReached !== undefined
        ? Boolean(body.autoAssignWhenMinBiddersReached)
        : Boolean(existing.auto_assign_when_min_bidders_reached);

    let releaseIntervalDays =
      existing.release_interval_days != null
        ? Math.max(1, Math.min(30, Number(existing.release_interval_days) || 1))
        : 1;
    if (body.releaseIntervalDays !== undefined || body.release_interval_days !== undefined) {
      const raw = body.releaseIntervalDays ?? body.release_interval_days;
      if (raw === null || raw === "") {
        releaseIntervalDays = 1;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 30) {
          throw createAppError("فترة الإنزال يجب أن تكون بين 1 و 30 يومًا.", 400, {
            exposeToClient: true,
            publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_PLAN_TIER,
          });
        }
        releaseIntervalDays = n;
      }
    }

    try {
      const { rows } = await runner.query(
        `UPDATE freelancer_activation_plan_daily_allocations SET
           daily_budget_jod = $2::numeric,
           max_daily_articles = $3,
           total_article_value_jod = $4::numeric,
           freelancer_share_jod = $5::numeric,
           company_share_jod = $6::numeric,
           reviewer_share_jod = $7::numeric,
           minimum_bidders_per_article = $8,
           is_enabled = $9,
           release_mode = $10,
           release_interval_days = $11,
           recycle_when_inventory_empty = $12,
           auto_assign_enabled = $13,
           auto_assign_mode = $14,
           auto_assign_when_min_bidders_reached = $15,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          dailyBudget,
          maxDaily,
          split.totalArticleValueJod,
          split.freelancerShareJod,
          split.companyShareJod,
          split.reviewerShareJod,
          Math.max(1, Number(body.minimumBiddersPerArticle ?? existing.minimum_bidders_per_article) || 10),
          body.isEnabled !== undefined ? Boolean(body.isEnabled) : Boolean(existing.is_enabled),
          releaseMode,
          releaseIntervalDays,
          body.recycleWhenInventoryEmpty !== undefined
            ? Boolean(body.recycleWhenInventoryEmpty)
            : Boolean(existing.recycle_when_inventory_empty),
          autoAssignEnabled,
          autoAssignMode,
          autoAssignWhenMin,
        ],
      );
      return mapAllocation(rows[0]);
    } catch (colErr) {
      if (colErr?.code !== "42703") throw colErr;
      try {
        const { rows } = await runner.query(
          `UPDATE freelancer_activation_plan_daily_allocations SET
             daily_budget_jod = $2::numeric,
             max_daily_articles = $3,
             total_article_value_jod = $4::numeric,
             freelancer_share_jod = $5::numeric,
             company_share_jod = $6::numeric,
             reviewer_share_jod = $7::numeric,
             minimum_bidders_per_article = $8,
             is_enabled = $9,
             release_mode = $10,
             recycle_when_inventory_empty = $11,
             auto_assign_enabled = $12,
             auto_assign_mode = $13,
             auto_assign_when_min_bidders_reached = $14,
             updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            id,
            dailyBudget,
            maxDaily,
            split.totalArticleValueJod,
            split.freelancerShareJod,
            split.companyShareJod,
            split.reviewerShareJod,
            Math.max(1, Number(body.minimumBiddersPerArticle ?? existing.minimum_bidders_per_article) || 10),
            body.isEnabled !== undefined ? Boolean(body.isEnabled) : Boolean(existing.is_enabled),
            releaseMode,
            body.recycleWhenInventoryEmpty !== undefined
              ? Boolean(body.recycleWhenInventoryEmpty)
              : Boolean(existing.recycle_when_inventory_empty),
            autoAssignEnabled,
            autoAssignMode,
            autoAssignWhenMin,
          ],
        );
        return mapAllocation(rows[0]);
      } catch (colErr2) {
        if (colErr2?.code !== "42703") throw colErr2;
        const { rows } = await runner.query(
          `UPDATE freelancer_activation_plan_daily_allocations SET
             daily_budget_jod = $2::numeric,
             max_daily_articles = $3,
             total_article_value_jod = $4::numeric,
             freelancer_share_jod = $5::numeric,
             company_share_jod = $6::numeric,
             reviewer_share_jod = $7::numeric,
             minimum_bidders_per_article = $8,
             is_enabled = $9,
             release_mode = $10,
             recycle_when_inventory_empty = $11,
             updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            id,
            dailyBudget,
            maxDaily,
            split.totalArticleValueJod,
            split.freelancerShareJod,
            split.companyShareJod,
            split.reviewerShareJod,
            Math.max(1, Number(body.minimumBiddersPerArticle ?? existing.minimum_bidders_per_article) || 10),
            body.isEnabled !== undefined ? Boolean(body.isEnabled) : Boolean(existing.is_enabled),
            releaseMode,
            body.recycleWhenInventoryEmpty !== undefined
              ? Boolean(body.recycleWhenInventoryEmpty)
              : Boolean(existing.recycle_when_inventory_empty),
          ],
        );
        return mapAllocation(rows[0]);
      }
    }
  } catch (err) {
    if (isMissingSchema(err)) throw schemaMissingError();
    throw err;
  }
}

async function listInventoryItems({ campaignId = null, status = null, client = null } = {}) {
  const runner = client || pool;
  try {
    const params = [];
    const where = [];
    if (campaignId != null) {
      params.push(Number(campaignId));
      where.push(`campaign_id = $${params.length}`);
    }
    if (status) {
      params.push(String(status));
      where.push(`status = $${params.length}`);
    }
    const sql = `SELECT * FROM freelancer_activation_article_inventory_items
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, id DESC
      LIMIT 200`;
    const { rows } = await runner.query(sql, params);
    return { schemaReady: true, items: rows.map(mapInventoryItem) };
  } catch (err) {
    if (isMissingSchema(err)) return { schemaReady: false, items: [] };
    throw err;
  }
}

async function createInventoryItem(body = {}, { actorUserId = null, client = null } = {}) {
  const runner = client || pool;
  const campaignId = Number(body.campaignId ?? body.campaign_id);
  if (!Number.isInteger(campaignId) || campaignId < 1) {
    throw createAppError("campaignId is required.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVENTORY_NOT_FOUND,
    });
  }
  const tier = assertPlanTier(body.planTierCode || body.plan_tier_code || "starter");
  const defaults = defaultSplitForTier(tier);
  let splitSource = defaults;
  try {
    const allocs = await listPlanAllocations(campaignId, { client: runner });
    const match = (allocs.allocations || []).find((a) => a.planTierCode === tier && a.isEnabled);
    if (match) splitSource = match;
  } catch {
    /* use defaults */
  }
  const split = assertShareSplit({
    totalArticleValueJod: body.totalArticleValueJod ?? splitSource.totalArticleValueJod,
    freelancerShareJod: body.freelancerShareJod ?? splitSource.freelancerShareJod,
    companyShareJod: body.companyShareJod ?? splitSource.companyShareJod,
    reviewerShareJod: body.reviewerShareJod ?? splitSource.reviewerShareJod,
  });
  const title = String(body.title || "").trim();
  if (!title) {
    throw createAppError("عنوان المقال مطلوب.", 400, { exposeToClient: true });
  }
  const status = String(body.status || "draft").toLowerCase();
  if (!FREELANCER_ACTIVATION_INVENTORY_STATUSES.includes(status)) {
    throw createAppError("Invalid inventory status.", 400, { exposeToClient: true });
  }
  const strategy = String(body.releaseStrategy || "one_time").toLowerCase();
  if (!FREELANCER_ACTIVATION_INVENTORY_RELEASE_STRATEGIES.includes(strategy)) {
    throw createAppError("Invalid release strategy.", 400, { exposeToClient: true });
  }
  const visibilityDurationHours = parseVisibilityDurationHoursOrThrow(
    body.visibilityDurationHours ?? body.visibility_duration_hours,
    { createAppError },
  );
  try {
    const { rows } = await runner.query(
      `INSERT INTO freelancer_activation_article_inventory_items (
         campaign_id, wave_id, plan_tier_code, title, description, requirements,
         category_id, subcategory_id,
         total_article_value_jod, freelancer_share_jod, company_share_jod, reviewer_share_jod,
         minimum_bidders_per_article, visibility_duration_hours, status, release_strategy, max_releases, created_by_user_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8,
         $9::numeric, $10::numeric, $11::numeric, $12::numeric,
         $13, $14, $15, $16, $17, $18
       ) RETURNING *`,
      [
        campaignId,
        body.waveId != null ? Number(body.waveId) : null,
        tier,
        title,
        body.description || null,
        body.requirements || null,
        body.categoryId != null ? Number(body.categoryId) : null,
        body.subcategoryId != null ? Number(body.subcategoryId) : null,
        split.totalArticleValueJod,
        split.freelancerShareJod,
        split.companyShareJod,
        split.reviewerShareJod,
        Math.max(1, Number(body.minimumBiddersPerArticle ?? splitSource.minimumBiddersPerArticle ?? 10) || 10),
        visibilityDurationHours,
        status,
        strategy,
        body.maxReleases != null ? Number(body.maxReleases) : null,
        actorUserId,
      ],
    );
    return mapInventoryItem(rows[0]);
  } catch (err) {
    if (err?.code === "42703") {
      // Column not migrated yet — insert without visibility_duration_hours (DB may lack default).
      const { rows } = await runner.query(
        `INSERT INTO freelancer_activation_article_inventory_items (
           campaign_id, wave_id, plan_tier_code, title, description, requirements,
           category_id, subcategory_id,
           total_article_value_jod, freelancer_share_jod, company_share_jod, reviewer_share_jod,
           minimum_bidders_per_article, status, release_strategy, max_releases, created_by_user_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8,
           $9::numeric, $10::numeric, $11::numeric, $12::numeric,
           $13, $14, $15, $16, $17
         ) RETURNING *`,
        [
          campaignId,
          body.waveId != null ? Number(body.waveId) : null,
          tier,
          title,
          body.description || null,
          body.requirements || null,
          body.categoryId != null ? Number(body.categoryId) : null,
          body.subcategoryId != null ? Number(body.subcategoryId) : null,
          split.totalArticleValueJod,
          split.freelancerShareJod,
          split.companyShareJod,
          split.reviewerShareJod,
          Math.max(1, Number(body.minimumBiddersPerArticle ?? splitSource.minimumBiddersPerArticle ?? 10) || 10),
          status,
          strategy,
          body.maxReleases != null ? Number(body.maxReleases) : null,
          actorUserId,
        ],
      );
      const mapped = mapInventoryItem(rows[0]);
      if (mapped) mapped.visibilityDurationHours = visibilityDurationHours;
      return mapped;
    }
    if (isMissingSchema(err)) throw schemaMissingError();
    throw err;
  }
}

async function patchInventoryItem(itemId, body = {}, { client = null } = {}) {
  const runner = client || pool;
  const id = Number(itemId);
  try {
    const { rows: curRows } = await runner.query(
      `SELECT * FROM freelancer_activation_article_inventory_items WHERE id = $1`,
      [id],
    );
    const cur = curRows[0];
    if (!cur) {
      throw createAppError("Inventory item not found.", 404, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVENTORY_NOT_FOUND,
      });
    }
    const split = assertShareSplit({
      totalArticleValueJod: body.totalArticleValueJod ?? cur.total_article_value_jod,
      freelancerShareJod: body.freelancerShareJod ?? cur.freelancer_share_jod,
      companyShareJod: body.companyShareJod ?? cur.company_share_jod,
      reviewerShareJod: body.reviewerShareJod ?? cur.reviewer_share_jod,
    });
    const status = body.status != null ? String(body.status).toLowerCase() : cur.status;
    if (!FREELANCER_ACTIVATION_INVENTORY_STATUSES.includes(status)) {
      throw createAppError("Invalid inventory status.", 400, { exposeToClient: true });
    }
    let visibilityDurationHours = normalizeVisibilityDurationHours(cur.visibility_duration_hours);
    if (body.visibilityDurationHours !== undefined || body.visibility_duration_hours !== undefined) {
      visibilityDurationHours = parseVisibilityDurationHoursOrThrow(
        body.visibilityDurationHours ?? body.visibility_duration_hours,
        { createAppError },
      );
    }
    try {
      const { rows } = await runner.query(
        `UPDATE freelancer_activation_article_inventory_items SET
           title = $2,
           description = $3,
           requirements = $4,
           total_article_value_jod = $5::numeric,
           freelancer_share_jod = $6::numeric,
           company_share_jod = $7::numeric,
           reviewer_share_jod = $8::numeric,
           minimum_bidders_per_article = $9,
           visibility_duration_hours = $10,
           status = $11,
           release_strategy = $12,
           max_releases = $13,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          body.title != null ? String(body.title).trim() : cur.title,
          body.description !== undefined ? body.description : cur.description,
          body.requirements !== undefined ? body.requirements : cur.requirements,
          split.totalArticleValueJod,
          split.freelancerShareJod,
          split.companyShareJod,
          split.reviewerShareJod,
          Math.max(1, Number(body.minimumBiddersPerArticle ?? cur.minimum_bidders_per_article) || 10),
          visibilityDurationHours,
          status,
          body.releaseStrategy != null ? String(body.releaseStrategy) : cur.release_strategy,
          body.maxReleases !== undefined ? body.maxReleases : cur.max_releases,
        ],
      );
      return mapInventoryItem(rows[0]);
    } catch (err) {
      if (err?.code === "42703") {
        const { rows } = await runner.query(
          `UPDATE freelancer_activation_article_inventory_items SET
             title = $2,
             description = $3,
             requirements = $4,
             total_article_value_jod = $5::numeric,
             freelancer_share_jod = $6::numeric,
             company_share_jod = $7::numeric,
             reviewer_share_jod = $8::numeric,
             minimum_bidders_per_article = $9,
             status = $10,
             release_strategy = $11,
             max_releases = $12,
             updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            id,
            body.title != null ? String(body.title).trim() : cur.title,
            body.description !== undefined ? body.description : cur.description,
            body.requirements !== undefined ? body.requirements : cur.requirements,
            split.totalArticleValueJod,
            split.freelancerShareJod,
            split.companyShareJod,
            split.reviewerShareJod,
            Math.max(1, Number(body.minimumBiddersPerArticle ?? cur.minimum_bidders_per_article) || 10),
            status,
            body.releaseStrategy != null ? String(body.releaseStrategy) : cur.release_strategy,
            body.maxReleases !== undefined ? body.maxReleases : cur.max_releases,
          ],
        );
        const mapped = mapInventoryItem(rows[0]);
        if (mapped) mapped.visibilityDurationHours = visibilityDurationHours;
        return mapped;
      }
      throw err;
    }
  } catch (err) {
    if (isMissingSchema(err)) throw schemaMissingError();
    throw err;
  }
}

function assertInventoryItemReleasable(item) {
  if (!item) {
    throw createAppError("Inventory item not found.", 404, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVENTORY_NOT_FOUND,
    });
  }
  if (!["ready", "released"].includes(String(item.status))) {
    throw createAppError("المقال غير جاهز للإنزال.", 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVENTORY_NOT_READY,
    });
  }
  if (item.release_strategy === "one_time" && Number(item.released_count) >= 1) {
    throw createAppError("تم إنزال هذا المقال مسبقًا.", 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVENTORY_EXHAUSTED,
    });
  }
  if (item.max_releases != null && Number(item.released_count) >= Number(item.max_releases)) {
    throw createAppError("بلغ المقال الحد الأقصى لمرات الإنزال.", 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVENTORY_EXHAUSTED,
    });
  }
}

async function hasActivePublishedArticleForInventory(runner, inventoryItemId) {
  const id = Number(inventoryItemId);
  if (!Number.isInteger(id) || id < 1) return false;
  try {
    const { rows } = await runner.query(
      `SELECT id
         FROM marketplace_articles
        WHERE activation_inventory_item_id = $1
          AND status = 'published'
        LIMIT 1`,
      [id],
    );
    return Boolean(rows[0]);
  } catch (err) {
    if (err?.code === "42703" || err?.code === "42P01") return false;
    throw err;
  }
}

/**
 * After minimum_not_met close: restore inventory for a future release cycle.
 * Unsuccessful one_time release is not final exhaustion — decrement released_count.
 * Does not release immediately; release_interval_days still gates auto runs.
 */
async function restoreInventoryItemAfterMinimumNotMet(client, { articleId, now = new Date() } = {}) {
  const aid = Number(articleId);
  if (!Number.isInteger(aid) || aid < 1) {
    return { restored: false, reason: "invalid_article" };
  }
  let invId = null;
  try {
    const { rows } = await client.query(
      `SELECT activation_inventory_item_id
         FROM marketplace_articles
        WHERE id = $1`,
      [aid],
    );
    invId = rows[0]?.activation_inventory_item_id != null
      ? Number(rows[0].activation_inventory_item_id)
      : null;
  } catch (err) {
    if (err?.code === "42703" || err?.code === "42P01") {
      return { restored: false, reason: "schema_not_ready" };
    }
    throw err;
  }
  if (!invId) return { restored: false, reason: "not_inventory_article" };

  try {
    const { rows: active } = await client.query(
      `SELECT id
         FROM marketplace_articles
        WHERE activation_inventory_item_id = $1
          AND status = 'published'
          AND id <> $2
        LIMIT 1`,
      [invId, aid],
    );
    if (active[0]) {
      return { restored: false, reason: "other_active_published", inventoryItemId: invId };
    }
  } catch (err) {
    if (err?.code !== "42703" && err?.code !== "42P01") throw err;
  }

  try {
    const { rows } = await client.query(
      `UPDATE freelancer_activation_article_inventory_items
          SET status = 'ready',
              released_count = GREATEST(0, COALESCE(released_count, 0) - 1),
              metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE id = $1
          AND status IN ('released', 'exhausted')
        RETURNING *`,
      [
        invId,
        JSON.stringify({
          lastMinimumNotMetArticleId: aid,
          lastMinimumNotMetAt: new Date(now).toISOString(),
          restoredForNextReleaseCycle: true,
        }),
      ],
    );
    if (!rows[0]) {
      return { restored: false, reason: "inventory_not_in_released_state", inventoryItemId: invId };
    }
    return {
      restored: true,
      inventoryItemId: invId,
      inventoryItem: mapInventoryItem(rows[0]),
    };
  } catch (err) {
    if (err?.code === "42703" || err?.code === "42P01") {
      return { restored: false, reason: "schema_not_ready", inventoryItemId: invId };
    }
    throw err;
  }
}

/**
 * Create one live marketplace_article from a locked inventory row (runner must own txn).
 * Creates bid collection round + deadline so minimum_not_met expiry/refund can run.
 * Does not assign winner. Does not reserve A4.2 budget.
 */
async function executeInventoryReleaseOnRunner(
  runner,
  item,
  {
    actorUserId = null,
    skipFundCheck = false,
    applicationDeadlineAt = null,
    now = new Date(),
  } = {},
) {
  assertInventoryItemReleasable(item);

  if (await hasActivePublishedArticleForInventory(runner, item.id)) {
    throw createAppError("يوجد بالفعل مقال منشور نشط من نفس عنصر المخزون.", 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.RELEASE_BLOCKED,
      skipReason: "active_published_exists",
    });
  }

  const totalMillis = parseMoney(item.total_article_value_jod, "article value");
  if (!skipFundCheck) {
    const fundBalance = await computeFundBalanceMillis(runner, { campaignId: item.campaign_id });
    if (totalMillis > fundBalance) {
      throw createAppError("رصيد صندوق المقالات غير كافٍ لإنزال المقال.", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INSUFFICIENT_FUND,
      });
    }
  }

  const level = resolveArticleLevelForTier(item.plan_tier_code);
  const minBidders = Math.max(1, Number(item.minimum_bidders_per_article) || 10);
  const wordCount = level <= 1 ? 400 : level <= 2 ? 600 : level <= 3 ? 800 : 1000;

  const autoAssignEnabled = Boolean(
    item.activation_auto_assign_enabled
      ?? item.auto_assign_enabled
      ?? item.autoAssignEnabled,
  );
  const autoAssignMode = String(
    item.activation_auto_assign_mode
      ?? item.auto_assign_mode
      ?? item.autoAssignMode
      ?? "disabled",
  );
  const autoAssignWhenMin = Boolean(
    item.activation_auto_assign_when_min_bidders_reached
      ?? item.auto_assign_when_min_bidders_reached
      ?? item.autoAssignWhenMinBiddersReached,
  );

  const opportunityBidCollectionService = require("./opportunityBidCollectionService");
  const visibilityDurationHours = normalizeVisibilityDurationHours(
    item.visibility_duration_hours
      ?? item.visibilityDurationHours
      ?? null,
  );
  const deadlineIso = opportunityBidCollectionService.resolveInventoryReleaseBidCollectionDeadline({
    visibilityDurationHours,
    now,
    explicitDeadline: applicationDeadlineAt ?? item.application_deadline_at ?? null,
  });

  let article;
  try {
    const { rows: articleRows } = await runner.query(
      `INSERT INTO marketplace_articles (
         title, description, category_id, subcategory_id,
         article_level, article_value_jod,
         required_word_count, required_references_count,
         status, is_fake_or_training,
         required_bid_count, application_deadline_at,
         budget_total_jod, target_article_count,
         activation_campaign_id, activation_wave_id,
         activation_plan_tier_code,
         activation_freelancer_share_jod,
         activation_company_share_jod,
         activation_reviewer_share_jod,
         activation_inventory_item_id,
         activation_auto_assign_enabled,
         activation_auto_assign_mode,
         activation_auto_assign_when_min_bidders_reached,
         created_by_user_id, updated_by_user_id,
         published_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6::numeric,
         $7, 0,
         'published', FALSE,
         $8, $9::timestamptz,
         $6::numeric, 1,
         $10, $11,
         $12,
         $13::numeric, $14::numeric, $15::numeric,
         $16,
         $17, $18, $19,
         $20, $20,
         NOW()
       ) RETURNING *`,
      [
        item.title,
        item.description || "",
        item.category_id,
        item.subcategory_id,
        level,
        millisToJodString(totalMillis),
        wordCount,
        minBidders,
        deadlineIso,
        item.campaign_id,
        item.wave_id,
        item.plan_tier_code,
        String(item.freelancer_share_jod),
        String(item.company_share_jod),
        String(item.reviewer_share_jod),
        item.id,
        autoAssignEnabled,
        autoAssignMode === "weighted_fair" ? "weighted_fair" : "disabled",
        autoAssignWhenMin,
        actorUserId,
      ],
    );
    article = articleRows[0];
  } catch (err) {
    if (err?.code !== "42703") throw err;
    const { rows: articleRows } = await runner.query(
      `INSERT INTO marketplace_articles (
         title, description, category_id, subcategory_id,
         article_level, article_value_jod,
         required_word_count, required_references_count,
         status, is_fake_or_training,
         required_bid_count,
         budget_total_jod, target_article_count,
         activation_campaign_id, activation_wave_id,
         activation_plan_tier_code,
         activation_freelancer_share_jod,
         activation_company_share_jod,
         activation_reviewer_share_jod,
         activation_inventory_item_id,
         created_by_user_id, updated_by_user_id,
         published_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6::numeric,
         $7, 0,
         'published', FALSE,
         $8,
         $6::numeric, 1,
         $9, $10,
         $11,
         $12::numeric, $13::numeric, $14::numeric,
         $15,
         $16, $16,
         NOW()
       ) RETURNING *`,
      [
        item.title,
        item.description || "",
        item.category_id,
        item.subcategory_id,
        level,
        millisToJodString(totalMillis),
        wordCount,
        minBidders,
        item.campaign_id,
        item.wave_id,
        item.plan_tier_code,
        String(item.freelancer_share_jod),
        String(item.company_share_jod),
        String(item.reviewer_share_jod),
        item.id,
        actorUserId,
      ],
    );
    article = articleRows[0];
  }

  let bidCollectionRound = null;
  try {
    bidCollectionRound = await opportunityBidCollectionService.createInitialArticleRound(
      Number(article.id),
      minBidders,
      deadlineIso,
      { client: runner },
    );
    if (bidCollectionRound?.id) {
      const { rows: refreshed } = await runner.query(
        `SELECT * FROM marketplace_articles WHERE id = $1`,
        [Number(article.id)],
      );
      if (refreshed[0]) article = refreshed[0];
    }
  } catch (roundErr) {
    if (roundErr?.code !== "42P01" && roundErr?.code !== "42703") throw roundErr;
  }

  const nextCount = Number(item.released_count) + 1;
  let nextStatus = "released";
  if (item.release_strategy === "one_time") nextStatus = "released";
  if (item.max_releases != null && nextCount >= Number(item.max_releases)) nextStatus = "exhausted";

  await runner.query(
    `UPDATE freelancer_activation_article_inventory_items SET
       released_count = $2,
       last_released_at = NOW(),
       status = $3,
       metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
       updated_at = NOW()
     WHERE id = $1`,
    [
      item.id,
      nextCount,
      nextStatus,
      JSON.stringify({
        lastReleasedArticleId: Number(article.id),
        lastReleasedAt: new Date().toISOString(),
        bidCollectionRoundId: bidCollectionRound?.id != null ? Number(bidCollectionRound.id) : null,
        applicationDeadlineAt: deadlineIso,
      }),
    ],
  );

  return {
    inventoryItem: mapInventoryItem({
      ...item,
      released_count: nextCount,
      status: nextStatus,
      last_released_at: new Date().toISOString(),
    }),
    article: {
      id: Number(article.id),
      title: article.title,
      articleValueJod: String(article.article_value_jod),
      freelancerShareJod: String(article.activation_freelancer_share_jod),
      companyShareJod: String(article.activation_company_share_jod),
      reviewerShareJod: String(article.activation_reviewer_share_jod),
      planTierCode: article.activation_plan_tier_code,
      activationCampaignId: Number(article.activation_campaign_id),
      activationWaveId: article.activation_wave_id != null ? Number(article.activation_wave_id) : null,
      requiredBidCount: Number(article.required_bid_count),
      applicationDeadlineAt: article.application_deadline_at || deadlineIso,
      currentBidCollectionRoundId:
        article.current_bid_collection_round_id != null
          ? Number(article.current_bid_collection_round_id)
          : bidCollectionRound?.id != null
            ? Number(bidCollectionRound.id)
            : null,
      status: article.status,
      inventoryItemId: item.id != null ? Number(item.id) : null,
    },
    bidCollectionRound: bidCollectionRound
      ? {
          id: Number(bidCollectionRound.id),
          status: bidCollectionRound.bid_collection_status || "collecting",
          deadlineAt: bidCollectionRound.bid_collection_deadline_at || deadlineIso,
          requiredBidCount: Number(bidCollectionRound.required_bid_count) || minBidders,
        }
      : null,
    autoAssigned: false,
  };
}

/**
 * Manual release: create one live marketplace_article from inventory.
 * Does not assign winner. Does not reserve A4.2 budget yet.
 */
async function releaseInventoryItem(itemId, { actorUserId = null, client = null } = {}) {
  const own = !client;
  const runner = client || (await pool.connect());
  try {
    if (own) await runner.query("BEGIN");
    const { rows: itemRows } = await runner.query(
      `SELECT * FROM freelancer_activation_article_inventory_items WHERE id = $1 FOR UPDATE`,
      [Number(itemId)],
    );
    const item = itemRows[0];
    assertInventoryItemReleasable(item);

    const gate = await campaignService.evaluateActivationOpportunityGate({
      article: {
        activation_campaign_id: item.campaign_id,
        activation_wave_id: item.wave_id,
      },
      client: runner,
    });
    if (!gate.skipped && !gate.allowed) {
      throw createAppError(gate.message || "Release blocked.", 409, {
        exposeToClient: true,
        publicCode: gate.code || FREELANCER_ACTIVATION_A91_ERROR_CODES.RELEASE_BLOCKED,
      });
    }

    const allocs = await listPlanAllocations(item.campaign_id, { client: runner });
    const alloc = (allocs.allocations || []).find(
      (a) => a.planTierCode === item.plan_tier_code && a.isEnabled,
    );
    if (allocs.schemaReady && !alloc) {
      throw createAppError("توزيع الخطة غير مفعّل لهذه الباقة.", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.RELEASE_BLOCKED,
      });
    }

    const result = await executeInventoryReleaseOnRunner(runner, {
      ...item,
      auto_assign_enabled: Boolean(alloc?.autoAssignEnabled),
      auto_assign_mode: alloc?.autoAssignMode || "disabled",
      auto_assign_when_min_bidders_reached: Boolean(alloc?.autoAssignWhenMinBiddersReached),
    }, {
      actorUserId,
    });
    if (own) await runner.query("COMMIT");
    return result;
  } catch (err) {
    if (own) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (isMissingSchema(err)) throw schemaMissingError();
    throw err;
  } finally {
    if (own) runner.release();
  }
}

async function recordArticleFundDailyAllocation(runner, {
  campaignId = null,
  waveId = null,
  amountJod,
  reason = null,
  metadata = null,
  actorUserId = null,
} = {}) {
  const millis = parseMoney(amountJod, "daily allocation");
  if (millis <= 0) return null;
  const { rows } = await runner.query(
    `INSERT INTO freelancer_activation_article_fund_entries (
       campaign_id, wave_id, entry_type, amount_jod, reason, metadata, created_by_user_id
     ) VALUES ($1, $2, 'daily_allocation', $3::numeric, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      campaignId,
      waveId,
      millisToJodString(millis),
      reason,
      metadata ? JSON.stringify(metadata) : null,
      actorUserId,
    ],
  );
  return mapFundEntry(rows[0]);
}

/**
 * Build settlement-compatible snapshot fields from activation article shares when present.
 * Does not rewrite settlement math — only supplies gross/writer/company/reviewer amounts.
 */
function buildActivationArticleEconomicOverride(article) {
  if (!article) return null;
  const fre = article.activation_freelancer_share_jod ?? article.activationFreelancerShareJod;
  const co = article.activation_company_share_jod ?? article.activationCompanyShareJod;
  const rev = article.activation_reviewer_share_jod ?? article.activationReviewerShareJod;
  const gross = article.article_value_jod ?? article.articleValueJod;
  if (fre == null || co == null || rev == null || gross == null) return null;
  try {
    const split = assertShareSplit({
      totalArticleValueJod: gross,
      freelancerShareJod: fre,
      companyShareJod: co,
      reviewerShareJod: rev,
    });
    const grossMillis = parseMoney(split.totalArticleValueJod, "gross");
    const companyMillis = parseMoney(split.companyShareJod, "company");
    const companySharePercent =
      grossMillis > 0 ? Number(((companyMillis * 10000) / grossMillis / 100).toFixed(2)) : 0;
    return {
      grossJod: split.totalArticleValueJod,
      companySharePercent,
      companyShareJod: split.companyShareJod,
      reviewerFeeJod: split.reviewerShareJod,
      writerNetJod: split.freelancerShareJod,
      activationPlanTierCode: article.activation_plan_tier_code || article.activationPlanTierCode || null,
      amountSource: "activation_article_shares",
    };
  } catch {
    return null;
  }
}

module.exports = {
  assertShareSplit,
  assertPlanTier,
  defaultSplitForTier,
  mapFundEntry,
  mapAllocation,
  mapInventoryItem,
  getArticleFundSummary,
  listArticleFundEntries,
  addArticleFundDeposit,
  withdrawArticleFundAmount,
  listPlanAllocations,
  upsertPlanAllocation,
  patchPlanAllocation,
  listInventoryItems,
  createInventoryItem,
  patchInventoryItem,
  releaseInventoryItem,
  executeInventoryReleaseOnRunner,
  assertInventoryItemReleasable,
  hasActivePublishedArticleForInventory,
  restoreInventoryItemAfterMinimumNotMet,
  recordArticleFundDailyAllocation,
  buildActivationArticleEconomicOverride,
  computeFundBalanceMillis,
  parseMoney,
};
