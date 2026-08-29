/**
 * Marketplace Articles — Phase A2 Level model service.
 * Dedicated domain (not orders). No Token movement, applications, capacity, or rounds.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  MARKETPLACE_ARTICLE_STATUSES,
  isValidMarketplaceArticleStatus,
  ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT,
  ARTICLE_WORK_TOKEN_MOVEMENT,
  ARTICLE_WORK_TOKEN_ENTRY,
  ARTICLE_HISTORICAL_BACKFILL,
  ARTICLE_LEVEL_WORD_REFERENCE_GLOBAL_MATRIX,
} = require("../constants/marketplaceArticles");
const articleApplicationsService = require("./marketplaceArticleApplicationsService");
const opportunityBidCollectionService = require("./opportunityBidCollectionService");
const { getMarketplaceEconomySettings } = require("./marketplaceEconomySettingsService");
const {
  assertArticleLevel,
  formatArticleValueJodForDb,
  assertArticleValueMatchesLevel,
  deriveArticleValueJodFromLevel,
} = require("../utils/marketplaceArticleValue");
const {
  assertBildazoInventoryFields,
  applyBildazoInventoryColumns,
  mapBildazoInventoryFromRow,
} = require("../utils/marketplaceArticleBildazoInventory");
const {
  normalizePackagePlanCode,
  articleLevelForPackagePlan,
  tierCodeForPackagePlan,
} = require("../constants/marketplaceArticleBildazoOz02");
const packageRequirementsService = require("./marketplaceArticlePackageRequirementsService");

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1";
}

/**
 * Prefer target plan package requirements over per-article words/refs/level.
 * Legacy payloads without targetPlanCode keep explicit fields.
 */
async function resolveArticleRequirementsFromPayload(payload, { existing = null } = {}) {
  const planCode = normalizePackagePlanCode(
    payload.targetPlanCode ??
      payload.target_plan_code ??
      payload.planCode ??
      payload.plan_code ??
      payload.activationPlanTierCode ??
      payload.activation_plan_tier_code,
  );

  if (planCode) {
    const req = await packageRequirementsService.getRequirementForPlan(planCode);
    const level = articleLevelForPackagePlan(planCode);
    return {
      planCode,
      tierCode: tierCodeForPackagePlan(planCode),
      articleLevel: assertArticleLevel(level),
      requiredWordCount: assertRequiredWordCount(req.minWords),
      requiredReferencesCount: assertRequiredReferencesCount(req.minReferences),
      derivedFromPlan: true,
    };
  }

  const articleLevel =
    payload.articleLevel !== undefined || payload.article_level !== undefined
      ? assertArticleLevel(payload.articleLevel ?? payload.article_level)
      : existing
        ? existing.articleLevel
        : null;
  if (articleLevel == null) {
    throw createAppError("targetPlanCode or articleLevel is required.", 400, {
      exposeToClient: true,
      publicCode: "ARTICLE_PLAN_OR_LEVEL_REQUIRED",
    });
  }

  const hasWords =
    payload.requiredWordCount !== undefined || payload.required_word_count !== undefined;
  const hasRefs =
    payload.requiredReferencesCount !== undefined ||
    payload.required_references_count !== undefined;

  return {
    planCode: null,
    tierCode: null,
    articleLevel,
    requiredWordCount: hasWords
      ? assertRequiredWordCount(payload.requiredWordCount ?? payload.required_word_count)
      : existing
        ? existing.requiredWordCount
        : assertRequiredWordCount(payload.requiredWordCount ?? payload.required_word_count),
    requiredReferencesCount: hasRefs
      ? assertRequiredReferencesCount(
          payload.requiredReferencesCount ?? payload.required_references_count,
        )
      : existing
        ? existing.requiredReferencesCount
        : assertRequiredReferencesCount(
            payload.requiredReferencesCount ?? payload.required_references_count ?? 0,
          ),
    derivedFromPlan: false,
  };
}

async function softSetActivationPlanTierCode(client, articleId, tierCode) {
  if (!tierCode || !articleId) return;
  try {
    await client.query(
      `UPDATE marketplace_articles
          SET activation_plan_tier_code = $2
        WHERE id = $1`,
      [articleId, tierCode],
    );
  } catch (err) {
    if (err?.code !== "42703") throw err;
  }
}

function toIdString(value) {
  if (value == null) return null;
  return String(value);
}

function toFiniteNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function assertRequiredWordCount(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw createAppError("required_word_count must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_REQUIRED_WORD_COUNT",
    });
  }
  return n;
}

function assertRequiredReferencesCount(value) {
  const n = value === undefined || value === null || value === "" ? 0 : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw createAppError("required_references_count must be an integer >= 0.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_REQUIRED_REFERENCES_COUNT",
    });
  }
  return n;
}

function assertStatus(value, { required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw createAppError("status is required.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_ARTICLE_STATUS",
      });
    }
    return null;
  }
  const status = String(value).trim().toLowerCase();
  if (!isValidMarketplaceArticleStatus(status)) {
    throw createAppError(
      `status must be one of: ${MARKETPLACE_ARTICLE_STATUSES.join(", ")}.`,
      400,
      { exposeToClient: true, publicCode: "INVALID_ARTICLE_STATUS" },
    );
  }
  return status;
}

function mapMarketplaceArticle(row) {
  if (!row) return null;
  const level = Number(row.article_level);
  return {
    id: toIdString(row.id),
    title: row.title,
    description: row.description || "",
    categoryId: toIdString(row.category_id),
    subcategoryId: toIdString(row.subcategory_id),
    category: row.category_name
      ? {
          id: toIdString(row.category_id),
          name: row.category_name,
          slug: row.category_slug || null,
        }
      : row.category_id != null
        ? { id: toIdString(row.category_id), name: null, slug: null }
        : null,
    subcategory: row.subcategory_name
      ? {
          id: toIdString(row.subcategory_id),
          name: row.subcategory_name,
          slug: row.subcategory_slug || null,
        }
      : row.subcategory_id != null
        ? { id: toIdString(row.subcategory_id), name: null, slug: null }
        : null,
    articleLevel: level,
    articleValueJod: toFiniteNumber(row.article_value_jod),
    freelancerShareJod: toFiniteNumber(row.activation_freelancer_share_jod),
    companyShareJod: toFiniteNumber(row.activation_company_share_jod),
    reviewerShareJod: toFiniteNumber(row.activation_reviewer_share_jod),
    totalArticleValueJod: toFiniteNumber(row.article_value_jod),
    activationPlanTierCode: row.activation_plan_tier_code || null,
    requiredWordCount: Number(row.required_word_count) || 0,
    requiredReferencesCount: Number(row.required_references_count) || 0,
    ...mapBildazoInventoryFromRow(row),
    status: row.status,
    isFakeOrTraining: isTruthyFlag(row.is_fake_or_training),
    createdByUserId: toIdString(row.created_by_user_id),
    updatedByUserId: toIdString(row.updated_by_user_id),
    publishedAt: row.published_at || null,
    closedAt: row.closed_at || null,
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    requiredBidCount: row.required_bid_count != null ? Number(row.required_bid_count) : null,
    currentBidCollectionRoundId:
      row.current_bid_collection_round_id != null
        ? String(row.current_bid_collection_round_id)
        : null,
    relistCount: row.relist_count != null ? Number(row.relist_count) : 0,
    bidCollectionOutcome: row.bid_collection_outcome || null,
    applicationDeadlineAt: row.application_deadline_at || null,
    activationCampaignId: toIdString(row.activation_campaign_id),
    activationWaveId: toIdString(row.activation_wave_id),
    activationBudgetState: row.activationBudgetState || null,
  };
}

/** Public/admin read model — no future Fair/Token/round fields. */
function mapMarketplaceArticleReadModel(row) {
  const full = mapMarketplaceArticle(row);
  if (!full) return null;
  return {
    id: full.id,
    title: full.title,
    description: full.description,
    articleLevel: full.articleLevel,
    articleValueJod: full.articleValueJod,
    totalArticleValueJod: full.totalArticleValueJod ?? full.articleValueJod,
    freelancerShareJod: full.freelancerShareJod,
    companyShareJod: full.companyShareJod,
    reviewerShareJod: full.reviewerShareJod,
    activationPlanTierCode: full.activationPlanTierCode,
    requiredWordCount: full.requiredWordCount,
    requiredReferencesCount: full.requiredReferencesCount,
    bildazoCategoryId: full.bildazoCategoryId,
    bildazoCategoryName: full.bildazoCategoryName,
    bildazoCategorySlug: full.bildazoCategorySlug,
    bildazoCategoryPath: full.bildazoCategoryPath,
    writingMode: full.writingMode,
    category: full.category,
    subcategory: full.subcategory,
    status: full.status,
    isFakeOrTraining: full.isFakeOrTraining,
    publishedAt: full.publishedAt,
    closedAt: full.closedAt,
    cancelledAt: full.cancelledAt,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    requiredBidCount: full.requiredBidCount,
    bidCollectionOutcome: full.bidCollectionOutcome,
    applicationDeadlineAt: full.applicationDeadlineAt,
    relistCount: full.relistCount,
    currentBidCollectionRoundId: full.currentBidCollectionRoundId,
  };
}

const ARTICLE_SELECT = `
  a.*,
  c.name AS category_name,
  c.slug AS category_slug,
  sc.name AS subcategory_name,
  sc.slug AS subcategory_slug
`;

const ARTICLE_FROM = `
  FROM marketplace_articles a
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN subcategories sc ON sc.id = a.subcategory_id
`;

async function assertCategoryExists(categoryId, client = pool) {
  if (categoryId == null) return null;
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id < 1) {
    throw createAppError("categoryId is invalid.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CATEGORY",
    });
  }
  const { rows } = await client.query(`SELECT id FROM categories WHERE id = $1 LIMIT 1`, [id]);
  if (!rows[0]) {
    throw createAppError("Category not found.", 404, {
      exposeToClient: true,
      publicCode: "CATEGORY_NOT_FOUND",
    });
  }
  return id;
}

async function assertSubcategoryExists(subcategoryId, categoryId, client = pool) {
  if (subcategoryId == null) return null;
  const id = Number(subcategoryId);
  if (!Number.isInteger(id) || id < 1) {
    throw createAppError("subcategoryId is invalid.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_SUBCATEGORY",
    });
  }
  const { rows } = await client.query(
    `SELECT id, category_id FROM subcategories WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) {
    throw createAppError("Subcategory not found.", 404, {
      exposeToClient: true,
      publicCode: "SUBCATEGORY_NOT_FOUND",
    });
  }
  if (categoryId != null && Number(rows[0].category_id) !== Number(categoryId)) {
    throw createAppError("Subcategory does not belong to the selected category.", 400, {
      exposeToClient: true,
      publicCode: "SUBCATEGORY_CATEGORY_MISMATCH",
    });
  }
  return id;
}

function resolveLifecycleTimestamps(status, existing = null, now = new Date()) {
  const iso = now.toISOString();
  return {
    publishedAt:
      status === "published"
        ? existing?.published_at || existing?.publishedAt || iso
        : existing?.published_at || existing?.publishedAt || null,
    closedAt:
      status === "closed"
        ? existing?.closed_at || existing?.closedAt || iso
        : status === "published" || status === "draft"
          ? null
          : existing?.closed_at || existing?.closedAt || null,
    cancelledAt:
      status === "cancelled"
        ? existing?.cancelled_at || existing?.cancelledAt || iso
        : status === "published" || status === "draft"
          ? null
          : existing?.cancelled_at || existing?.cancelledAt || null,
  };
}

async function listMarketplaceArticlesForAdmin({
  status = null,
  articleLevel = null,
  includeFake = true,
  limit = 50,
  offset = 0,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [];
  const where = [];
  if (status) {
    params.push(assertStatus(status));
    where.push(`a.status = $${params.length}`);
  }
  if (articleLevel != null && articleLevel !== "") {
    params.push(assertArticleLevel(articleLevel));
    where.push(`a.article_level = $${params.length}`);
  }
  if (!includeFake) {
    where.push(`a.is_fake_or_training = FALSE`);
  }
  params.push(lim, off);
  const { rows } = await pool.query(
    `SELECT ${ARTICLE_SELECT}
     ${ARTICLE_FROM}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return attachActivationBudgetStates(rows.map(mapMarketplaceArticle));
}

async function attachActivationBudgetStates(articles) {
  const list = Array.isArray(articles) ? articles : [];
  const ids = list.filter((a) => a.activationCampaignId).map((a) => Number(a.id)).filter((n) => Number.isInteger(n));
  if (!ids.length) return list;
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (article_id)
          article_id,
          activation_budget_reserved_at,
          activation_budget_released_at,
          activation_budget_used_at,
          activation_budget_amount_jod,
          activation_campaign_id
         FROM marketplace_article_applications
        WHERE article_id = ANY($1::bigint[])
        ORDER BY article_id,
          (activation_budget_used_at IS NOT NULL) DESC,
          (activation_budget_released_at IS NOT NULL) DESC,
          (activation_budget_reserved_at IS NOT NULL) DESC,
          id DESC`,
      [ids],
    );
    const byArticle = new Map(rows.map((r) => [String(r.article_id), r]));
    const campaignService = require("./freelancerActivationCampaignService");
    return list.map((article) => {
      const stamp = byArticle.get(String(article.id));
      if (!stamp) {
        return article.activationCampaignId
          ? { ...article, activationBudgetState: "not_reserved" }
          : article;
      }
      return {
        ...article,
        activationBudgetState: campaignService.deriveActivationBudgetState(stamp),
        activationBudgetAmountJod:
          stamp.activation_budget_amount_jod != null ? String(stamp.activation_budget_amount_jod) : null,
      };
    });
  } catch (err) {
    if (err?.code === "42703" || err?.code === "42P01") {
      return list.map((article) =>
        article.activationCampaignId ? { ...article, activationBudgetState: "not_reserved" } : article,
      );
    }
    throw err;
  }
}

async function listPublishedMarketplaceArticles({
  articleLevel = null,
  categoryId = null,
  limit = 50,
  offset = 0,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [];
  const where = [`a.status = 'published'`, `a.is_fake_or_training = FALSE`];
  if (articleLevel != null && articleLevel !== "") {
    params.push(assertArticleLevel(articleLevel));
    where.push(`a.article_level = $${params.length}`);
  }
  if (categoryId != null && categoryId !== "") {
    params.push(Number(categoryId));
    where.push(`a.category_id = $${params.length}`);
  }
  params.push(lim, off);
  const { rows } = await pool.query(
    `SELECT ${ARTICLE_SELECT}
     ${ARTICLE_FROM}
     WHERE ${where.join(" AND ")}
     ORDER BY a.published_at DESC NULLS LAST, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(mapMarketplaceArticleReadModel);
}

async function getMarketplaceArticleById(id, { forAdmin = false } = {}) {
  const articleId = Number(id);
  if (!Number.isInteger(articleId) || articleId < 1) return null;
  const { rows } = await pool.query(
    `SELECT ${ARTICLE_SELECT}
     ${ARTICLE_FROM}
     WHERE a.id = $1
     LIMIT 1`,
    [articleId],
  );
  if (!rows[0]) return null;
  const mapped = forAdmin ? mapMarketplaceArticle(rows[0]) : mapMarketplaceArticleReadModel(rows[0]);
  if (!forAdmin) return mapped;
  const [withState] = await attachActivationBudgetStates([mapped]);
  return withState;
}

async function createMarketplaceArticle(payload, { actorUserId = null } = {}) {
  const title = String(payload.title || "").trim();
  if (!title || title.length > 240) {
    throw createAppError("title is required (max 240 characters).", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ARTICLE_TITLE",
    });
  }
  const description = String(payload.description || payload.brief || "").trim();
  const derived = await resolveArticleRequirementsFromPayload(payload);
  const articleLevel = derived.articleLevel;
  // Prefer deriving value; reject forged mismatches if client sends value.
  assertArticleValueMatchesLevel(
    articleLevel,
    payload.articleValueJod ?? payload.article_value_jod,
  );
  const valueDb = formatArticleValueJodForDb(articleLevel);
  const requiredWordCount = derived.requiredWordCount;
  const requiredReferencesCount = derived.requiredReferencesCount;
  const status = assertStatus(payload.status || "draft");
  const isFakeOrTraining = Boolean(payload.isFakeOrTraining ?? payload.is_fake_or_training);
  const categoryId = await assertCategoryExists(payload.categoryId ?? payload.category_id);
  const subcategoryId = await assertSubcategoryExists(
    payload.subcategoryId ?? payload.subcategory_id,
    categoryId,
  );
  const stamps = resolveLifecycleTimestamps(status);
  const schemaReady = await opportunityBidCollectionService.articleBidCollectionSchemaReady();
  const bildazoFields = assertBildazoInventoryFields(payload, {
    // Soft-require when caller provides Bildazo inventory fields; admin UI always sends them.
    required: Boolean(
      payload.bildazoCategoryId ||
        payload.bildazo_category_id ||
        payload.writingMode ||
        payload.writing_mode ||
        payload.requireBildazoInventory,
    ),
  });
  let requiredBidCount = null;
  let deadline = null;
  if (schemaReady) {
    const settings = await getMarketplaceEconomySettings();
    requiredBidCount = opportunityBidCollectionService.wrapAssertRequiredBidCount(
      payload.requiredBidCount ?? payload.required_bid_count,
      settings,
    );
    opportunityBidCollectionService.assertMinRequiredBidsAcknowledged(payload, {
      publishing: true,
    });
    const deadlineRaw = payload.applicationDeadlineAt ?? payload.application_deadline_at ?? null;
    deadline = deadlineRaw ? new Date(deadlineRaw) : null;
    if (deadlineRaw && Number.isNaN(deadline.getTime())) {
      throw createAppError("applicationDeadlineAt is invalid.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_APPLICATION_DEADLINE",
      });
    }
  }

  const client = await pool.connect();
  let articleId;
  try {
    await client.query("BEGIN");
    let rows;
    try {
      const inserted = await client.query(
        `INSERT INTO marketplace_articles (
           title, description, category_id, subcategory_id,
           article_level, article_value_jod,
           required_word_count, required_references_count,
           status, is_fake_or_training,
           created_by_user_id, updated_by_user_id,
           published_at, closed_at, cancelled_at,
           required_bid_count, application_deadline_at
         ) VALUES (
           $1,$2,$3,$4,
           $5,$6::numeric,
           $7,$8,
           $9,$10,
           $11,$11,
           $12,$13,$14,
           $15,$16
         )
         RETURNING id`,
        [
          title,
          description,
          categoryId,
          subcategoryId,
          articleLevel,
          valueDb,
          requiredWordCount,
          requiredReferencesCount,
          status,
          isFakeOrTraining,
          actorUserId ? Number(actorUserId) : null,
          stamps.publishedAt,
          stamps.closedAt,
          stamps.cancelledAt,
          requiredBidCount,
          deadline,
        ],
      );
      rows = inserted.rows;
    } catch (err) {
      if (err?.code !== "42703") throw err;
      const inserted = await client.query(
        `INSERT INTO marketplace_articles (
           title, description, category_id, subcategory_id,
           article_level, article_value_jod,
           required_word_count, required_references_count,
           status, is_fake_or_training,
           created_by_user_id, updated_by_user_id,
           published_at, closed_at, cancelled_at
         ) VALUES (
           $1,$2,$3,$4,
           $5,$6::numeric,
           $7,$8,
           $9,$10,
           $11,$11,
           $12,$13,$14
         )
         RETURNING id`,
        [
          title,
          description,
          categoryId,
          subcategoryId,
          articleLevel,
          valueDb,
          requiredWordCount,
          requiredReferencesCount,
          status,
          isFakeOrTraining,
          actorUserId ? Number(actorUserId) : null,
          stamps.publishedAt,
          stamps.closedAt,
          stamps.cancelledAt,
        ],
      );
      rows = inserted.rows;
    }
    articleId = rows[0].id;
    await applyBildazoInventoryColumns(client, articleId, bildazoFields);
    await softSetActivationPlanTierCode(client, articleId, derived.tierCode);
    const campaignService = require("./freelancerActivationCampaignService");
    const campaignKeyPresent =
      payload.activationCampaignId !== undefined || payload.activation_campaign_id !== undefined;
    const waveKeyPresent =
      payload.activationWaveId !== undefined || payload.activation_wave_id !== undefined;
    if (campaignKeyPresent || waveKeyPresent) {
      const attachment = await campaignService.resolveActivationAttachment(payload, { client });
      await campaignService.persistArticleActivationAttachment(
        articleId,
        { campaignId: attachment.campaignId, waveId: attachment.waveId },
        { client },
      );
    }
    await opportunityBidCollectionService.createInitialArticleRound(
      articleId,
      requiredBidCount,
      deadline,
      { client },
    );
    await client.query("COMMIT");
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
  return getMarketplaceArticleById(articleId, { forAdmin: true });
}

async function updateMarketplaceArticle(id, patch, { actorUserId = null } = {}) {
  const existing = await getMarketplaceArticleById(id, { forAdmin: true });
  if (!existing) {
    throw createAppError("Article not found.", 404, {
      exposeToClient: true,
      publicCode: "ARTICLE_NOT_FOUND",
    });
  }

  // Phase B5: freeze assignment-defining metadata after first application.
  await articleApplicationsService.assertArticleMetadataMutable(id, patch, existing);

  const title =
    patch.title !== undefined ? String(patch.title || "").trim() : existing.title;
  if (!title || title.length > 240) {
    throw createAppError("title is required (max 240 characters).", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ARTICLE_TITLE",
    });
  }
  const description =
    patch.description !== undefined || patch.brief !== undefined
      ? String(patch.description ?? patch.brief ?? "").trim()
      : existing.description;

  const planInPatch =
    patch.targetPlanCode ??
    patch.target_plan_code ??
    patch.planCode ??
    patch.plan_code ??
    null;
  const levelInPatch =
    patch.articleLevel !== undefined || patch.article_level !== undefined;
  const wordsInPatch =
    patch.requiredWordCount !== undefined || patch.required_word_count !== undefined;
  const refsInPatch =
    patch.requiredReferencesCount !== undefined ||
    patch.required_references_count !== undefined;

  let articleLevel;
  let requiredWordCount;
  let requiredReferencesCount;
  let derivedTierCode = null;

  if (planInPatch) {
    const derived = await resolveArticleRequirementsFromPayload(patch, { existing });
    articleLevel = derived.articleLevel;
    requiredWordCount = derived.requiredWordCount;
    requiredReferencesCount = derived.requiredReferencesCount;
    derivedTierCode = derived.tierCode;
  } else if (levelInPatch || wordsInPatch || refsInPatch) {
    const derived = await resolveArticleRequirementsFromPayload(patch, { existing });
    articleLevel = derived.articleLevel;
    requiredWordCount = derived.requiredWordCount;
    requiredReferencesCount = derived.requiredReferencesCount;
  } else {
    // Preserve stored inventory requirements (do not re-pull global package settings).
    articleLevel = existing.articleLevel;
    requiredWordCount = existing.requiredWordCount;
    requiredReferencesCount = existing.requiredReferencesCount;
  }

  if (patch.articleValueJod !== undefined || patch.article_value_jod !== undefined) {
    assertArticleValueMatchesLevel(
      articleLevel,
      patch.articleValueJod ?? patch.article_value_jod,
    );
  }
  const valueDb = formatArticleValueJodForDb(articleLevel);

  const status =
    patch.status !== undefined ? assertStatus(patch.status) : existing.status;

  const isFakeOrTraining =
    patch.isFakeOrTraining !== undefined || patch.is_fake_or_training !== undefined
      ? Boolean(patch.isFakeOrTraining ?? patch.is_fake_or_training)
      : existing.isFakeOrTraining;

  let categoryId = existing.categoryId ? Number(existing.categoryId) : null;
  if (patch.categoryId !== undefined || patch.category_id !== undefined) {
    categoryId = await assertCategoryExists(patch.categoryId ?? patch.category_id);
  }
  let subcategoryId = existing.subcategoryId ? Number(existing.subcategoryId) : null;
  if (patch.subcategoryId !== undefined || patch.subcategory_id !== undefined) {
    subcategoryId = await assertSubcategoryExists(
      patch.subcategoryId ?? patch.subcategory_id,
      categoryId,
    );
  } else if (categoryId != null && subcategoryId != null) {
    subcategoryId = await assertSubcategoryExists(subcategoryId, categoryId);
  }

  const stamps = resolveLifecycleTimestamps(status, {
    publishedAt: existing.publishedAt,
    closedAt: existing.closedAt,
    cancelledAt: existing.cancelledAt,
  });

  const hasBildazoPatch =
    patch.bildazoCategoryId !== undefined ||
    patch.bildazo_category_id !== undefined ||
    patch.writingMode !== undefined ||
    patch.writing_mode !== undefined ||
    patch.bildazoCategoryName !== undefined ||
    patch.bildazoCategorySlug !== undefined ||
    patch.bildazoCategoryPath !== undefined;
  const bildazoFields = hasBildazoPatch
    ? assertBildazoInventoryFields(
        {
          bildazoCategoryId:
            patch.bildazoCategoryId ?? patch.bildazo_category_id ?? existing.bildazoCategoryId,
          bildazoCategoryName:
            patch.bildazoCategoryName ??
            patch.bildazo_category_name ??
            existing.bildazoCategoryName,
          bildazoCategorySlug:
            patch.bildazoCategorySlug ??
            patch.bildazo_category_slug ??
            existing.bildazoCategorySlug,
          bildazoCategoryPath:
            patch.bildazoCategoryPath ??
            patch.bildazo_category_path ??
            existing.bildazoCategoryPath,
          writingMode: patch.writingMode ?? patch.writing_mode ?? existing.writingMode,
        },
        { required: true },
      )
    : null;

  const articleBidEconomics = require("./marketplaceArticleApplicationBidCreditService");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize with select / apply (Article row lock first).
    await client.query(`SELECT id FROM marketplace_articles WHERE id = $1 FOR UPDATE`, [
      Number(id),
    ]);
    await client.query(
      `UPDATE marketplace_articles SET
         title = $2,
         description = $3,
         category_id = $4,
         subcategory_id = $5,
         article_level = $6,
         article_value_jod = $7::numeric,
         required_word_count = $8,
         required_references_count = $9,
         status = $10,
         is_fake_or_training = $11,
         updated_by_user_id = $12,
         published_at = $13,
         closed_at = $14,
         cancelled_at = $15,
         updated_at = NOW()
       WHERE id = $1`,
      [
        Number(id),
        title,
        description,
        categoryId,
        subcategoryId,
        articleLevel,
        valueDb,
        requiredWordCount,
        requiredReferencesCount,
        status,
        isFakeOrTraining,
        actorUserId ? Number(actorUserId) : null,
        stamps.publishedAt,
        stamps.closedAt,
        stamps.cancelledAt,
      ],
    );

    if (bildazoFields) {
      await applyBildazoInventoryColumns(client, id, bildazoFields);
    }
    if (derivedTierCode) {
      await softSetActivationPlanTierCode(client, id, derivedTierCode);
    }

    const campaignKeyPresent =
      patch.activationCampaignId !== undefined || patch.activation_campaign_id !== undefined;
    const waveKeyPresent =
      patch.activationWaveId !== undefined || patch.activation_wave_id !== undefined;
    if (campaignKeyPresent || waveKeyPresent) {
      const campaignService = require("./freelancerActivationCampaignService");
      const campaignValue = campaignKeyPresent
        ? (patch.activationCampaignId ?? patch.activation_campaign_id)
        : existing.activationCampaignId;
      const waveValue =
        (campaignValue === null || campaignValue === "") && !waveKeyPresent
          ? null
          : waveKeyPresent
            ? (patch.activationWaveId ?? patch.activation_wave_id)
            : existing.activationWaveId;
      const attachment = await campaignService.resolveActivationAttachment(
        {
          activationCampaignId: campaignValue,
          activationWaveId: waveValue,
        },
        { client },
      );
      await campaignService.persistArticleActivationAttachment(
        Number(id),
        { campaignId: attachment.campaignId, waveId: attachment.waveId },
        { client },
      );
    }

    if (patch.requiredBidCount !== undefined || patch.required_bid_count !== undefined) {
      const settings = await getMarketplaceEconomySettings(client);
      const requiredBidCount = opportunityBidCollectionService.wrapAssertRequiredBidCount(
        patch.requiredBidCount ?? patch.required_bid_count,
        settings,
      );
      try {
        await client.query(
          `UPDATE marketplace_articles SET required_bid_count = $2, updated_at = NOW() WHERE id = $1`,
          [Number(id), requiredBidCount],
        );
        if (!existing.currentBidCollectionRoundId) {
          await opportunityBidCollectionService.createInitialArticleRound(
            Number(id),
            requiredBidCount,
            existing.applicationDeadlineAt,
            { client },
          );
        }
      } catch (err) {
        if (err?.code !== "42703" && err?.code !== "42P01") throw err;
      }
    }
    if (status === "published" && existing.status !== "published") {
      opportunityBidCollectionService.assertMinRequiredBidsAcknowledged(patch, { publishing: true });
    }

    // Close/cancel with zero selected → refund each pending charged app (1 Bid), then cancel pending.
    // If any selected Freelancer exists, no-selection refunds are skipped.
    if (
      (status === "closed" || status === "cancelled") &&
      existing.status !== status
    ) {
      await articleBidEconomics.refundNoSelectionArticleApplications({
        client,
        articleId: Number(id),
        actorUserId: actorUserId ? Number(actorUserId) : null,
      });
      await articleApplicationsService.cancelPendingApplicationsForArticle(id, client);
      if (status === "cancelled") {
        await articleApplicationsService.cancelAssignedApplicationsForCancelledArticle(id, client);
      }
    }

    await client.query("COMMIT");
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

  return getMarketplaceArticleById(id, { forAdmin: true });
}

async function relistMarketplaceArticleBidCollection(id, payload = {}) {
  const opportunityBidCollectionService = require("./opportunityBidCollectionService");
  await opportunityBidCollectionService.relistArticleBidCollection(id, payload || {});
  return getMarketplaceArticleById(id, { forAdmin: true });
}

module.exports = {
  mapMarketplaceArticle,
  mapMarketplaceArticleReadModel,
  listMarketplaceArticlesForAdmin,
  listPublishedMarketplaceArticles,
  getMarketplaceArticleById,
  createMarketplaceArticle,
  updateMarketplaceArticle,
  relistMarketplaceArticleBidCollection,
  resolveArticleRequirementsFromPayload,
  assertRequiredWordCount,
  assertRequiredReferencesCount,
  deriveArticleValueJodFromLevel,
  ARTICLE_LEVEL_WORD_REFERENCE_GLOBAL_MATRIX,
  ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT,
  ARTICLE_WORK_TOKEN_MOVEMENT,
  ARTICLE_WORK_TOKEN_ENTRY,
  ARTICLE_HISTORICAL_BACKFILL,
};
