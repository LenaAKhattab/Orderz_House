/**
 * Phase 2B — publish an OrderzHouse-accepted Mini Article to Bildazo after local settlement.
 * HTTP runs outside the settlement transaction. Failures never roll back approval.
 */

const { pool } = require("../config/db");
const {
  getBildazoArticlePublishConfig,
  resolveBildazoCategoryId,
} = require("../config/bildazoArticlePublish");
const {
  BILDAZO_ARTICLE_PUBLISH_ERROR_CODES,
  BILDAZO_ARTICLE_PUBLISH_RETRYABLE_STATUSES,
  BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES,
} = require("../constants/bildazoArticlePublish");
const { bildazoAuthorLinkSchemaReady } = require("../utils/bildazoAuthorLinkSchema");
const { bildazoArticlePublishSchemaReady } = require("../utils/bildazoArticlePublishSchema");
const { publishAcceptedArticleToBildazo, buildSafePublishBody } = require("./bildazoArticlePublishClient");
const submissionsService = require("./marketplaceArticleSubmissionsService");
const { isBildazoLeafCategoryId } = require("../config/bildazoArticlePublish");
const {
  countWords,
  countReferences,
  writingSourceSatisfiesMode,
  normalizeWritingSource,
} = require("../constants/marketplaceArticleBildazoOz02");

const AUTHOR_NOT_LINKED_AR = "لا يمكن نشر المقال قبل ربط حساب الكاتب في بلدازو.";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRecordRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderzArticleId: String(row.orderz_article_id),
    orderzApplicationId: String(row.orderz_application_id),
    freelancerUserId: String(row.freelancer_user_id),
    bildazoUserId: row.bildazo_user_id || null,
    bildazoPublicId: row.bildazo_public_id || null,
    bildazoArticleId: row.bildazo_article_id || null,
    bildazoArticleUrl: row.bildazo_article_url || null,
    bildazoArticleStatus: row.bildazo_article_status || null,
    status: row.status,
    bildazoCategoryId: row.bildazo_category_id || null,
    publishAttemptCount: Number(row.publish_attempt_count) || 0,
    lastError: row.last_error || null,
    lastResponseCode: row.last_response_code != null ? Number(row.last_response_code) : null,
    requestedAt: row.requested_at || null,
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function asMappedRecord(row) {
  if (!row) return null;
  if (row.orderzApplicationId) return row;
  return mapRecordRow(row);
}

function mapPublicPublishRecord(row) {
  const mapped = asMappedRecord(row);
  if (!mapped) return null;
  return {
    status: mapped.status,
    articleUrl:
      BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES.includes(mapped.status) && mapped.bildazoArticleUrl
        ? mapped.bildazoArticleUrl
        : null,
    articleStatus: mapped.bildazoArticleStatus,
  };
}

function mapAdminPublishRecord(row) {
  const mapped = asMappedRecord(row);
  if (!mapped) return null;
  return {
    status: mapped.status,
    articleUrl: mapped.bildazoArticleUrl,
    articleStatus: mapped.bildazoArticleStatus,
    bildazoArticleId: mapped.bildazoArticleId,
    lastError: mapped.lastError,
    lastResponseCode: mapped.lastResponseCode,
    publishAttemptCount: mapped.publishAttemptCount,
    canRetry: BILDAZO_ARTICLE_PUBLISH_RETRYABLE_STATUSES.includes(mapped.status),
  };
}

function buildPublishContent(article, application, manuscript = null) {
  const title = String(manuscript?.title || "").trim().slice(0, 120);
  const content = String(manuscript?.content || "").trim().slice(0, 200000);
  if (!title || !content) return { title: null, content: null };
  return { title, content };
}

async function loadApprovedContext(applicationId, db) {
  const { rows } = await db.query(
    `SELECT a.*,
            art.title AS campaign_title,
            art.description AS campaign_description,
            art.category_id AS campaign_category_id,
            art.subcategory_id AS campaign_subcategory_id,
            art.bildazo_category_id AS campaign_bildazo_category_id,
            art.bildazo_category_name AS campaign_bildazo_category_name,
            art.bildazo_category_slug AS campaign_bildazo_category_slug,
            art.writing_mode AS campaign_writing_mode,
            art.required_word_count AS campaign_required_word_count,
            art.required_references_count AS campaign_required_references_count
       FROM marketplace_article_applications a
       JOIN marketplace_articles art ON art.id = a.article_id
      WHERE a.id = $1
      LIMIT 1`,
    [Number(applicationId)],
  );
  const application = rows[0];
  if (!application) return { application: null, article: null };
  return {
    application,
    article: {
      id: application.article_id,
      title: application.campaign_title,
      description: application.campaign_description,
      category_id: application.campaign_category_id,
      subcategory_id: application.campaign_subcategory_id,
      bildazo_category_id: application.campaign_bildazo_category_id,
      bildazo_category_name: application.campaign_bildazo_category_name,
      bildazo_category_slug: application.campaign_bildazo_category_slug,
      writing_mode: application.campaign_writing_mode,
      required_word_count: application.campaign_required_word_count,
      required_references_count: application.campaign_required_references_count,
    },
  };
}

function resolvePublishCategoryId(application, article, cfg) {
  const snap = String(application.bildazo_category_id_snapshot || "").trim();
  if (isBildazoLeafCategoryId(snap)) return snap;
  const fromArticle = String(article.bildazo_category_id || "").trim();
  if (isBildazoLeafCategoryId(fromArticle)) return fromArticle;
  return resolveBildazoCategoryId(
    { categoryId: article.category_id, subcategoryId: article.subcategory_id },
    cfg,
  );
}

function buildBildazoPublishPayloadPreview({
  application,
  article,
  manuscript,
  link,
  categoryId,
  acceptedAt,
  reviewerNotes,
}) {
  const writingSource = normalizeWritingSource(manuscript?.writingSource) || "UNKNOWN";
  const payload = buildSafePublishBody({
    orderzArticleId: String(article.id),
    orderzFreelancerId: String(application.freelancer_user_id),
    bildazoUserId: link?.bildazo_user_id || "",
    bildazoPublicId: link?.bildazo_public_id || null,
    title: manuscript?.title || "",
    content: manuscript?.content || "",
    categoryId: categoryId || "",
    acceptedAt: acceptedAt || application.approved_at || null,
    reviewerNotes: reviewerNotes || manuscript?.reviewerNotes || null,
    coverImageUrl: manuscript?.coverImageUrl || null,
    writingSource,
  });
  return {
    payload,
    meta: {
      wordCount: countWords(manuscript?.content),
      referencesCount: countReferences(manuscript?.referencesText),
      requiredWords:
        Number(application.required_word_count_snapshot) ||
        Number(article.required_word_count) ||
        0,
      requiredReferences:
        Number(application.required_references_count_snapshot) ||
        Number(article.required_references_count) ||
        0,
      writingMode: application.writing_mode_snapshot || article.writing_mode || null,
      categoryName:
        application.bildazo_category_name_snapshot || article.bildazo_category_name || null,
      categorySlug:
        application.bildazo_category_slug_snapshot || article.bildazo_category_slug || null,
      authorLinked: Boolean(
        link && String(link.status) === "linked" && UUID_RE.test(String(link.bildazo_user_id || "")),
      ),
      authorBlockMessage: AUTHOR_NOT_LINKED_AR,
      // references exist internally but are intentionally omitted from payload
      referencesStoredInternally: Boolean(manuscript?.referencesText),
      referencesInPayload: false,
    },
  };
}

async function loadLinkedAuthor(freelancerUserId, db) {
  const ready = await bildazoAuthorLinkSchemaReady(db);
  if (!ready) return null;
  const { rows } = await db.query(
    `SELECT * FROM freelancer_bildazo_author_links
      WHERE freelancer_user_id = $1
      LIMIT 1`,
    [Number(freelancerUserId)],
  );
  return rows[0] || null;
}

async function getRecordByApplicationId(applicationId, db) {
  const { rows } = await db.query(
    `SELECT * FROM bildazo_article_publish_records WHERE orderz_application_id = $1 LIMIT 1`,
    [Number(applicationId)],
  );
  return rows[0] || null;
}

async function upsertPendingRecord(
  {
    articleId,
    applicationId,
    freelancerUserId,
    bildazoUserId,
    bildazoPublicId,
    status,
    categoryId,
    lastError,
    lastResponseCode,
    incrementAttempt,
  },
  db,
) {
  const existing = await getRecordByApplicationId(applicationId, db);
  if (existing && BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES.includes(existing.status)) {
    return existing;
  }
  if (existing) {
    const { rows } = await db.query(
      `UPDATE bildazo_article_publish_records
          SET freelancer_user_id = $2,
              bildazo_user_id = $3,
              bildazo_public_id = $4,
              status = $5,
              bildazo_category_id = $6,
              last_error = $7,
              last_response_code = $8,
              publish_attempt_count = publish_attempt_count + $9,
              requested_at = COALESCE(requested_at, NOW()),
              updated_at = NOW()
        WHERE orderz_application_id = $1
          AND status NOT IN ('published', 'already_imported')
        RETURNING *`,
      [
        Number(applicationId),
        Number(freelancerUserId),
        bildazoUserId,
        bildazoPublicId,
        status,
        categoryId,
        lastError,
        lastResponseCode,
        incrementAttempt ? 1 : 0,
      ],
    );
    return rows[0] || existing;
  }
  const { rows } = await db.query(
    `INSERT INTO bildazo_article_publish_records (
       orderz_article_id, orderz_application_id, freelancer_user_id,
       bildazo_user_id, bildazo_public_id, status, bildazo_category_id,
       last_error, last_response_code, publish_attempt_count, requested_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (orderz_application_id) DO NOTHING
     RETURNING *`,
    [
      Number(articleId),
      Number(applicationId),
      Number(freelancerUserId),
      bildazoUserId,
      bildazoPublicId,
      status,
      categoryId,
      lastError,
      lastResponseCode,
      incrementAttempt ? 1 : 0,
    ],
  );
  if (rows[0]) return rows[0];
  return getRecordByApplicationId(applicationId, db);
}

async function applyRemoteResult(applicationId, remote, db) {
  const existing = await getRecordByApplicationId(applicationId, db);
  if (existing && BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES.includes(existing.status)) {
    return existing;
  }
  let status = "failed";
  let publishedAt = null;
  if (remote.status === "approved") {
    status = "published";
    publishedAt = new Date().toISOString();
  } else if (remote.status === "already_imported") {
    status = "already_imported";
    publishedAt = new Date().toISOString();
  } else if (remote.status === "needs_manual_review") {
    status = "needs_manual_review";
  }
  const { rows } = await db.query(
    `UPDATE bildazo_article_publish_records
        SET status = $2,
            bildazo_article_id = COALESCE($3, bildazo_article_id),
            bildazo_article_url = COALESCE($4, bildazo_article_url),
            bildazo_article_status = COALESCE($5, bildazo_article_status),
            last_error = $6,
            last_response_code = $7,
            published_at = COALESCE($8::timestamptz, published_at),
            updated_at = NOW()
      WHERE orderz_application_id = $1
        AND status NOT IN ('published', 'already_imported')
      RETURNING *`,
    [
      Number(applicationId),
      status,
      remote.bildazoArticleId,
      remote.articleUrl,
      remote.articleStatus,
      remote.ok ? null : remote.errorCode || remote.safeMessage,
      remote.httpStatus,
      publishedAt,
    ],
  );
  return rows[0] || existing;
}

/**
 * After OrderzHouse marks the application approved (settlement committed).
 * Never throws for Bildazo/config failures.
 */
async function publishAfterArticleAcceptance(
  { applicationId, actorUserId = null, retry = false } = {},
  deps = {},
) {
  const db = deps.db || pool;
  const getConfig = deps.getConfig || getBildazoArticlePublishConfig;
  const publishFn = deps.publishFn || publishAcceptedArticleToBildazo;

  if (!(await bildazoArticlePublishSchemaReady(db))) {
    return {
      skipped: true,
      reason: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.SCHEMA_NOT_READY,
      record: null,
    };
  }

  const { application, article } = await loadApprovedContext(applicationId, db);
  if (!application) {
    return { skipped: true, reason: "ARTICLE_APPLICATION_NOT_FOUND", record: null };
  }
  if (String(application.status) !== "approved") {
    return {
      skipped: true,
      reason: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.APPLICATION_NOT_APPROVED,
      record: null,
    };
  }

  const existing = await getRecordByApplicationId(application.id, db);
  if (existing && BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES.includes(existing.status)) {
    return { skipped: false, idempotent: true, called: false, record: mapRecordRow(existing) };
  }
  if (
    retry &&
    existing &&
    !BILDAZO_ARTICLE_PUBLISH_RETRYABLE_STATUSES.includes(existing.status)
  ) {
    return { skipped: true, reason: "NOT_RETRYABLE", record: mapRecordRow(existing) };
  }

  const link = await loadLinkedAuthor(application.freelancer_user_id, db);
  const linked =
    link &&
    String(link.status) === "linked" &&
    UUID_RE.test(String(link.bildazo_user_id || "").trim());
  const cfg = getConfig();
  const categoryId = resolvePublishCategoryId(application, article, cfg);
  const manuscriptRow = await submissionsService.getSubmissionByApplicationId(application.id, db);
  const manuscript = submissionsService.mapSubmissionRow(manuscriptRow);
  const { title, content } = buildPublishContent(article, application, manuscript);
  const reviewerNotes = manuscript?.reviewerNotes || null;
  const writingSource = normalizeWritingSource(manuscript?.writingSource) || "UNKNOWN";
  const coverImageUrl = manuscript?.coverImageUrl || null;
  const bildazoUserId = linked ? String(link.bildazo_user_id).trim() : "unlinked";
  const bildazoPublicId = linked ? link.bildazo_public_id || null : null;

  const requiredWords =
    Number(application.required_word_count_snapshot) || Number(article.required_word_count) || 0;
  const requiredRefs =
    Number(application.required_references_count_snapshot) ||
    Number(article.required_references_count) ||
    0;
  const writingMode = application.writing_mode_snapshot || article.writing_mode || null;

  if (!linked) {
    const row = await upsertPendingRecord(
      {
        articleId: article.id,
        applicationId: application.id,
        freelancerUserId: application.freelancer_user_id,
        bildazoUserId: String(link?.bildazo_user_id || "unlinked").slice(0, 80),
        bildazoPublicId: link?.bildazo_public_id || null,
        status: "needs_manual_review",
        categoryId,
        lastError: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_AUTHOR_NOT_LINKED,
        lastResponseCode: null,
        incrementAttempt: false,
      },
      db,
    );
    return {
      skipped: true,
      called: false,
      record: mapRecordRow(row),
      safeMessage: AUTHOR_NOT_LINKED_AR,
    };
  }

  if (
    requiredWords > 0 &&
    countWords(content) < requiredWords
  ) {
    const row = await upsertPendingRecord(
      {
        articleId: article.id,
        applicationId: application.id,
        freelancerUserId: application.freelancer_user_id,
        bildazoUserId,
        bildazoPublicId,
        status: "needs_manual_review",
        categoryId,
        lastError: "INSUFFICIENT_WORD_COUNT",
        lastResponseCode: null,
        incrementAttempt: false,
      },
      db,
    );
    return { skipped: true, called: false, record: mapRecordRow(row) };
  }

  if (
    requiredRefs > 0 &&
    countReferences(manuscript?.referencesText) < requiredRefs
  ) {
    const row = await upsertPendingRecord(
      {
        articleId: article.id,
        applicationId: application.id,
        freelancerUserId: application.freelancer_user_id,
        bildazoUserId,
        bildazoPublicId,
        status: "needs_manual_review",
        categoryId,
        lastError: "INSUFFICIENT_REFERENCES",
        lastResponseCode: null,
        incrementAttempt: false,
      },
      db,
    );
    return { skipped: true, called: false, record: mapRecordRow(row) };
  }

  if (
    writingMode &&
    !writingSourceSatisfiesMode(writingSource, writingMode)
  ) {
    const row = await upsertPendingRecord(
      {
        articleId: article.id,
        applicationId: application.id,
        freelancerUserId: application.freelancer_user_id,
        bildazoUserId,
        bildazoPublicId,
        status: "needs_manual_review",
        categoryId,
        lastError: "WRITING_SOURCE_MISMATCH",
        lastResponseCode: null,
        incrementAttempt: false,
      },
      db,
    );
    return { skipped: true, called: false, record: mapRecordRow(row) };
  }

  if (!categoryId) {
    const row = await upsertPendingRecord(
      {
        articleId: article.id,
        applicationId: application.id,
        freelancerUserId: application.freelancer_user_id,
        bildazoUserId,
        bildazoPublicId,
        status: "needs_manual_review",
        categoryId: null,
        lastError: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.INVALID_BILDAZO_CATEGORY_MAPPING,
        lastResponseCode: null,
        incrementAttempt: false,
      },
      db,
    );
    return { skipped: true, called: false, record: mapRecordRow(row) };
  }

  if (!title || !content) {
    const row = await upsertPendingRecord(
      {
        articleId: article.id,
        applicationId: application.id,
        freelancerUserId: application.freelancer_user_id,
        bildazoUserId,
        bildazoPublicId,
        status: "needs_manual_review",
        categoryId,
        lastError: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.MISSING_FINAL_ARTICLE_CONTENT,
        lastResponseCode: null,
        incrementAttempt: false,
      },
      db,
    );
    return { skipped: true, called: false, record: mapRecordRow(row) };
  }

  if (!cfg.enabled) {
    const row = await upsertPendingRecord(
      {
        articleId: article.id,
        applicationId: application.id,
        freelancerUserId: application.freelancer_user_id,
        bildazoUserId,
        bildazoPublicId,
        status: "skipped",
        categoryId,
        lastError: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_DISABLED,
        lastResponseCode: null,
        incrementAttempt: false,
      },
      db,
    );
    return { skipped: true, called: false, disabled: true, record: mapRecordRow(row) };
  }

  await upsertPendingRecord(
    {
      articleId: article.id,
      applicationId: application.id,
      freelancerUserId: application.freelancer_user_id,
      bildazoUserId,
      bildazoPublicId,
      status: "pending",
      categoryId,
      lastError: null,
      lastResponseCode: null,
      incrementAttempt: true,
    },
    db,
  );

  const remote = await publishFn(
    {
      orderzArticleId: String(article.id),
      orderzFreelancerId: String(application.freelancer_user_id),
      bildazoUserId,
      bildazoPublicId,
      title,
      content,
      categoryId,
      acceptedAt: application.approved_at || new Date(),
      reviewerNotes,
      coverImageUrl,
      writingSource,
    },
    deps,
  );

  const saved = await applyRemoteResult(application.id, remote, db);
  return {
    skipped: false,
    called: Boolean(remote.called),
    actorUserId,
    record: mapRecordRow(saved),
    remoteStatus: remote.status,
  };
}

async function listPublishRecordsForArticle(articleId, db = pool) {
  try {
    if (!(await bildazoArticlePublishSchemaReady(db))) return [];
    const { rows } = await db.query(
      `SELECT * FROM bildazo_article_publish_records WHERE orderz_article_id = $1`,
      [Number(articleId)],
    );
    return rows;
  } catch {
    return [];
  }
}

async function getPublishRecordForApplication(applicationId, db = pool) {
  try {
    if (!(await bildazoArticlePublishSchemaReady(db))) return null;
    return getRecordByApplicationId(applicationId, db);
  } catch {
    return null;
  }
}

async function retryPublishForApplication(applicationId, actorUserId, deps = {}) {
  return publishAfterArticleAcceptance({ applicationId, actorUserId, retry: true }, deps);
}

async function retryPublishForArticle(articleId, actorUserId, deps = {}) {
  const db = deps.db || pool;
  const rows = await listPublishRecordsForArticle(articleId, db);
  const retryable = rows.filter((r) =>
    BILDAZO_ARTICLE_PUBLISH_RETRYABLE_STATUSES.includes(r.status),
  );
  const results = [];
  for (const row of retryable) {
    // eslint-disable-next-line no-await-in-loop
    results.push(
      await publishAfterArticleAcceptance(
        { applicationId: row.orderz_application_id, actorUserId, retry: true },
        deps,
      ),
    );
  }
  return { retried: results.length, results };
}

function attachPublishToApplications(applications, records, { forAdmin = false } = {}) {
  const byApp = new Map(
    (records || []).map((r) => [String(r.orderz_application_id), r]),
  );
  return (applications || []).map((app) => {
    const rec = byApp.get(String(app.id));
    return {
      ...app,
      bildazoPublish: forAdmin ? mapAdminPublishRecord(rec) : mapPublicPublishRecord(rec),
    };
  });
}

async function getPublishPreviewForApplication(applicationId, db = pool) {
  const { application, article } = await loadApprovedContext(applicationId, db);
  if (!application || !article) return null;
  const link = await loadLinkedAuthor(application.freelancer_user_id, db);
  const manuscriptRow = await submissionsService.getSubmissionByApplicationId(application.id, db);
  const manuscript = submissionsService.mapSubmissionRow(manuscriptRow, { forAdmin: true });
  const cfg = getBildazoArticlePublishConfig();
  const categoryId = resolvePublishCategoryId(application, article, cfg);
  return buildBildazoPublishPayloadPreview({
    application,
    article,
    manuscript,
    link,
    categoryId,
    acceptedAt: application.approved_at,
    reviewerNotes: manuscript?.reviewerNotes,
  });
}

module.exports = {
  publishAfterArticleAcceptance,
  retryPublishForApplication,
  retryPublishForArticle,
  listPublishRecordsForArticle,
  getPublishRecordForApplication,
  getPublishPreviewForApplication,
  buildBildazoPublishPayloadPreview,
  mapRecordRow,
  mapPublicPublishRecord,
  mapAdminPublishRecord,
  attachPublishToApplications,
  buildPublishContent,
  AUTHOR_NOT_LINKED_AR,
};
