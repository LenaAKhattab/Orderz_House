const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const notificationEventsService = require("./notificationEventsService");
const feedbackTopicsService = require("./feedbackTopicsService");
const feedbackCategoriesService = require("./feedbackCategoriesService");
const {
  FEEDBACK_TYPES,
  FEEDBACK_STATUSES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_ROLES,
} = require("../validators/feedbackValidators");

const ALLOWED_SUBMITTER_ROLES = new Set(["client", "freelancer"]);

/** Cached probe for migration 132 columns.
 * Cache only positive results so a process started before the migration
 * re-discovers columns after 132 is applied (without requiring a restart forever).
 */
let feedbackTopicColumnsReady = false;
let feedbackCategoryColumnsReady = false;

async function hasFeedbackTopicColumns(client = pool) {
  if (feedbackTopicColumnsReady) return true;
  try {
    const { rows } = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'user_feedback'
         AND column_name = 'topic_id'
       LIMIT 1`,
    );
    feedbackTopicColumnsReady = rows.length > 0;
  } catch {
    feedbackTopicColumnsReady = false;
  }
  return feedbackTopicColumnsReady;
}

async function hasFeedbackCategoryColumns(client = pool) {
  if (feedbackCategoryColumnsReady) return true;
  try {
    const { rows } = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'user_feedback'
         AND column_name = 'category_id'
       LIMIT 1`,
    );
    feedbackCategoryColumnsReady = rows.length > 0;
  } catch {
    feedbackCategoryColumnsReady = false;
  }
  return feedbackCategoryColumnsReady;
}

async function buildUserFeedbackSelectCols(client = pool) {
  const topicColumnsReady = await hasFeedbackTopicColumns(client);
  const categoryColumnsReady = await hasFeedbackCategoryColumns(client);
  const parts = ["id", "type"];
  if (categoryColumnsReady) {
    parts.push("category_id", "category_label_snapshot");
  }
  if (topicColumnsReady) {
    parts.push("topic_id", "topic_label_snapshot");
  }
  parts.push(
    "subject",
    "description",
    "status",
    "created_at",
    "updated_at",
    "reviewed_at",
    "resolved_at",
  );
  return parts.join(", ");
}

function sanitizePlainText(value, { maxLen } = {}) {
  let text = String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  // Strip tags defensively; React still escapes on render.
  text = text.replace(/<[^>]*>/g, "");
  if (typeof maxLen === "number" && text.length > maxLen) {
    text = text.slice(0, maxLen);
  }
  return text;
}

function buildDisplayName(row) {
  return [row.first_name, row.father_name, row.family_name]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function mapCategoryFields(row) {
  const categoryId = row.category_id != null ? Number(row.category_id) : null;
  const categoryLabel =
    row.category_label_snapshot != null && String(row.category_label_snapshot).trim()
      ? String(row.category_label_snapshot).trim()
      : null;
  return {
    categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null,
    categoryLabel,
    // Compatibility: type remains the category key / legacy type
    type: row.type,
  };
}

function mapTopicFields(row) {
  const topicId = row.topic_id != null ? Number(row.topic_id) : null;
  const topicLabel =
    row.topic_label_snapshot != null && String(row.topic_label_snapshot).trim()
      ? String(row.topic_label_snapshot).trim()
      : null;
  return {
    topicId: Number.isInteger(topicId) && topicId > 0 ? topicId : null,
    topicLabel,
  };
}

function mapPublicFeedback(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    ...mapCategoryFields(row),
    ...mapTopicFields(row),
    subject: row.subject,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || null,
    resolvedAt: row.resolved_at || null,
  };
}

function mapAdminFeedback(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name_snapshot,
    userEmail: row.user_email_snapshot,
    userRole: row.user_role,
    ...mapCategoryFields(row),
    ...mapTopicFields(row),
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    adminNote: row.admin_note || null,
    assignedAdminId: row.assigned_admin_id != null ? Number(row.assigned_admin_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || null,
    resolvedAt: row.resolved_at || null,
  };
}

function typeLabelAr(type, fallbackLabel = null) {
  if (fallbackLabel) return fallbackLabel;
  if (type === "problem") return "مشكلة";
  if (type === "suggestion") return "اقتراح";
  if (type === "other") return "ملاحظة أخرى";
  return type || "ملاحظة";
}

function statusLabelAr(status) {
  if (status === "new") return "جديد";
  if (status === "in_review") return "قيد المراجعة";
  if (status === "resolved") return "تم الحل";
  if (status === "closed") return "مغلق";
  return status;
}

async function loadAuthUserSnapshot(userId, client = pool) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createAppError("معرّف المستخدم غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_USER",
    });
  }

  const { rows } = await client.query(
    `SELECT id, first_name, father_name, family_name, email, role, is_active
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw createAppError("المستخدم غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "USER_NOT_FOUND",
    });
  }
  if (row.is_active === false) {
    throw createAppError("الحساب غير نشط.", 403, {
      exposeToClient: true,
      publicCode: "ACCOUNT_INACTIVE",
    });
  }

  const role = String(row.role || "").trim();
  if (!ALLOWED_SUBMITTER_ROLES.has(role)) {
    throw createAppError("هذه الميزة متاحة للعملاء والمستقلين فقط.", 403, {
      exposeToClient: true,
      publicCode: "ROLE_NOT_ALLOWED",
    });
  }

  const name = buildDisplayName(row) || String(row.email || "").trim() || `User #${id}`;
  const email = String(row.email || "").trim();
  if (!email) {
    throw createAppError("لا يوجد بريد إلكتروني مرتبط بالحساب.", 400, {
      exposeToClient: true,
      publicCode: "EMAIL_REQUIRED",
    });
  }

  return {
    userId: Number(row.id),
    userName: name,
    userEmail: email,
    userRole: role,
  };
}

function normalizeCreateInput(body = {}) {
  let categoryId = null;
  if (body.categoryId != null && body.categoryId !== "") {
    const parsed = Number(body.categoryId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
    categoryId = parsed;
  }

  // Legacy clients may still send type=problem|suggestion|other (or a category key).
  const type = body.type != null ? String(body.type).trim() : "";
  if (!categoryId && !type) {
    throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CATEGORY",
    });
  }

  const subject = sanitizePlainText(body.subject, { maxLen: 200 });
  if (subject.length < 2) {
    throw createAppError("العنوان مطلوب ويجب ألا يقل عن حرفين.", 400, {
      exposeToClient: true,
      publicCode: "SUBJECT_REQUIRED",
    });
  }

  const description = sanitizePlainText(body.description, { maxLen: 5000 });
  if (description.length < 10) {
    throw createAppError("الوصف مطلوب ويجب ألا يقل عن 10 أحرف.", 400, {
      exposeToClient: true,
      publicCode: "DESCRIPTION_REQUIRED",
    });
  }

  let topicId = null;
  if (body.topicId != null && body.topicId !== "") {
    const parsed = Number(body.topicId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw createAppError("موضوع الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_TOPIC",
      });
    }
    topicId = parsed;
  }

  return { categoryId, type: type || null, subject, description, topicId };
}

async function createFeedback(authUserId, body = {}) {
  const input = normalizeCreateInput(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const snapshot = await loadAuthUserSnapshot(authUserId, client);
    const categoryColumnsReady = await hasFeedbackCategoryColumns(client);
    const topicColumnsReady = await hasFeedbackTopicColumns(client);

    let category = {
      categoryId: null,
      categoryKey: input.type,
      categoryLabelSnapshot: null,
      type: input.type,
    };

    if (categoryColumnsReady) {
      category = await feedbackCategoriesService.resolveCategoryForCreate(
        { categoryId: input.categoryId, type: input.type },
        client,
      );
    } else if (input.categoryId != null) {
      throw createAppError(
        "التصنيفات غير متاحة حالياً. طبّق ترحيل قاعدة البيانات 133_user_feedback_categories.",
        503,
        {
          exposeToClient: true,
          publicCode: "CATEGORIES_SCHEMA_MISSING",
        },
      );
    } else if (!input.type || !FEEDBACK_TYPES.includes(input.type)) {
      throw createAppError("نوع الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_TYPE",
      });
    }

    let topic = { topicId: null, topicLabelSnapshot: null };
    if (topicColumnsReady) {
      topic = await feedbackTopicsService.resolveOptionalTopicForCreate(
        {
          categoryId: category.categoryId,
          type: category.type,
          topicId: input.topicId,
        },
        client,
      );
    } else if (input.topicId != null) {
      throw createAppError(
        "المواضيع الجاهزة غير متاحة حالياً. يمكنك الإرسال بدون موضوع جاهز.",
        503,
        {
          exposeToClient: true,
          publicCode: "TOPICS_SCHEMA_MISSING",
        },
      );
    }

    let created;
    if (categoryColumnsReady && topicColumnsReady) {
      const { rows } = await client.query(
        `INSERT INTO user_feedback (
           user_id, user_name_snapshot, user_email_snapshot, user_role,
           type, category_id, category_label_snapshot,
           topic_id, topic_label_snapshot, subject, description, status, priority
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new', 'normal')
         RETURNING *`,
        [
          snapshot.userId,
          snapshot.userName,
          snapshot.userEmail,
          snapshot.userRole,
          category.type,
          category.categoryId,
          category.categoryLabelSnapshot,
          topic.topicId,
          topic.topicLabelSnapshot,
          input.subject,
          input.description,
        ],
      );
      created = rows[0];
    } else if (topicColumnsReady) {
      const { rows } = await client.query(
        `INSERT INTO user_feedback (
           user_id, user_name_snapshot, user_email_snapshot, user_role,
           type, topic_id, topic_label_snapshot, subject, description, status, priority
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', 'normal')
         RETURNING *`,
        [
          snapshot.userId,
          snapshot.userName,
          snapshot.userEmail,
          snapshot.userRole,
          category.type,
          topic.topicId,
          topic.topicLabelSnapshot,
          input.subject,
          input.description,
        ],
      );
      created = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO user_feedback (
           user_id, user_name_snapshot, user_email_snapshot, user_role,
           type, subject, description, status, priority
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', 'normal')
         RETURNING *`,
        [
          snapshot.userId,
          snapshot.userName,
          snapshot.userEmail,
          snapshot.userRole,
          category.type,
          input.subject,
          input.description,
        ],
      );
      created = rows[0];
    }

    try {
      await notificationEventsService.notifySuperAdmins(
        {
          recipientRole: "super_admin",
          actorUserId: snapshot.userId,
          type: "feedback.created",
          title: "ملاحظة جديدة من مستخدم",
          message: `${snapshot.userName} أرسل ${typeLabelAr(category.type, category.categoryLabelSnapshot)}: ${input.subject}`,
          entityType: "feedback",
          entityId: Number(created.id),
          link: `/dashboard/super-admin/feedback/${created.id}`,
          priority: "medium",
          metadata: {
            feedbackId: String(created.id),
            feedbackType: category.type,
            categoryId: category.categoryId != null ? String(category.categoryId) : null,
            userRole: snapshot.userRole,
            topicId: topic.topicId != null ? String(topic.topicId) : null,
          },
          dedupeKey: `feedback_created_${String(created.id)}`,
        },
        client,
      );
    } catch {
      /* notifications must not fail the primary write */
    }

    await client.query("COMMIT");
    return mapPublicFeedback(created);
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

async function listMyFeedback(authUserId, { page = 1, limit = 10 } = {}) {
  const userId = Number(authUserId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw createAppError("معرّف المستخدم غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_USER",
    });
  }

  const pg = parsePositiveInt(page, 1);
  const lim = Math.min(50, parsePositiveInt(limit, 10));
  const offset = (pg - 1) * lim;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM user_feedback WHERE user_id = $1`,
    [userId],
  );
  const total = countRows[0]?.c || 0;

  const selectCols = await buildUserFeedbackSelectCols();

  const { rows } = await pool.query(
    `SELECT ${selectCols}
     FROM user_feedback
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, offset],
  );

  return {
    items: rows.map(mapPublicFeedback),
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages: Math.max(1, Math.ceil(total / lim) || 1),
    },
  };
}

async function getMyFeedbackById(authUserId, feedbackId) {
  const userId = Number(authUserId);
  const id = Number(feedbackId);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(id) || id <= 0) {
    throw createAppError("طلب غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_REQUEST",
    });
  }

  const selectCols = await buildUserFeedbackSelectCols();

  const { rows } = await pool.query(
    `SELECT ${selectCols}
     FROM user_feedback
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, userId],
  );
  const item = mapPublicFeedback(rows[0]);
  if (!item) {
    throw createAppError("الملاحظة غير موجودة.", 404, {
      exposeToClient: true,
      publicCode: "FEEDBACK_NOT_FOUND",
    });
  }
  return item;
}

async function getAdminSummary(client = pool) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
       COUNT(*) FILTER (WHERE status = 'in_review')::int AS in_review_count,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
       COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
       COUNT(*) FILTER (WHERE type = 'problem')::int AS problem_count,
       COUNT(*) FILTER (WHERE type = 'suggestion')::int AS suggestion_count,
       COUNT(*) FILTER (WHERE type = 'other')::int AS other_count
     FROM user_feedback`,
  );
  const r = rows[0] || {};
  return {
    total: r.total || 0,
    new: r.new_count || 0,
    inReview: r.in_review_count || 0,
    resolved: r.resolved_count || 0,
    closed: r.closed_count || 0,
    problems: r.problem_count || 0,
    suggestions: r.suggestion_count || 0,
    other: r.other_count || 0,
  };
}

async function adminListFeedback({
  q = "",
  categoryId = null,
  type = null,
  status = null,
  userRole = null,
  priority = null,
  from = null,
  to = null,
  page = 1,
  limit = 20,
} = {}) {
  const pg = parsePositiveInt(page, 1);
  const lim = Math.min(100, parsePositiveInt(limit, 20));
  const offset = (pg - 1) * lim;

  const where = ["1=1"];
  const params = [];

  const qTrim = String(q || "").trim();
  if (qTrim) {
    params.push(`%${qTrim}%`);
    const i = params.length;
    const topicColumnsReady = await hasFeedbackTopicColumns();
    where.push(
      topicColumnsReady
        ? `(user_name_snapshot ILIKE $${i}
          OR user_email_snapshot ILIKE $${i}
          OR subject ILIKE $${i}
          OR description ILIKE $${i}
          OR COALESCE(topic_label_snapshot, '') ILIKE $${i})`
        : `(user_name_snapshot ILIKE $${i}
          OR user_email_snapshot ILIKE $${i}
          OR subject ILIKE $${i}
          OR description ILIKE $${i})`,
    );
  }

  const categoryColumnsReady = await hasFeedbackCategoryColumns();
  if (
    (categoryId != null && categoryId !== "") ||
    (type != null && String(type).trim())
  ) {
    if (categoryColumnsReady) {
      const filter = await feedbackCategoriesService.resolveCategoryForAdminFilter({
        categoryId,
        type,
      });
      if (filter) {
        params.push(filter.categoryId);
        const idParam = params.length;
        params.push(filter.key);
        const keyParam = params.length;
        // Prefer category_id; include pre-backfill/legacy rows still keyed only by type.
        where.push(
          `(category_id = $${idParam} OR (category_id IS NULL AND type = $${keyParam}))`,
        );
      }
    } else if (type != null && String(type).trim()) {
      // Pre-migration 133: filter by compatibility type column only.
      params.push(String(type).trim());
      where.push(`type = $${params.length}`);
    } else if (categoryId != null && categoryId !== "") {
      throw createAppError(
        "التصنيفات غير متاحة حالياً. طبّق ترحيل قاعدة البيانات 133_user_feedback_categories.",
        503,
        {
          exposeToClient: true,
          publicCode: "CATEGORIES_SCHEMA_MISSING",
        },
      );
    }
  }
  if (status && FEEDBACK_STATUSES.includes(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (userRole && FEEDBACK_ROLES.includes(userRole)) {
    params.push(userRole);
    where.push(`user_role = $${params.length}`);
  }
  if (priority && FEEDBACK_PRIORITIES.includes(priority)) {
    params.push(priority);
    where.push(`priority = $${params.length}`);
  }
  if (from) {
    params.push(new Date(from).toISOString());
    where.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(new Date(to).toISOString());
    where.push(`created_at <= $${params.length}::timestamptz`);
  }

  const whereSql = where.join(" AND ");

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM user_feedback WHERE ${whereSql}`,
    params,
  );
  const total = countRows[0]?.c || 0;

  const listParams = [...params, lim, offset];
  const { rows } = await pool.query(
    `SELECT *
     FROM user_feedback
     WHERE ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams,
  );

  const summary = await getAdminSummary();

  return {
    items: rows.map(mapAdminFeedback),
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages: Math.max(1, Math.ceil(total / lim) || 1),
    },
    summary,
  };
}

async function adminGetFeedbackById(feedbackId) {
  const id = Number(feedbackId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createAppError("معرّف الملاحظة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ID",
    });
  }

  const { rows } = await pool.query(`SELECT * FROM user_feedback WHERE id = $1 LIMIT 1`, [id]);
  const item = mapAdminFeedback(rows[0]);
  if (!item) {
    throw createAppError("الملاحظة غير موجودة.", 404, {
      exposeToClient: true,
      publicCode: "FEEDBACK_NOT_FOUND",
    });
  }
  return item;
}

async function adminUpdateFeedback(feedbackId, body = {}, adminUserId = null) {
  const existing = await adminGetFeedbackById(feedbackId);
  const updates = [];
  const values = [];
  let i = 1;

  let nextStatus = existing.status;
  if (body.status !== undefined) {
    const status = String(body.status || "").trim();
    if (!FEEDBACK_STATUSES.includes(status)) {
      throw createAppError("الحالة غير صالحة.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_STATUS",
      });
    }
    nextStatus = status;
    updates.push(`status = $${i++}`);
    values.push(status);

    if (status === "in_review" && !existing.reviewedAt) {
      updates.push(`reviewed_at = COALESCE(reviewed_at, NOW())`);
    }
    if (status === "resolved") {
      updates.push(`resolved_at = NOW()`);
    }
    if (status === "new") {
      updates.push(`resolved_at = NULL`);
    }
  }

  if (body.priority !== undefined) {
    const priority = String(body.priority || "").trim();
    if (!FEEDBACK_PRIORITIES.includes(priority)) {
      throw createAppError("الأولوية غير صالحة.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_PRIORITY",
      });
    }
    updates.push(`priority = $${i++}`);
    values.push(priority);
  }

  if (body.adminNote !== undefined) {
    const note =
      body.adminNote == null || body.adminNote === ""
        ? null
        : sanitizePlainText(body.adminNote, { maxLen: 5000 });
    updates.push(`admin_note = $${i++}`);
    values.push(note);
  }

  if (body.assignedAdminId !== undefined) {
    const assigned =
      body.assignedAdminId == null || body.assignedAdminId === ""
        ? null
        : Number(body.assignedAdminId);
    if (assigned != null && (!Number.isInteger(assigned) || assigned <= 0)) {
      throw createAppError("معرّف الأدمن المعيّن غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_ASSIGNED_ADMIN",
      });
    }
    updates.push(`assigned_admin_id = $${i++}`);
    values.push(assigned);
  }

  if (!updates.length) {
    return existing;
  }

  updates.push("updated_at = NOW()");
  values.push(existing.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE user_feedback
       SET ${updates.join(", ")}
       WHERE id = $${i}
       RETURNING *`,
      values,
    );
    const updated = mapAdminFeedback(rows[0]);

    if (
      body.status !== undefined &&
      nextStatus === "resolved" &&
      existing.status !== "resolved" &&
      updated?.userId
    ) {
      try {
        await notificationEventsService.notifyUsers(
          {
            userIds: [updated.userId],
            actorUserId: adminUserId ? Number(adminUserId) : null,
            type: "feedback.status.resolved",
            title: "تحديث حالة ملاحظتك",
            message: `تم تحديث حالة ملاحظتك إلى: ${statusLabelAr("resolved")}`,
            entityType: "feedback",
            entityId: updated.id,
            link:
              updated.userRole === "client"
                ? "/dashboard/client/feedback"
                : "/dashboard/freelancer/feedback",
            priority: "medium",
            metadata: { feedbackId: String(updated.id), status: "resolved" },
            dedupeKey: `feedback_resolved_${String(updated.id)}_${String(Date.now())}`,
          },
          client,
        );
      } catch {
        /* notifications must not fail the primary write */
      }
    }

    await client.query("COMMIT");
    return updated;
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

module.exports = {
  ALLOWED_SUBMITTER_ROLES,
  sanitizePlainText,
  normalizeCreateInput,
  buildDisplayName,
  mapPublicFeedback,
  mapAdminFeedback,
  createFeedback,
  listMyFeedback,
  getMyFeedbackById,
  adminListFeedback,
  adminGetFeedbackById,
  adminUpdateFeedback,
  getAdminSummary,
};
