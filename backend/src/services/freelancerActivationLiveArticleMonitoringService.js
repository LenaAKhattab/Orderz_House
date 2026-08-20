/**
 * Phase A9.4 — Live released Mini Article monitoring for Super Admin.
 * Read-mostly aggregate over existing A9.1–A9.3 / A4.2 / manuscript / Bildazo data.
 * No new economics. No cron. No wallet/claims/Stripe.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const campaignService = require("./freelancerActivationCampaignService");
const autoAssign = require("./freelancerActivationAutoAssignmentService");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function emptySummary() {
  return {
    totalReleased: 0,
    waitingForBidders: 0,
    readyForAssignment: 0,
    autoAssigned: 0,
    submitted: 0,
    underReview: 0,
    accepted: 0,
    published: 0,
    budgetReserved: 0,
    budgetUsed: 0,
    blockedOrPaused: 0,
  };
}

function adminDisplayName(row) {
  const first = String(row?.first_name || row?.freelancer_first_name || "").trim();
  const family = String(row?.family_name || row?.freelancer_family_name || "").trim();
  const combined = `${first} ${family}`.trim();
  if (combined) return combined;
  if (row?.account_id) return String(row.account_id);
  if (row?.freelancer_user_id != null) return `user:${row.freelancer_user_id}`;
  return null;
}

function resolveAutoAssignStatus({ article, readiness, latestRun, hasSelected }) {
  if (latestRun?.status === "completed" || (hasSelected && latestRun?.autoAssignedBadge)) {
    return "completed";
  }
  if (latestRun?.status === "failed") return "failed";
  if (latestRun?.status === "skipped") return "skipped";
  if (!autoAssign.isAutoAssignEnabledOnArticle(article)) return "disabled";
  if (readiness?.status === "ready" || readiness?.ready) return "ready";
  if (readiness?.status === "waiting_for_bidders" || readiness?.skipReason === "below_min_bidders") {
    return "waiting_for_bidders";
  }
  if (readiness?.status === "auto-assigned" || hasSelected) return "completed";
  if (readiness?.status === "skipped") return "skipped";
  return readiness?.status || "disabled";
}

function buildActionFlags({
  article,
  autoAssignStatus,
  hasSelected,
  manuscriptStatus,
  bildazoCanRetry,
  inventoryItemId,
  campaignStatus,
}) {
  const published = String(article.status) === "published";
  return {
    canRunAutoAssignment:
      published &&
      !hasSelected &&
      (autoAssignStatus === "ready" || autoAssignStatus === "waiting_for_bidders" || autoAssignStatus === "skipped"),
    canViewApplications: true,
    canOpenArticle: true,
    canCancelArticle: published || String(article.status) === "draft",
    canRequestRevision: manuscriptStatus === "submitted",
    canApprove: manuscriptStatus === "submitted",
    canReject: !hasSelected || manuscriptStatus === "submitted" || manuscriptStatus === "revision_requested",
    canRetryBildazoPublish: Boolean(bildazoCanRetry),
    canReleaseAnotherFromInventory: inventoryItemId != null,
    canPauseCampaign: Boolean(article.activation_campaign_id) && campaignStatus !== "paused",
    canEmergencyStopCampaign: Boolean(article.activation_campaign_id),
  };
}

async function loadLiveArticleRows(runner, {
  campaignId = null,
  waveId = null,
  planTierCode = null,
  status = null,
  dateFrom = null,
  dateTo = null,
  search = null,
  limit = 25,
  offset = 0,
} = {}) {
  const params = [];
  const where = [`a.activation_campaign_id IS NOT NULL`];

  if (campaignId != null && campaignId !== "") {
    params.push(Number(campaignId));
    where.push(`a.activation_campaign_id = $${params.length}`);
  }
  if (waveId != null && waveId !== "") {
    params.push(Number(waveId));
    where.push(`a.activation_wave_id = $${params.length}`);
  }
  if (planTierCode) {
    params.push(String(planTierCode).toLowerCase());
    where.push(`LOWER(COALESCE(a.activation_plan_tier_code, '')) = $${params.length}`);
  }
  if (status) {
    params.push(String(status));
    where.push(`a.status = $${params.length}`);
  }
  if (dateFrom) {
    params.push(String(dateFrom));
    where.push(`(a.published_at AT TIME ZONE 'UTC')::date >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(String(dateTo));
    where.push(`(a.published_at AT TIME ZONE 'UTC')::date <= $${params.length}::date`);
  }
  if (search) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(a.title ILIKE $${params.length} OR COALESCE(a.description, '') ILIKE $${params.length})`);
  }

  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);

  const sql = `
    SELECT
      a.id,
      a.title,
      a.description,
      a.status,
      a.published_at,
      a.created_at,
      a.application_deadline_at,
      a.required_bid_count,
      a.article_value_jod,
      a.activation_campaign_id,
      a.activation_wave_id,
      a.activation_plan_tier_code,
      a.activation_freelancer_share_jod,
      a.activation_company_share_jod,
      a.activation_reviewer_share_jod,
      a.activation_inventory_item_id,
      a.activation_auto_assign_enabled,
      a.activation_auto_assign_mode,
      a.activation_auto_assign_when_min_bidders_reached,
      a.category_id,
      a.subcategory_id,
      c.name AS campaign_name,
      c.status AS campaign_status,
      c.emergency_stop_enabled,
      c.pause_new_assignments,
      w.name AS wave_name,
      w.status AS wave_status,
      inv.title AS inventory_title,
      cat.name AS category_name,
      sub.name AS subcategory_name
    FROM marketplace_articles a
    LEFT JOIN freelancer_activation_campaigns c ON c.id = a.activation_campaign_id
    LEFT JOIN freelancer_activation_waves w ON w.id = a.activation_wave_id
    LEFT JOIN freelancer_activation_article_inventory_items inv ON inv.id = a.activation_inventory_item_id
      LEFT JOIN categories cat ON cat.id = a.category_id
      LEFT JOIN subcategories sub ON sub.id = a.subcategory_id
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

  const countParams = params.slice(0, -2);
  const countSql = `
    SELECT COUNT(*)::int AS cnt
    FROM marketplace_articles a
    WHERE ${where.join(" AND ")}
  `;

  const [{ rows }, countRes] = await Promise.all([
    runner.query(sql, params),
    runner.query(countSql, countParams),
  ]);

  return {
    rows,
    total: toInt(countRes.rows[0]?.cnt, 0),
    limit: lim,
    offset: off,
  };
}

async function loadApplicationAggregates(runner, articleIds) {
  const ids = [...new Set((articleIds || []).map(Number).filter((n) => n >= 1))];
  const map = new Map();
  for (const id of ids) {
    map.set(id, {
      currentApplicationsCount: 0,
      qualifiedApplicationsCount: 0,
      selectedApplicationId: null,
      selectedFreelancerUserId: null,
      selectedFreelancerDisplayName: null,
      applicationStatusSummary: {
        pending: 0,
        selected: 0,
        rejected: 0,
        submitted: 0,
        revision_requested: 0,
        approved: 0,
        cancelled: 0,
      },
      budgetState: "not_reserved",
      budgetAmountJod: null,
      manuscriptSubmitted: false,
      termsAccepted: false,
      reviewStatus: null,
      revisionRequested: false,
      acceptedAt: null,
      rejectedAt: null,
      settlementStatus: null,
      earnedBalanceRecorded: false,
    });
  }
  if (!ids.length) return map;

  try {
    const { rows } = await runner.query(
      `SELECT
         app.article_id,
         app.id AS application_id,
         app.freelancer_user_id,
         app.status,
         app.activation_budget_reserved_at,
         app.activation_budget_released_at,
         app.activation_budget_used_at,
         app.activation_budget_amount_jod,
         app.selected_at,
         u.first_name,
         u.family_name,
         u.account_id,
         sub.id AS submission_id,
         sub.status AS submission_status,
         sub.terms_accepted,
         sub.submitted_at,
         sub.reviewed_at,
         sub.reviewed_by_user_id
       FROM marketplace_article_applications app
       LEFT JOIN users u ON u.id = app.freelancer_user_id
       LEFT JOIN marketplace_article_submissions sub ON sub.application_id = app.id
       WHERE app.article_id = ANY($1::bigint[])
       ORDER BY app.article_id, app.id ASC`,
      [ids],
    );

    for (const row of rows) {
      const aid = Number(row.article_id);
      const bucket = map.get(aid);
      if (!bucket) continue;
      bucket.currentApplicationsCount += 1;
      const st = String(row.status || "");
      if (bucket.applicationStatusSummary[st] != null) {
        bucket.applicationStatusSummary[st] += 1;
      }
      if (
        ["pending", "selected", "assigned", "writing", "submitted", "under_review", "revision_requested", "approved"].includes(
          st,
        )
      ) {
        bucket.qualifiedApplicationsCount += 1;
      }
      if (["selected", "assigned", "writing", "submitted", "under_review", "revision_requested", "approved"].includes(st)) {
        if (!bucket.selectedApplicationId) {
          bucket.selectedApplicationId = Number(row.application_id);
          bucket.selectedFreelancerUserId = Number(row.freelancer_user_id);
          bucket.selectedFreelancerDisplayName = adminDisplayName(row);
        }
      }
      if (row.submission_id) {
        bucket.manuscriptSubmitted = true;
        bucket.reviewStatus = row.submission_status || bucket.reviewStatus;
        bucket.termsAccepted = Boolean(row.terms_accepted) || bucket.termsAccepted;
        if (row.submission_status === "revision_requested") bucket.revisionRequested = true;
        if (row.submission_status === "approved") {
          bucket.acceptedAt = row.reviewed_at || bucket.acceptedAt;
        }
        if (row.submission_status === "rejected") {
          bucket.rejectedAt = row.reviewed_at || bucket.rejectedAt;
        }
        if (row.submission_status === "submitted") {
          bucket.reviewStatus = "submitted";
        }
      }
      const derived = campaignService.deriveActivationBudgetState(row);
      if (derived === "used") {
        bucket.budgetState = "used";
        bucket.budgetAmountJod =
          row.activation_budget_amount_jod != null
            ? String(row.activation_budget_amount_jod)
            : bucket.budgetAmountJod;
      } else if (derived === "released" && bucket.budgetState !== "used") {
        bucket.budgetState = "released";
        bucket.budgetAmountJod =
          row.activation_budget_amount_jod != null
            ? String(row.activation_budget_amount_jod)
            : bucket.budgetAmountJod;
      } else if (derived === "reserved" && !["used", "released"].includes(bucket.budgetState)) {
        bucket.budgetState = "reserved";
        bucket.budgetAmountJod =
          row.activation_budget_amount_jod != null
            ? String(row.activation_budget_amount_jod)
            : bucket.budgetAmountJod;
      }
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }

  // Best-effort settlement / earned marker via writer pending entries if schema exists
  try {
    const selectedIds = [...map.values()]
      .map((b) => b.selectedApplicationId)
      .filter((id) => id != null);
    if (selectedIds.length) {
      const { rows } = await runner.query(
        `SELECT reference_id::bigint AS application_id, status
           FROM financial_ledger_entries
          WHERE reference_type = 'marketplace_article_application'
            AND entry_type ILIKE '%writer%'
            AND reference_id = ANY($1::text[])
          LIMIT 500`,
        [selectedIds.map(String)],
      );
      for (const row of rows) {
        for (const [aid, bucket] of map.entries()) {
          if (Number(bucket.selectedApplicationId) === Number(row.application_id)) {
            bucket.settlementStatus = row.status || "recorded";
            bucket.earnedBalanceRecorded = true;
            map.set(aid, bucket);
          }
        }
      }
    }
  } catch {
    /* optional — do not fail monitoring */
  }

  return map;
}

async function loadBildazoByArticle(runner, articleIds) {
  const ids = [...new Set((articleIds || []).map(Number).filter((n) => n >= 1))];
  const map = new Map();
  if (!ids.length) return map;
  try {
    const { rows } = await runner.query(
      `SELECT DISTINCT ON (a.article_id)
          a.article_id,
          p.status,
          p.article_url,
          p.published_at,
          p.last_error
         FROM bildazo_article_publish_records p
         JOIN marketplace_article_applications a ON a.id = p.orderz_application_id
        WHERE a.article_id = ANY($1::bigint[])
        ORDER BY a.article_id, p.id DESC`,
      [ids],
    );
    for (const row of rows) {
      const status = String(row.status || "");
      map.set(Number(row.article_id), {
        bildazoPublishStatus: status || null,
        bildazoUrl: row.article_url || null,
        publishedAt: row.published_at || null,
        canRetry: ["pending", "failed", "needs_manual_review", "skipped"].includes(status),
      });
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }
  return map;
}

function mapLiveItem(articleRow, agg, bildazo, autoInfo) {
  const required = toInt(articleRow.required_bid_count, 10);
  const current = toInt(agg?.currentApplicationsCount, 0);
  const qualified = toInt(agg?.qualifiedApplicationsCount, current);
  const hasSelected = Boolean(agg?.selectedApplicationId);
  const autoAssignStatus = resolveAutoAssignStatus({
    article: articleRow,
    readiness: autoInfo?.readiness,
    latestRun: autoInfo,
    hasSelected,
  });
  const remaining = Math.max(0, required - qualified);
  const campaignBlocked =
    Boolean(articleRow.emergency_stop_enabled) ||
    Boolean(articleRow.pause_new_assignments) ||
    ["paused", "archived", "completed"].includes(String(articleRow.campaign_status || "")) ||
    ["paused", "archived", "completed"].includes(String(articleRow.wave_status || ""));

  const actions = buildActionFlags({
    article: articleRow,
    autoAssignStatus,
    hasSelected,
    manuscriptStatus: agg?.reviewStatus,
    bildazoCanRetry: Boolean(bildazo?.canRetry),
    inventoryItemId: articleRow.activation_inventory_item_id,
    campaignStatus: articleRow.campaign_status,
  });

  return {
    articleId: Number(articleRow.id),
    title: articleRow.title,
    status: articleRow.status,
    categoryId: articleRow.category_id != null ? Number(articleRow.category_id) : null,
    subcategoryId: articleRow.subcategory_id != null ? Number(articleRow.subcategory_id) : null,
    categoryName: articleRow.category_name || null,
    subcategoryName: articleRow.subcategory_name || null,
    createdAt: articleRow.created_at || null,
    releasedAt: articleRow.published_at || articleRow.created_at || null,
    deadline: articleRow.application_deadline_at || null,
    inventoryItemId:
      articleRow.activation_inventory_item_id != null
        ? Number(articleRow.activation_inventory_item_id)
        : null,
    inventoryTitle: articleRow.inventory_title || null,
    campaignId:
      articleRow.activation_campaign_id != null ? Number(articleRow.activation_campaign_id) : null,
    campaignName: articleRow.campaign_name || null,
    waveId: articleRow.activation_wave_id != null ? Number(articleRow.activation_wave_id) : null,
    waveName: articleRow.wave_name || null,
    planTierCode: articleRow.activation_plan_tier_code || null,
    totalArticleValueJod:
      articleRow.article_value_jod != null ? String(articleRow.article_value_jod) : null,
    freelancerShareJod:
      articleRow.activation_freelancer_share_jod != null
        ? String(articleRow.activation_freelancer_share_jod)
        : null,
    companyShareJod:
      articleRow.activation_company_share_jod != null
        ? String(articleRow.activation_company_share_jod)
        : null,
    reviewerShareJod:
      articleRow.activation_reviewer_share_jod != null
        ? String(articleRow.activation_reviewer_share_jod)
        : null,
    budgetState: agg?.budgetState || "not_reserved",
    budgetAmountJod: agg?.budgetAmountJod || null,
    requiredBidders: required,
    currentApplicationsCount: current,
    qualifiedApplicationsCount: qualified,
    remainingBiddersToAssign: remaining,
    selectedApplicationId: agg?.selectedApplicationId || null,
    selectedFreelancerUserId: agg?.selectedFreelancerUserId || null,
    selectedFreelancerDisplayName: agg?.selectedFreelancerDisplayName || null,
    applicationStatusSummary: agg?.applicationStatusSummary || null,
    autoAssignEnabled: Boolean(articleRow.activation_auto_assign_enabled),
    autoAssignMode: articleRow.activation_auto_assign_mode || "disabled",
    autoAssignStatus,
    lastAutoAssignmentRunId: autoInfo?.run?.id || null,
    lastAutoAssignmentSkipReason: autoInfo?.run?.skipReason || null,
    lastAutoAssignmentErrorCode: autoInfo?.run?.errorCode || null,
    selectedBySystem: Boolean(autoInfo?.autoAssignedBadge),
    manuscriptSubmitted: Boolean(agg?.manuscriptSubmitted),
    termsAccepted: Boolean(agg?.termsAccepted),
    reviewStatus: agg?.reviewStatus || null,
    revisionRequested: Boolean(agg?.revisionRequested),
    acceptedAt: agg?.acceptedAt || null,
    rejectedAt: agg?.rejectedAt || null,
    bildazoPublishStatus: bildazo?.bildazoPublishStatus || null,
    bildazoUrl: bildazo?.bildazoUrl || null,
    publishedAt: bildazo?.publishedAt || null,
    settlementStatus: agg?.settlementStatus || null,
    earnedBalanceRecorded: Boolean(agg?.earnedBalanceRecorded),
    campaignBlocked,
    actions,
    adminLinks: {
      articleEditPath: `/dashboard/super-admin/marketplace-articles?edit=${articleRow.id}`,
      applicationsHint: "Use marketplace articles page applications panel",
      campaignPath: articleRow.activation_campaign_id
        ? `/dashboard/super-admin/freelancer-activation`
        : null,
    },
  };
}

function accumulateSummary(summary, item) {
  summary.totalReleased += 1;
  if (item.autoAssignStatus === "waiting_for_bidders") summary.waitingForBidders += 1;
  if (item.autoAssignStatus === "ready") summary.readyForAssignment += 1;
  if (item.autoAssignStatus === "completed" || item.selectedBySystem) summary.autoAssigned += 1;
  if (item.reviewStatus === "submitted") summary.submitted += 1;
  if (item.reviewStatus === "revision_requested" || item.revisionRequested) summary.underReview += 1;
  if (item.reviewStatus === "approved" || item.acceptedAt) summary.accepted += 1;
  if (item.bildazoPublishStatus === "published" || item.bildazoPublishStatus === "already_imported") {
    summary.published += 1;
  }
  if (item.budgetState === "reserved") summary.budgetReserved += 1;
  if (item.budgetState === "used") summary.budgetUsed += 1;
  if (item.campaignBlocked) summary.blockedOrPaused += 1;
}

/**
 * List live activation Mini Articles for Super Admin monitoring.
 */
async function listLiveActivationArticles(filters = {}, { client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows, total, limit, offset } = await loadLiveArticleRows(runner, filters);
    const ids = rows.map((r) => Number(r.id));
    const [aggMap, bildazoMap] = await Promise.all([
      loadApplicationAggregates(runner, ids),
      loadBildazoByArticle(runner, ids),
    ]);

    const items = [];
    const summary = emptySummary();
    for (const row of rows) {
      let autoInfo = { schemaReady: false, run: null, candidates: [], readiness: null };
      try {
        autoInfo = await autoAssign.getLatestAutoAssignmentForArticle(row.id, { client: runner });
      } catch {
        /* ignore per-row */
      }
      const item = mapLiveItem(row, aggMap.get(Number(row.id)), bildazoMap.get(Number(row.id)), autoInfo);
      if (filters.autoAssignStatus && item.autoAssignStatus !== filters.autoAssignStatus) {
        continue;
      }
      items.push(item);
      accumulateSummary(summary, item);
    }

    // When filtering by autoAssignStatus client-side after hydrate, recompute total loosely
    const filteredTotal =
      filters.autoAssignStatus != null && filters.autoAssignStatus !== ""
        ? items.length
        : total;

    return {
      schemaReady: true,
      items,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit,
        offset,
        total: filteredTotal,
        hasMore: offset + limit < filteredTotal,
      },
      summary: filters.autoAssignStatus ? (() => {
        const s = emptySummary();
        for (const item of items) accumulateSummary(s, item);
        return s;
      })() : summary,
      noteAr:
        "متابعة المقالات المنزلة فقط — لا تُعرض أرصدة الصندوق أو أوزان التوزيع للمستقلين.",
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return {
        schemaReady: false,
        items: [],
        pagination: { page: 1, limit: 25, offset: 0, total: 0, hasMore: false },
        summary: emptySummary(),
      };
    }
    throw err;
  }
}

async function getLiveActivationArticle(articleId, { client = null } = {}) {
  const runner = client || pool;
  const aid = Number(articleId);
  if (!Number.isInteger(aid) || aid < 1) {
    throw createAppError("Invalid article id.", 400, {
      exposeToClient: true,
      publicCode: "ACTIVATION_LIVE_ARTICLE_INVALID_ID",
    });
  }
  const listed = await listLiveActivationArticles(
    { status: null, limit: 1, offset: 0 },
    { client: runner },
  );
  // Direct fetch
  try {
    const { rows } = await runner.query(
      `SELECT
         a.*,
         c.name AS campaign_name,
         c.status AS campaign_status,
         c.emergency_stop_enabled,
         c.pause_new_assignments,
         w.name AS wave_name,
         w.status AS wave_status,
         inv.title AS inventory_title,
         cat.name AS category_name,
         sub.name AS subcategory_name
       FROM marketplace_articles a
       LEFT JOIN freelancer_activation_campaigns c ON c.id = a.activation_campaign_id
       LEFT JOIN freelancer_activation_waves w ON w.id = a.activation_wave_id
       LEFT JOIN freelancer_activation_article_inventory_items inv ON inv.id = a.activation_inventory_item_id
       LEFT JOIN categories cat ON cat.id = a.category_id
       LEFT JOIN subcategories sub ON sub.id = a.subcategory_id
       WHERE a.id = $1 AND a.activation_campaign_id IS NOT NULL
       LIMIT 1`,
      [aid],
    );
    if (!rows[0]) {
      throw createAppError("Live activation article not found.", 404, {
        exposeToClient: true,
        publicCode: "ACTIVATION_LIVE_ARTICLE_NOT_FOUND",
      });
    }
    const [aggMap, bildazoMap, autoInfo] = await Promise.all([
      loadApplicationAggregates(runner, [aid]),
      loadBildazoByArticle(runner, [aid]),
      autoAssign.getLatestAutoAssignmentForArticle(aid, { client: runner }).catch(() => ({
        run: null,
        readiness: null,
        autoAssignedBadge: false,
        candidates: [],
      })),
    ]);
    const item = mapLiveItem(
      rows[0],
      aggMap.get(aid),
      bildazoMap.get(aid),
      autoInfo,
    );
    return {
      schemaReady: true,
      item,
      autoAssignment: autoInfo,
      noteAr: listed.noteAr,
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      throw createAppError("Live monitoring schema is not ready.", 503, {
        exposeToClient: true,
        publicCode: "ACTIVATION_LIVE_ARTICLE_SCHEMA_MISSING",
      });
    }
    throw err;
  }
}

async function runLiveArticleAutoAssignment(articleId, { actorUserId = null } = {}) {
  return autoAssign.runAutoAssignmentForArticle(articleId, {
    runType: "manual_admin_run",
    actorUserId,
  });
}

async function releaseAnotherFromInventory(inventoryItemId, { actorUserId = null } = {}) {
  const articleOps = require("./freelancerActivationArticleOpsService");
  return articleOps.releaseInventoryItem(inventoryItemId, { actorUserId });
}

module.exports = {
  listLiveActivationArticles,
  getLiveActivationArticle,
  runLiveArticleAutoAssignment,
  releaseAnotherFromInventory,
  emptySummary,
  resolveAutoAssignStatus,
  buildActionFlags,
};
