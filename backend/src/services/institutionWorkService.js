/**
 * Institution work orchestration (Phase 2).
 * Reuses canonical orders + marketplace articles — no parallel engines.
 */
const { pool } = require("../config/db");
const ordersService = require("./ordersService");
const institutionsService = require("./institutionsService");
const marketplaceArticlesService = require("./marketplaceArticlesService");

const WORK_TYPES = Object.freeze({
  ORDER: "order",
  ARTICLE: "article",
});

function httpError(message, statusCode = 400, publicCode = "VALIDATION_ERROR") {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.publicCode = publicCode;
  return err;
}

async function assertInstitutionManageable(institutionId) {
  const institution = await institutionsService.getInstitutionById(institutionId);
  if (!institution) throw httpError("المؤسسة غير موجودة.", 404, "INSTITUTION_NOT_FOUND");
  if (institution.status === "frozen") {
    throw httpError("المؤسسة مجمّدة ولا يمكن إدارة أعمالها حالياً.", 409, "INSTITUTION_FROZEN");
  }
  if (institution.status === "inactive") {
    throw httpError("المؤسسة غير نشطة ولا يمكن إنشاء أعمال جديدة لها.", 409, "INSTITUTION_INACTIVE");
  }
  return institution;
}

/**
 * Create a canonical internal order scoped to an Institution.
 * payment_required stays false (no external checkout / wallets).
 */
async function createInstitutionOrder({
  institutionId,
  actorUserId,
  actorRole,
  payload,
  uploadedFiles = [],
  publish = true,
}) {
  await assertInstitutionManageable(institutionId);
  const archive = publish === false || Boolean(payload?.archive);
  const order = await ordersService.createInternalOrder({
    actorUserId,
    actorRole: actorRole === "super_admin" ? "super_admin" : "admin",
    payload: {
      ...payload,
      archive,
      assignedFreelancerId: payload?.assignedFreelancerId || null,
    },
    uploadedFiles,
    options: {
      visibilityScope: "institution",
      institutionId: Number(institutionId),
      skipFreelancerBroadcast: true,
    },
  });

  await institutionsService.writeInstitutionAudit(pool, {
    institutionId,
    actorUserId,
    action: "institution_work_created",
    previousStatus: null,
    newStatus: order?.orderStatus || null,
    metadata: {
      workType: WORK_TYPES.ORDER,
      workId: order?.id != null ? String(order.id) : null,
      published: !archive,
    },
  }).catch(() => {});

  return { workType: WORK_TYPES.ORDER, order };
}

/**
 * Create a canonical marketplace article scoped to an Institution.
 * Ownership + visibility are written atomically (no create-then-patch).
 * Financial settlement remains marketplace-isolated until Institution billing exists.
 */
async function createInstitutionArticle({
  institutionId,
  actorUserId,
  payload,
  publish = false,
}) {
  await assertInstitutionManageable(institutionId);
  const status = publish ? "published" : payload?.status || "draft";
  const article = await marketplaceArticlesService.createMarketplaceArticle(
    {
      ...payload,
      status,
      // Institution articles: Bildazo inventory only when explicitly provided.
      requireBildazoInventory: Boolean(
        payload?.bildazoCategoryId ||
          payload?.bildazo_category_id ||
          payload?.requireBildazoInventory === true,
      ),
    },
    {
      actorUserId,
      institutionId: Number(institutionId),
      visibilityScope: "institution",
    },
  );

  await institutionsService.writeInstitutionAudit(pool, {
    institutionId,
    actorUserId,
    action: "institution_work_created",
    previousStatus: null,
    newStatus: status,
    metadata: {
      workType: WORK_TYPES.ARTICLE,
      workId: article?.id != null ? String(article.id) : null,
      published: status === "published",
      settlementMode: "workflow_only",
    },
  }).catch(() => {});

  return { workType: WORK_TYPES.ARTICLE, article };
}

async function listInstitutionWork(
  institutionId,
  { page = 1, limit = 20, q = "", workType = null } = {},
) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const iid = Number(institutionId);
  const includeOrders = !workType || workType === WORK_TYPES.ORDER;
  const includeArticles = !workType || workType === WORK_TYPES.ARTICLE;
  const params = [iid];
  let searchSql = "";
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    searchSql = ` AND (title ILIKE $${params.length} OR COALESCE(code, '') ILIKE $${params.length})`;
  }

  const unions = [];
  if (includeOrders) {
    unions.push(`
      SELECT
        'order'::text AS work_type,
        o.id AS work_id,
        o.title,
        o.order_code AS code,
        o.order_status AS status,
        CASE WHEN o.is_published THEN 'published' ELSE 'draft' END AS publication_status,
        o.project_type AS project_type,
        o.created_at,
        o.due_at,
        o.assigned_freelancer_id,
        o.institutional_storage_id,
        o.institution_id,
        (
          SELECT COUNT(*)::int FROM order_freelancer_bids b
           WHERE b.order_id = o.id AND b.status = 'pending'
        ) AS applicant_count,
        COALESCE(
          NULLIF(trim(concat_ws(' ', u.first_name, u.father_name, u.family_name)), ''),
          u.email
        ) AS assigned_freelancer_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.assigned_freelancer_id
      WHERE o.visibility_scope = 'institution'
        AND (
          o.institution_id = $1
          OR (
            o.institutional_storage_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM institutional_storage_institutions si
               WHERE si.storage_id = o.institutional_storage_id
                 AND si.institution_id = $1
            )
          )
        )
    `);
  }
  if (includeArticles) {
    unions.push(`
      SELECT
        'article'::text AS work_type,
        a.id AS work_id,
        a.title,
        NULL::text AS code,
        a.status,
        CASE WHEN a.status = 'published' THEN 'published'
             WHEN a.status = 'draft' THEN 'draft'
             ELSE a.status END AS publication_status,
        NULL::text AS project_type,
        a.created_at,
        a.writing_deadline_at AS due_at,
        NULL::bigint AS assigned_freelancer_id,
        NULL::bigint AS institutional_storage_id,
        a.institution_id,
        (
          SELECT COUNT(*)::int FROM marketplace_article_applications app
           WHERE app.article_id = a.id AND app.status IN ('pending', 'selected', 'assigned', 'writing', 'submitted', 'under_review', 'revision_requested')
        ) AS applicant_count,
        (
          SELECT COALESCE(
                   NULLIF(trim(concat_ws(' ', u2.first_name, u2.father_name, u2.family_name)), ''),
                   u2.email
                 )
            FROM marketplace_article_applications app2
            INNER JOIN users u2 ON u2.id = app2.freelancer_user_id
           WHERE app2.article_id = a.id
             AND app2.status IN ('selected', 'assigned', 'writing', 'submitted', 'under_review', 'revision_requested', 'approved')
           ORDER BY app2.updated_at DESC NULLS LAST, app2.id DESC
           LIMIT 1
        ) AS assigned_freelancer_name
      FROM marketplace_articles a
      WHERE a.institution_id = $1
        AND COALESCE(a.visibility_scope, 'public') = 'institution'
    `);
  }

  if (!unions.length) {
    return { items: [], pagination: { page: pg, limit: lim, total: 0, totalPages: 1 } };
  }

  const unionSql = unions.join("\nUNION ALL\n");
  let rows;
  try {
    const wrapped = `
      SELECT *, COUNT(*) OVER()::int AS total_count
        FROM (
          ${unionSql}
        ) work
       WHERE 1=1 ${searchSql}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(lim, off);
    ({ rows } = await pool.query(wrapped, params));
  } catch (e) {
    // Articles columns missing → orders only
    if (e && e.code === "42703" && includeArticles && includeOrders) {
      return listInstitutionWork(institutionId, {
        page,
        limit,
        q,
        workType: WORK_TYPES.ORDER,
      });
    }
    throw e;
  }

  const total = Number(rows[0]?.total_count || 0);
  return {
    items: rows.map((r) => ({
      id: String(r.work_id),
      workType: r.work_type,
      title: r.title,
      code: r.code || null,
      status: r.status,
      publicationStatus: r.publication_status,
      projectType: r.project_type || null,
      applicantCount: Number(r.applicant_count || 0),
      assignedFreelancerId:
        r.assigned_freelancer_id != null ? String(r.assigned_freelancer_id) : null,
      assignedFreelancerName: r.assigned_freelancer_name || null,
      dueAt: r.due_at || null,
      createdAt: r.created_at || null,
      source:
        r.work_type === WORK_TYPES.ORDER
          ? r.institutional_storage_id != null
            ? "storage"
            : "direct"
          : "direct",
      sourceLabel:
        r.work_type === WORK_TYPES.ORDER
          ? r.institutional_storage_id != null
            ? "من مخزون المؤسسة"
            : "مباشر"
          : "مباشر",
      institutionId: r.institution_id != null ? String(r.institution_id) : String(iid),
    })),
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages: Math.max(1, Math.ceil(total / lim) || 1),
    },
  };
}

async function getInstitutionOrderBundle({ institutionId, orderId }) {
  await assertInstitutionManageable(institutionId);
  const order = await ordersService.getOrderById(orderId);
  if (!order) throw httpError("الطلب غير موجود.", 404, "NOT_FOUND");
  if (String(order.visibilityScope || "public") !== "institution") {
    throw httpError("هذا الطلب ليس ضمن نطاق المؤسسة.", 403, "FORBIDDEN");
  }

  const belongs =
    String(order.institutionId || "") === String(institutionId) ||
    (await orderBelongsViaStorage(orderId, institutionId));
  if (!belongs) throw httpError("الطلب غير مرتبط بهذه المؤسسة.", 403, "FORBIDDEN");

  let bids = [];
  try {
    const bidsOut = await ordersService.listInternalOrderBidsForAdmin({ orderId });
    bids = Array.isArray(bidsOut) ? bidsOut : bidsOut?.bids || [];
  } catch (e) {
    // Fixed / non-bidding institution orders have no priced bid list.
    if (!(e && (e.statusCode === 400 || e.statusCode === 403))) throw e;
    bids = [];
  }
  const enrichedBids = [];
  for (const bid of bids || []) {
    const freelancerId = bid.freelancerUserId || bid.freelancerId || bid.userId;
    let isInstitutionMember = false;
    if (freelancerId != null) {
      isInstitutionMember = await institutionsService.userBelongsToAnyInstitution(freelancerId, [
        Number(institutionId),
      ]);
    }
    enrichedBids.push({ ...bid, isInstitutionMember });
  }

  return {
    workType: WORK_TYPES.ORDER,
    order,
    applicants: enrichedBids,
    source: order.institutionalStorageId ? "storage" : "direct",
  };
}

async function orderBelongsViaStorage(orderId, institutionId) {
  const { rows } = await pool.query(
    `SELECT 1
       FROM orders o
       INNER JOIN institutional_storage_institutions si
         ON si.storage_id = o.institutional_storage_id
      WHERE o.id = $1 AND si.institution_id = $2
      LIMIT 1`,
    [Number(orderId), Number(institutionId)],
  );
  return Boolean(rows[0]);
}

async function getInstitutionArticleBundle({ institutionId, articleId }) {
  await assertInstitutionManageable(institutionId);
  const article = await marketplaceArticlesService.getMarketplaceArticleById(articleId, {
    forAdmin: true,
  });
  if (!article) throw httpError("المقال غير موجود.", 404, "NOT_FOUND");
  if (String(article.institutionId || "") !== String(institutionId)) {
    // Fallback: read raw column if mapper missing field
    const { rows } = await pool.query(
      `SELECT institution_id, visibility_scope FROM marketplace_articles WHERE id = $1 LIMIT 1`,
      [Number(articleId)],
    );
    if (!rows[0] || String(rows[0].institution_id || "") !== String(institutionId)) {
      throw httpError("المقال غير مرتبط بهذه المؤسسة.", 403, "FORBIDDEN");
    }
  }

  let applicants = [];
  try {
    const appsSvc = require("./marketplaceArticleApplicationsService");
    applicants = await appsSvc.listApplicationsForArticleAdmin(articleId, {
      limit: 100,
      offset: 0,
    });
    if (!Array.isArray(applicants)) {
      applicants = applicants?.applications || applicants?.items || [];
    }
  } catch (_) {
    applicants = [];
  }

  return {
    workType: WORK_TYPES.ARTICLE,
    article: {
      ...article,
      institutionId: String(institutionId),
      visibilityScope: "institution",
    },
    applicants,
    source: "direct",
  };
}

/**
 * Accept a priced bid on an institution order via existing admin award path.
 * No Stripe / client owner impersonation.
 */
async function acceptInstitutionOrderBid({
  institutionId,
  orderId,
  bidId,
  actorUserId,
}) {
  await getInstitutionOrderBundle({ institutionId, orderId });
  const result = await ordersService.approveInternalPricedBidAdmin({
    actorUserId,
    orderId,
    bidId,
  });
  await institutionsService.writeInstitutionAudit(pool, {
    institutionId,
    actorUserId,
    action: "institution_application_accepted",
    previousStatus: null,
    newStatus: result?.orderStatus || "in_progress",
    metadata: {
      workType: WORK_TYPES.ORDER,
      workId: String(orderId),
      bidId: String(bidId),
    },
  }).catch(() => {});
  return result;
}

async function rejectInstitutionOrderBid({
  institutionId,
  orderId,
  bidId,
  actorUserId,
}) {
  await getInstitutionOrderBundle({ institutionId, orderId });
  // Prefer dedicated reject if exported; else update pending bid status.
  if (typeof ordersService.rejectFreelancerBidAdmin === "function") {
    const result = await ordersService.rejectFreelancerBidAdmin({
      actorUserId,
      orderId,
      bidId,
    });
    await institutionsService
      .writeInstitutionAudit(pool, {
        institutionId,
        actorUserId,
        action: "institution_application_rejected",
        metadata: { workType: WORK_TYPES.ORDER, workId: String(orderId), bidId: String(bidId) },
      })
      .catch(() => {});
    return result;
  }
  const { rowCount } = await pool.query(
    `UPDATE order_freelancer_bids
        SET status = 'rejected', updated_at = NOW()
      WHERE id = $1 AND order_id = $2 AND status = 'pending'`,
    [Number(bidId), Number(orderId)],
  );
  if (!rowCount) throw httpError("العرض غير موجود أو لم يعد معلّقاً.", 409, "BID_NOT_PENDING");
  await institutionsService
    .writeInstitutionAudit(pool, {
      institutionId,
      actorUserId,
      action: "institution_application_rejected",
      metadata: { workType: WORK_TYPES.ORDER, workId: String(orderId), bidId: String(bidId) },
    })
    .catch(() => {});
  return { ok: true };
}

async function approveInstitutionOrderDelivery({ institutionId, orderId, actorUserId }) {
  await getInstitutionOrderBundle({ institutionId, orderId });
  const order = await ordersService.adminApproveInternalDelivery({ orderId });
  await institutionsService
    .writeInstitutionAudit(pool, {
      institutionId,
      actorUserId,
      action: "institution_delivery_accepted",
      newStatus: "completed",
      metadata: { workType: WORK_TYPES.ORDER, workId: String(orderId) },
    })
    .catch(() => {});
  return order;
}

async function requestInstitutionOrderRevision({
  institutionId,
  orderId,
  actorUserId,
  note,
  uploadedFiles = [],
}) {
  await getInstitutionOrderBundle({ institutionId, orderId });
  const order = await ordersService.adminRequestInternalDeliveryRevision({
    orderId,
    staffUserId: actorUserId,
    note,
    uploadedFiles,
    revisionRequestedByRole: "super_admin",
  });
  await institutionsService
    .writeInstitutionAudit(pool, {
      institutionId,
      actorUserId,
      action: "institution_revision_requested",
      metadata: { workType: WORK_TYPES.ORDER, workId: String(orderId) },
    })
    .catch(() => {});
  return order;
}

module.exports = {
  WORK_TYPES,
  createInstitutionOrder,
  createInstitutionArticle,
  listInstitutionWork,
  getInstitutionOrderBundle,
  getInstitutionArticleBundle,
  acceptInstitutionOrderBid,
  rejectInstitutionOrderBid,
  approveInstitutionOrderDelivery,
  requestInstitutionOrderRevision,
};
