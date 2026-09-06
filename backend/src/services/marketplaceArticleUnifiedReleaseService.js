/**
 * OZ03-P0 — Unified article inventory release.
 * Source of truth: marketplace_articles (draft → published on the same row).
 * Funding: freelancer_activation_article_fund_entries (daily_allocation) with per-article idempotency via metadata.
 * Legacy activation inventory is NOT used on this path.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { millisToJodString } = require("../utils/marketplaceBidPoolMoney");
const {
  FREELANCER_ACTIVATION_A91_ERROR_CODES,
  FREELANCER_ACTIVATION_A92_ERROR_CODES,
  normalizePlanTierCode,
  resolveArticleLevelForTier,
  normalizeVisibilityDurationHours,
  FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS,
} = require("../constants/freelancerActivationArticleOps");
const {
  normalizePackagePlanCode,
  ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS,
} = require("../constants/marketplaceArticleBildazoOz02");
const articleOps = require("./freelancerActivationArticleOpsService");
const opportunityBidCollectionService = require("./opportunityBidCollectionService");
const packageRequirementsService = require("./marketplaceArticlePackageRequirementsService");
const marketplaceArticlesService = require("./marketplaceArticlesService");
const oz04MinimumNotMet = require("./marketplaceArticleOz04MinimumNotMetService");

const OZ03_EMPTY_INVENTORY_AR = "لا توجد مقالات جاهزة للإنزال في مخزون المقالات.";
const OZ03_INSUFFICIENT_FUND_AR = "رصيد صندوق التمويل غير كافٍ لإنزال المقالات المطلوبة.";
const NOT_RELEASE_DAY_MESSAGE_AR = "ليس يوم إنزال حسب الجدولة الحالية.";

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function toDateOnly(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw createAppError("Invalid run date (YYYY-MM-DD).", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.INVALID_DATE,
    });
  }
  return s;
}

function normalizeReleaseIntervalDays(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 30);
}

function utcDayNumber(dateOnly) {
  const [y, m, d] = String(dateOnly).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function isReleaseDayForInterval({ runDate, intervalDays, anchorDate } = {}) {
  const interval = normalizeReleaseIntervalDays(intervalDays);
  if (interval === 1) return true;
  const run = toDateOnly(runDate);
  const anchor = anchorDate ? toDateOnly(String(anchorDate).slice(0, 10)) : run;
  const daysSince = utcDayNumber(run) - utcDayNumber(anchor);
  if (daysSince < 0) return false;
  return daysSince % interval === 0;
}

function planTierFromArticleRow(row) {
  const fromCol = normalizePlanTierCode(row.activation_plan_tier_code || "");
  if (fromCol && FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[fromCol]) return fromCol;
  const level = Number(row.article_level) || 0;
  if (level >= 5) return "elite";
  if (level >= 3) return "pro";
  if (level >= 2) return "silver";
  return "starter";
}

function mapArticleBrief(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    status: row.status,
    articleLevel: Number(row.article_level) || 1,
    articleValueJod: String(row.article_value_jod ?? "0"),
    activationPlanTierCode: row.activation_plan_tier_code || null,
    planTierCode: planTierFromArticleRow(row),
    requiredWordCount: Number(row.required_word_count) || 0,
    requiredReferencesCount: Number(row.required_references_count) || 0,
    writingMode: row.writing_mode || null,
    bildazoCategoryId: row.bildazo_category_id || null,
    bildazoCategoryName: row.bildazo_category_name || null,
  };
}

async function countDraftInventoryArticles({ client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT COUNT(*)::int AS c
         FROM marketplace_articles
        WHERE status = 'draft'
          AND COALESCE(is_fake_or_training, FALSE) = FALSE`,
    );
    return Number(rows[0]?.c) || 0;
  } catch (err) {
    if (isMissingSchema(err)) return 0;
    throw err;
  }
}

async function countPublishedReleasedArticles({ client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT COUNT(*)::int AS c
         FROM marketplace_articles
        WHERE status = 'published'
          AND COALESCE(is_fake_or_training, FALSE) = FALSE`,
    );
    return Number(rows[0]?.c) || 0;
  } catch (err) {
    if (isMissingSchema(err)) return 0;
    throw err;
  }
}

async function listEligibleDraftArticles({
  planTierCode = null,
  limit = 50,
  client = null,
} = {}) {
  const runner = client || pool;
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const tier = planTierCode ? normalizePlanTierCode(planTierCode) : null;
  const level = tier ? resolveArticleLevelForTier(tier) : null;
  const params = [];
  let where = `status = 'draft' AND COALESCE(is_fake_or_training, FALSE) = FALSE`;
  if (tier) {
    params.push(tier, level);
    where += ` AND (
      LOWER(COALESCE(activation_plan_tier_code, '')) = $1
      OR (
        (activation_plan_tier_code IS NULL OR TRIM(activation_plan_tier_code) = '')
        AND article_level = $2
      )
    )`;
  }
  params.push(lim);
  const { rows } = await runner.query(
    `SELECT * FROM marketplace_articles WHERE ${where} ORDER BY id ASC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/**
 * Unrefunded daily_allocation for this article (OZ03 idempotency).
 * After OZ04 minimum_not_met refund, returns null so a future release deducts again.
 */
async function findFundDeductionForArticle(runner, articleId) {
  return oz04MinimumNotMet.findActiveFundDeductionForArticle(runner, articleId);
}

async function ensureWordsRefsOnDraft(runner, row) {
  let words = Number(row.required_word_count) || 0;
  let refs = Number(row.required_references_count);
  if (!Number.isFinite(refs) || refs < 0) refs = 0;
  if (words > 0) {
    return { ...row, required_word_count: words, required_references_count: refs };
  }
  const tier = planTierFromArticleRow(row);
  const planCode = normalizePackagePlanCode(tier) || "STARTER";
  let minWords = ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[planCode]?.minWords || 600;
  let minRefs = ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[planCode]?.minReferences || 0;
  try {
    const req = await packageRequirementsService.getRequirementForPlan(planCode);
    if (req) {
      minWords = Number(req.minWords) || minWords;
      minRefs = Number(req.minReferences) || minRefs;
    }
  } catch {
    /* defaults */
  }
  await runner.query(
    `UPDATE marketplace_articles SET
       required_word_count = $2,
       required_references_count = $3,
       updated_at = NOW()
     WHERE id = $1`,
    [row.id, minWords, minRefs],
  );
  return { ...row, required_word_count: minWords, required_references_count: minRefs };
}

function assertDraftReleasable(row, { requireBildazo = true } = {}) {
  if (!row) {
    throw createAppError(OZ03_EMPTY_INVENTORY_AR, 404, {
      exposeToClient: true,
      publicCode: "ARTICLE_NOT_FOUND",
    });
  }
  if (String(row.status).toLowerCase() === "published") {
    return { alreadyPublished: true };
  }
  if (String(row.status).toLowerCase() !== "draft") {
    throw createAppError("المقال ليس في حالة مسودة جاهزة للإنزال.", 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.RELEASE_BLOCKED,
      skipReason: "not_draft",
    });
  }
  if (!String(row.title || "").trim()) {
    throw createAppError("عنوان المقال مطلوب قبل الإنزال.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ARTICLE_TITLE",
    });
  }
  if (!(Number(row.article_level) >= 1)) {
    throw createAppError("مستوى/خطة المقال غير محددة.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ARTICLE_LEVEL",
    });
  }
  if (requireBildazo) {
    if (!String(row.writing_mode || "").trim()) {
      throw createAppError("نمط الكتابة مطلوب قبل الإنزال.", 400, {
        exposeToClient: true,
        publicCode: "ARTICLE_WRITING_MODE_REQUIRED",
      });
    }
    if (!String(row.bildazo_category_id || "").trim()) {
      throw createAppError("صنف بلدازو مطلوب قبل الإنزال.", 400, {
        exposeToClient: true,
        publicCode: "ARTICLE_BILDAZO_CATEGORY_REQUIRED",
      });
    }
  }
  return { alreadyPublished: false };
}

function scaleSharesFromAllocation(allocation, articleValueMillis) {
  const defaults =
    FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[allocation?.planTierCode] ||
    FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS.starter;
  const totalRaw = allocation?.totalArticleValueJod ?? defaults.totalArticleValueJod;
  const freRaw = allocation?.freelancerShareJod ?? defaults.freelancerShareJod;
  const coRaw = allocation?.companyShareJod ?? defaults.companyShareJod;
  const revRaw = allocation?.reviewerShareJod ?? defaults.reviewerShareJod;
  const totalMillis = articleOps.parseMoney(totalRaw, "total article value");
  if (totalMillis <= 0 || articleValueMillis <= 0) {
    const fre = Math.floor(articleValueMillis * 0.5);
    const co = Math.floor(articleValueMillis * 0.3);
    return articleOps.assertShareSplit({
      totalArticleValueJod: millisToJodString(articleValueMillis),
      freelancerShareJod: millisToJodString(fre),
      companyShareJod: millisToJodString(co),
      reviewerShareJod: millisToJodString(articleValueMillis - fre - co),
    });
  }
  const fre = Math.floor((articleOps.parseMoney(freRaw, "freelancer") * articleValueMillis) / totalMillis);
  const co = Math.floor((articleOps.parseMoney(coRaw, "company") * articleValueMillis) / totalMillis);
  const rev = articleValueMillis - fre - co;
  return articleOps.assertShareSplit({
    totalArticleValueJod: millisToJodString(articleValueMillis),
    freelancerShareJod: millisToJodString(fre),
    companyShareJod: millisToJodString(co),
    reviewerShareJod: millisToJodString(Math.max(0, rev)),
  });
}

async function releaseMarketplaceDraftArticle(
  articleId,
  {
    campaignId,
    waveId = null,
    allocation = null,
    actorUserId = null,
    client = null,
    requireBildazo = true,
    visibilityDurationHours = null,
  } = {},
) {
  const own = !client;
  const runner = client || (await pool.connect());
  const id = Number(articleId);
  if (!Number.isInteger(id) || id < 1) {
    throw createAppError(OZ03_EMPTY_INVENTORY_AR, 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.INVENTORY_EMPTY,
    });
  }
  const cid = campaignId != null ? Number(campaignId) : null;

  try {
    if (own) await runner.query("BEGIN");

    const { rows: lockedRows } = await runner.query(
      `SELECT * FROM marketplace_articles WHERE id = $1 FOR UPDATE`,
      [id],
    );
    let row = lockedRows[0];
    if (!row) {
      throw createAppError(OZ03_EMPTY_INVENTORY_AR, 404, {
        exposeToClient: true,
        publicCode: "ARTICLE_NOT_FOUND",
      });
    }

    const gate = assertDraftReleasable(row, { requireBildazo });
    const existingDeduction = await findFundDeductionForArticle(runner, id);

    if (gate.alreadyPublished) {
      if (own) await runner.query("COMMIT");
      const article = await marketplaceArticlesService.getMarketplaceArticleById(id, { forAdmin: true });
      return {
        schemaReady: true,
        idempotent: true,
        alreadyPublished: true,
        fundDeducted: false,
        article,
        fundEntryId: existingDeduction?.id != null ? Number(existingDeduction.id) : null,
        messageAr: "المقال منشور مسبقاً. لم يتم خصم الصندوق مرة أخرى.",
      };
    }

    row = await ensureWordsRefsOnDraft(runner, row);
    if (!(Number(row.required_word_count) > 0)) {
      throw createAppError("عدد الكلمات المطلوب غير محدد للمقال.", 400, {
        exposeToClient: true,
        publicCode: "ARTICLE_WORDS_REQUIRED",
      });
    }

    const valueMillis = articleOps.parseMoney(row.article_value_jod, "article value");
    if (valueMillis <= 0) {
      throw createAppError("قيمة المقال غير صالحة للإنزال.", 400, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INVALID_FUND_AMOUNT,
      });
    }

    if (!existingDeduction) {
      const balance = await articleOps.computeFundBalanceMillis(runner, {
        campaignId: cid || null,
      });
      if (valueMillis > balance) {
        throw createAppError(OZ03_INSUFFICIENT_FUND_AR, 409, {
          exposeToClient: true,
          publicCode: FREELANCER_ACTIVATION_A91_ERROR_CODES.INSUFFICIENT_FUND,
        });
      }
    }

    const tierCode = planTierFromArticleRow(row);
    const shares = scaleSharesFromAllocation(
      allocation || {
        planTierCode: tierCode,
        totalArticleValueJod: millisToJodString(valueMillis),
        freelancerShareJod: FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[tierCode]?.freelancerShareJod,
        companyShareJod: FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[tierCode]?.companyShareJod,
        reviewerShareJod: FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS[tierCode]?.reviewerShareJod,
      },
      valueMillis,
    );

    const hoursFromArticle = (() => {
      try {
        const oz05 = require("../utils/marketplaceArticleOz05BidSettings");
        return oz05.readBidCollectionDurationHours(row.keywords, visibilityDurationHours);
      } catch {
        return normalizeVisibilityDurationHours(visibilityDurationHours);
      }
    })();
    let deadlineIso = null;
    if (typeof opportunityBidCollectionService.resolveInventoryReleaseBidCollectionDeadline === "function") {
      deadlineIso = opportunityBidCollectionService.resolveInventoryReleaseBidCollectionDeadline({
        visibilityDurationHours: hoursFromArticle,
        now: new Date(),
        // Inventory release always snapshots a fresh deadline from duration hours.
        // Absolute draft deadlines are ignored so duration edits apply on next release.
        explicitDeadline: null,
      });
    }

    // Prefer per-article inventory setting over plan allocation default.
    const minBidders =
      Number(row.required_bid_count) ||
      Number(allocation?.minimumBiddersPerArticle) ||
      10;

    const { rowCount } = await runner.query(
      `UPDATE marketplace_articles SET
         status = 'published',
         published_at = COALESCE(published_at, NOW()),
         closed_at = NULL,
         cancelled_at = NULL,
         activation_campaign_id = COALESCE($2::bigint, activation_campaign_id),
         activation_wave_id = COALESCE($3::bigint, activation_wave_id),
         activation_plan_tier_code = COALESCE(NULLIF(TRIM(activation_plan_tier_code), ''), $4),
         activation_freelancer_share_jod = $5::numeric,
         activation_company_share_jod = $6::numeric,
         activation_reviewer_share_jod = $7::numeric,
         required_bid_count = $8,
         application_deadline_at = $9::timestamptz,
         updated_by_user_id = COALESCE($10::bigint, updated_by_user_id),
         updated_at = NOW()
       WHERE id = $1 AND status = 'draft'`,
      [
        id,
        cid,
        waveId != null ? Number(waveId) : null,
        tierCode,
        shares.freelancerShareJod,
        shares.companyShareJod,
        shares.reviewerShareJod,
        minBidders,
        deadlineIso,
        actorUserId != null ? Number(actorUserId) : null,
      ],
    );

    if (!rowCount) {
      throw createAppError("تعذر إنزال المقال (تغيّرت حالته).", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.RELEASE_BLOCKED,
      });
    }

    try {
      await runner.query("SAVEPOINT oz03_bid_round");
      await opportunityBidCollectionService.createInitialArticleRound(id, minBidders, deadlineIso, {
        client: runner,
      });
      await runner.query("RELEASE SAVEPOINT oz03_bid_round");
    } catch (roundErr) {
      try {
        await runner.query("ROLLBACK TO SAVEPOINT oz03_bid_round");
      } catch {
        /* ignore */
      }
      // Missing schema OR round already exists for this article (retry / partial prior run).
      if (
        roundErr?.code !== "42P01" &&
        roundErr?.code !== "42703" &&
        roundErr?.code !== "23505"
      ) {
        throw roundErr;
      }
    }

    let fundEntry = null;
    let fundDeducted = false;
    if (!existingDeduction) {
      fundEntry = await articleOps.recordArticleFundDailyAllocation(runner, {
        campaignId: cid,
        waveId: waveId != null ? Number(waveId) : null,
        amountJod: millisToJodString(valueMillis),
        reason: "oz03_marketplace_draft_release",
        metadata: {
          oz03: true,
          marketplaceArticleId: String(id),
          oz03ArticleId: String(id),
          planTierCode: tierCode,
        },
        actorUserId,
      });
      fundDeducted = Boolean(fundEntry);
    }

    if (own) await runner.query("COMMIT");

    const article = await marketplaceArticlesService.getMarketplaceArticleById(id, { forAdmin: true });
    return {
      schemaReady: true,
      idempotent: Boolean(existingDeduction) && !fundDeducted,
      alreadyPublished: false,
      fundDeducted,
      article,
      fundEntryId:
        fundEntry?.id != null
          ? Number(fundEntry.id)
          : existingDeduction?.id != null
            ? Number(existingDeduction.id)
            : null,
      messageAr: "تم إنزال المقال من المخزون.",
    };
  } catch (err) {
    if (own) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (own) runner.release();
  }
}

async function loadAllocationForTier(campaignId, planTierCode, runner) {
  try {
    const data = await articleOps.listPlanAllocations(Number(campaignId), { client: runner || undefined,
     });
    const items = Array.isArray(data) ? data : data?.allocations || [];
    const tier = normalizePlanTierCode(planTierCode);
    return (
      items.find((a) => Boolean(a.isEnabled) && normalizePlanTierCode(a.planTierCode) === tier) ||
      null
    );
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

function computeCapacity({ allocation, fundBalanceMillis, unitMillis }) {
  const maxByCount =
    allocation?.maxDailyArticles != null ? Number(allocation.maxDailyArticles) : 999;
  let maxByBudget = 999;
  if (allocation?.dailyBudgetJod != null) {
    const budgetMillis = articleOps.parseMoney(allocation.dailyBudgetJod, "daily budget");
    maxByBudget = unitMillis > 0 ? Math.floor(budgetMillis / unitMillis) : 0;
  }
  const maxByFund = unitMillis > 0 ? Math.floor(fundBalanceMillis / unitMillis) : 0;
  const remainingCapacity = Math.max(0, Math.min(maxByCount, maxByBudget, maxByFund));
  return { remainingCapacity, maxByCount, maxByBudget, maxByFund };
}

async function planTierRelease(runner, allocation, {
  runDate,
  includeManualMode = true,
  bypassInterval = false,
  remainingFundMillis,
} = {}) {
  const skipBase = {
    allocationId: allocation.id,
    planTierCode: allocation.planTierCode,
    items: [],
    plannedCount: 0,
    plannedValueJod: "0.000",
    skipped: true,
    skipReason: null,
    messageAr: null,
    releaseIntervalDays: normalizeReleaseIntervalDays(allocation.releaseIntervalDays),
  };

  if (!allocation.isEnabled) return { ...skipBase, skipReason: "allocation_disabled" };
  if (allocation.releaseMode === "manual" && !includeManualMode) {
    return { ...skipBase, skipReason: "manual_mode_skipped" };
  }

  const intervalDays = normalizeReleaseIntervalDays(allocation.releaseIntervalDays);
  if (!bypassInterval && allocation.releaseMode === "daily_auto" && intervalDays > 1) {
    const anchorRaw = allocation.createdAt || null;
    const anchorDate = anchorRaw ? String(anchorRaw).slice(0, 10) : runDate;
    if (!isReleaseDayForInterval({ runDate, intervalDays, anchorDate })) {
      return { ...skipBase, skipReason: "not_release_day", messageAr: NOT_RELEASE_DAY_MESSAGE_AR };
    }
  }

  const drafts = await listEligibleDraftArticles({
    planTierCode: allocation.planTierCode,
    limit: 100,
    client: runner,
  });

  if (!drafts.length) {
    return { ...skipBase, skipReason: "inventory_empty", messageAr: OZ03_EMPTY_INVENTORY_AR };
  }

  const unitMillis = articleOps.parseMoney(
    drafts[0].article_value_jod || allocation.totalArticleValueJod,
    "article value",
  );
  const fundMillis =
    remainingFundMillis != null
      ? remainingFundMillis
      : await articleOps.computeFundBalanceMillis(runner, { campaignId: allocation.campaignId });

  const capacity = computeCapacity({
    allocation,
    fundBalanceMillis: fundMillis,
    unitMillis: unitMillis > 0 ? unitMillis : 1,
  });

  if (capacity.remainingCapacity <= 0) {
    return {
      ...skipBase,
      skipReason: fundMillis <= 0 ? "insufficient_fund" : "capacity_exhausted",
      messageAr: fundMillis <= 0 ? OZ03_INSUFFICIENT_FUND_AR : null,
      capacity,
    };
  }

  const planned = [];
  let plannedValue = 0;
  for (const row of drafts) {
    if (planned.length >= capacity.remainingCapacity) break;
    const v = articleOps.parseMoney(row.article_value_jod, "article value");
    if (plannedValue + v > fundMillis) break;
    try {
      assertDraftReleasable(row, { requireBildazo: true });
    } catch {
      continue;
    }
    planned.push(row);
    plannedValue += v;
  }

  if (!planned.length) {
    return {
      ...skipBase,
      skipReason: fundMillis <= 0 ? "insufficient_fund" : "inventory_empty",
      messageAr: fundMillis <= 0 ? OZ03_INSUFFICIENT_FUND_AR : OZ03_EMPTY_INVENTORY_AR,
      capacity,
    };
  }

  return {
    allocationId: allocation.id,
    planTierCode: allocation.planTierCode,
    items: planned.map(mapArticleBrief),
    plannedCount: planned.length,
    plannedValueJod: millisToJodString(plannedValue),
    skipped: false,
    skipReason: null,
    capacity,
    _rows: planned,
    allocation,
  };
}

async function previewMarketplaceInventoryRelease({
  campaignId,
  waveId = null,
  planTierCode = null,
  date = null,
  includeManualMode = true,
} = {}) {
  const runDate = toDateOnly(date);
  const cid = Number(campaignId);
  const runner = await pool.connect();
  try {
    const data = await articleOps.listPlanAllocations(cid, { client: runner  });
    let allocations = Array.isArray(data) ? data : data?.allocations || [];
    if (planTierCode) {
      const tier = normalizePlanTierCode(planTierCode);
      allocations = allocations.filter((a) => normalizePlanTierCode(a.planTierCode) === tier);
    }
    if (waveId != null) {
      allocations = allocations.filter((a) => a.waveId == null || Number(a.waveId) === Number(waveId));
    }

    let remainingFund = await articleOps.computeFundBalanceMillis(runner, { campaignId: cid });
    const plans = [];
    for (const alloc of allocations) {
      const plan = await planTierRelease(runner, alloc, {
        runDate,
        includeManualMode,
        bypassInterval: true,
        remainingFundMillis: remainingFund,
      });
      plans.push(plan);
      if (!plan.skipped && plan.plannedValueJod) {
        remainingFund -= articleOps.parseMoney(plan.plannedValueJod, "planned");
      }
    }

    const plannedTotal = plans.reduce((n, p) => n + (p.plannedCount || 0), 0);
    return {
      schemaReady: true,
      oz03: true,
      inventorySource: "marketplace_articles",
      dryRun: true,
      runDate,
      plannedTotal,
      fundBalanceJod: millisToJodString(
        await articleOps.computeFundBalanceMillis(runner, { campaignId: cid }),
      ),
      plans,
      messageAr:
        plannedTotal > 0
          ? null
          : plans.some((p) => p.skipReason === "insufficient_fund")
            ? OZ03_INSUFFICIENT_FUND_AR
            : OZ03_EMPTY_INVENTORY_AR,
    };
  } finally {
    runner.release();
  }
}

async function runMarketplaceInventoryRelease({
  campaignId,
  waveId = null,
  planTierCode = null,
  date = null,
  actorUserId = null,
  force = false,
  runType = "manual",
} = {}) {
  const runDate = toDateOnly(date);
  const cid = Number(campaignId);
  const effectiveRunType = runType === "daily_auto" ? "daily_auto" : "manual";
  const includeManualMode = effectiveRunType === "manual";
  const bypassInterval = includeManualMode;
  const releaseEngine = require("./freelancerActivationArticleReleaseEngineService");

  if (!Number.isInteger(cid) || cid < 1) {
    throw createAppError("campaignId is required.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.RELEASE_BLOCKED,
    });
  }

  const runner = await pool.connect();
  try {
    await runner.query("BEGIN");

    if (!force) {
      const existing = await releaseEngine.findCompletedIdempotentRun(runner, {
        campaignId: cid,
        waveId,
        planTierCode: planTierCode ? normalizePlanTierCode(planTierCode) : null,
        runDate,
        runType: effectiveRunType,
      });
      if (existing) {
        await runner.query("COMMIT");
        return {
          schemaReady: true,
          oz03: true,
          inventorySource: "marketplace_articles",
          idempotent: true,
          run: releaseEngine.mapReleaseRun(existing),
          items: [],
          messageAr: "تم تشغيل الإنزال مسبقًا لهذا اليوم/الباقة. استخدم force لإعادة التشغيل.",
        };
      }
    }

    const data = await articleOps.listPlanAllocations(cid, { client: runner  });
    let allocations = Array.isArray(data) ? data : data?.allocations || [];
    if (planTierCode) {
      const tier = normalizePlanTierCode(planTierCode);
      allocations = allocations.filter((a) => normalizePlanTierCode(a.planTierCode) === tier);
    }

    const runRow = await releaseEngine.insertReleaseRun(runner, {
      campaignId: cid,
      waveId,
      planTierCode: planTierCode ? normalizePlanTierCode(planTierCode) : null,
      runDate,
      runType: effectiveRunType,
      status: "preview",
      actorUserId,
      metadata: { force: Boolean(force), phase: "OZ03", inventorySource: "marketplace_articles" },
    });

    let remainingFund = await articleOps.computeFundBalanceMillis(runner, { campaignId: cid });
    const releasedArticles = [];
    const itemRows = [];
    let totalValueMillis = 0;
    let releasedCount = 0;
    const allocationSummaries = [];

    for (const alloc of allocations) {
      const plan = await planTierRelease(runner, alloc, {
        runDate,
        includeManualMode,
        bypassInterval,
        remainingFundMillis: remainingFund,
      });

      if (plan.skipped) {
        allocationSummaries.push({
          allocationId: plan.allocationId,
          planTierCode: plan.planTierCode,
          skipReason: plan.skipReason,
          plannedCount: 0,
          messageAr: plan.messageAr || null,
        });
        if (plan.skipReason) {
          const skip = await releaseEngine.insertReleaseItem(runner, {
            runId: runRow.id,
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: alloc.totalArticleValueJod,
            freelancerShareJod: alloc.freelancerShareJod,
            companyShareJod: alloc.companyShareJod,
            reviewerShareJod: alloc.reviewerShareJod,
            status: "skipped",
            skipReason: plan.skipReason,
            metadata: { oz03: true, allocationId: alloc.id },
          });
          itemRows.push(releaseEngine.mapReleaseItem(skip));
        }
        continue;
      }

      for (const row of plan._rows || []) {
        const valueMillis = articleOps.parseMoney(row.article_value_jod, "article value");
        if (valueMillis > remainingFund) {
          const skip = await releaseEngine.insertReleaseItem(runner, {
            runId: runRow.id,
            marketplaceArticleId: row.id,
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: String(row.article_value_jod),
            freelancerShareJod: alloc.freelancerShareJod,
            companyShareJod: alloc.companyShareJod,
            reviewerShareJod: alloc.reviewerShareJod,
            status: "skipped",
            skipReason: "insufficient_fund",
            metadata: { oz03: true },
          });
          itemRows.push(releaseEngine.mapReleaseItem(skip));
          continue;
        }

        const sp = `oz03_rel_${Number(row.id)}`;
        try {
          await runner.query(`SAVEPOINT ${sp}`);
          const result = await releaseMarketplaceDraftArticle(row.id, {
            campaignId: cid,
            waveId: alloc.waveId ?? waveId,
            allocation: alloc,
            actorUserId,
            client: runner,
            requireBildazo: true,
          });

          if (result.fundDeducted) {
            remainingFund -= valueMillis;
            totalValueMillis += valueMillis;
          }
          if (result.article && !result.alreadyPublished) {
            releasedCount += 1;
            releasedArticles.push(result.article);
          } else if (result.alreadyPublished && result.article) {
            releasedArticles.push(result.article);
          }

          await runner.query(`RELEASE SAVEPOINT ${sp}`);

          const line = await releaseEngine.insertReleaseItem(runner, {
            runId: runRow.id,
            marketplaceArticleId: Number(row.id),
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: String(row.article_value_jod),
            freelancerShareJod: alloc.freelancerShareJod,
            companyShareJod: alloc.companyShareJod,
            reviewerShareJod: alloc.reviewerShareJod,
            status: "released",
            metadata: {
              oz03: true,
              fundEntryId: result.fundEntryId,
              idempotent: Boolean(result.idempotent),
            },
          });
          itemRows.push(releaseEngine.mapReleaseItem(line));
        } catch (err) {
          try {
            await runner.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          } catch {
            /* ignore */
          }
          const skipReason =
            err?.publicCode === FREELANCER_ACTIVATION_A91_ERROR_CODES.INSUFFICIENT_FUND
              ? "insufficient_fund"
              : err?.publicCode || "release_failed";
          const skip = await releaseEngine.insertReleaseItem(runner, {
            runId: runRow.id,
            marketplaceArticleId: row.id,
            planTierCode: alloc.planTierCode,
            totalArticleValueJod: String(row.article_value_jod),
            freelancerShareJod: alloc.freelancerShareJod,
            companyShareJod: alloc.companyShareJod,
            reviewerShareJod: alloc.reviewerShareJod,
            status: "skipped",
            skipReason: String(skipReason),
            metadata: { oz03: true, message: err?.message || null },
          });
          itemRows.push(releaseEngine.mapReleaseItem(skip));
        }
      }

      allocationSummaries.push({
        allocationId: plan.allocationId,
        planTierCode: plan.planTierCode,
        plannedCount: plan.plannedCount,
        capacity: plan.capacity,
        skipReason: null,
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
          oz03: true,
          inventorySource: "marketplace_articles",
        }),
      ],
    );

    await runner.query("COMMIT");

    return {
      schemaReady: true,
      oz03: true,
      inventorySource: "marketplace_articles",
      idempotent: false,
      dryRun: false,
      run: releaseEngine.mapReleaseRun(updatedRuns[0]),
      items: itemRows,
      articles: releasedArticles,
      allocationSummaries,
      messageAr:
        releasedCount > 0
          ? "تم إنزال مقالات المخزون."
          : allocationSummaries.some((s) => s.skipReason === "insufficient_fund")
            ? OZ03_INSUFFICIENT_FUND_AR
            : OZ03_EMPTY_INVENTORY_AR,
      noteAr:
        "OZ03: إنزال من marketplace_articles (draft→published) على نفس الصف مع خصم صندوق لكل مقال مرة واحدة.",
    };
  } catch (err) {
    try {
      await runner.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    runner.release();
  }
}

async function releaseMarketplaceDraftsManual(ids, { campaignId, actorUserId = null } = {}) {
  const list = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!list.length) {
    throw createAppError(OZ03_EMPTY_INVENTORY_AR, 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_A92_ERROR_CODES.INVENTORY_EMPTY,
    });
  }

  const results = [];
  for (const id of list) {
    const { rows } = await pool.query(`SELECT * FROM marketplace_articles WHERE id = $1`, [id]);
    const row = rows[0];
    const tier = row ? planTierFromArticleRow(row) : "starter";
    const allocation = campaignId ? await loadAllocationForTier(campaignId, tier, null) : null;
    const out = await releaseMarketplaceDraftArticle(id, {
      campaignId,
      allocation,
      actorUserId,
      requireBildazo: true,
    });
    results.push(out);
  }
  return {
    schemaReady: true,
    oz03: true,
    inventorySource: "marketplace_articles",
    results,
    releasedCount: results.filter((r) => r.article && (r.fundDeducted || !r.alreadyPublished)).length,
  };
}

module.exports = {
  OZ03_EMPTY_INVENTORY_AR,
  OZ03_INSUFFICIENT_FUND_AR,
  countDraftInventoryArticles,
  countPublishedReleasedArticles,
  listEligibleDraftArticles,
  findFundDeductionForArticle,
  releaseMarketplaceDraftArticle,
  releaseMarketplaceDraftsManual,
  previewMarketplaceInventoryRelease,
  runMarketplaceInventoryRelease,
  planTierFromArticleRow,
  mapArticleBrief,
  assertDraftReleasable,
  ensureWordsRefsOnDraft,
  loadAllocationForTier,
};

