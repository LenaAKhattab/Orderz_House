const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");

const REVIEW_TEXT_MAX = 2000;
const REVIEW_TEXT_MIN = 10;
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function safeNotify(run) {
  return Promise.resolve()
    .then(() => run())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[freelancer-reviews] notification failed:", err?.message || err);
    });
}

function mapReviewRow(row, { includeClientLabel = true } = {}) {
  if (!row) return null;
  const clientLabel = includeClientLabel
    ? formatClientDisplayName(row.client_first_name, row.client_family_name)
    : null;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    freelancerId: String(row.freelancer_id),
    clientId: String(row.client_id),
    rating: Number(row.rating),
    reviewText: row.review_text || null,
    professionalismRating: row.professionalism_rating != null ? Number(row.professionalism_rating) : null,
    communicationRating: row.communication_rating != null ? Number(row.communication_rating) : null,
    deliveryRating: row.delivery_rating != null ? Number(row.delivery_rating) : null,
    wouldRecommend: Boolean(row.would_recommend),
    isVisible: Boolean(row.is_visible),
    isVerified: Boolean(row.is_verified),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderTitle: row.order_title || null,
    clientLabel,
    canEdit: Boolean(row.can_edit),
  };
}

function formatClientDisplayName(firstName, familyName) {
  const f = String(firstName || "").trim();
  const l = String(familyName || "").trim();
  if (f && l) return `${f} ${l.charAt(0)}.`;
  if (f) return f;
  return "عميل المنصة";
}

function parseRating(value, { required = false, fieldName = "rating" } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      const err = new Error(`${fieldName} مطلوب.`);
      err.statusCode = 400;
      throw err;
    }
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    const err = new Error(`${fieldName} يجب أن يكون بين 1 و 5.`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function parseReviewText(text, { required = false } = {}) {
  if (text === undefined || text === null || text === "") {
    if (required) {
      const err = new Error("نص التقييم مطلوب.");
      err.statusCode = 400;
      throw err;
    }
    return null;
  }
  const s = String(text).trim();
  if (s.length < REVIEW_TEXT_MIN) {
    const err = new Error(`نص التقييم يجب ألا يقل عن ${REVIEW_TEXT_MIN} أحرف.`);
    err.statusCode = 400;
    throw err;
  }
  if (s.length > REVIEW_TEXT_MAX) {
    const err = new Error(`نص التقييم يجب ألا يزيد عن ${REVIEW_TEXT_MAX} حرفاً.`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}

async function loadOrderForClientReview(orderId, clientUserId, clientMaybe) {
  const runner = clientMaybe || pool;
  const oid = Number(orderId);
  const cid = Number(clientUserId);
  const { rows } = await runner.query(
    `SELECT o.*,
            u.first_name AS freelancer_first_name,
            u.family_name AS freelancer_family_name
     FROM orders o
     LEFT JOIN users u ON u.id = COALESCE(o.assigned_freelancer_id, o.accepted_freelancer_id)
     WHERE o.id = $1
     LIMIT 1`,
    [oid],
  );
  const order = rows[0];
  if (!order) {
    const err = new Error("الطلب غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  if (Number(order.created_by_user_id) !== cid) {
    const err = new Error("غير مصرح لك بتقييم هذا الطلب.");
    err.statusCode = 403;
    throw err;
  }
  if (String(order.source_type || "") !== "client_created") {
    const err = new Error("التقييم متاح فقط للطلبات الحقيقية من العملاء.");
    err.statusCode = 403;
    throw err;
  }
  if (String(order.order_status || "") !== "completed") {
    const err = new Error("يمكن التقييم بعد اكتمال الطلب فقط.");
    err.statusCode = 409;
    throw err;
  }
  const freelancerId = Number(order.assigned_freelancer_id || order.accepted_freelancer_id);
  if (!Number.isInteger(freelancerId) || freelancerId < 1) {
    const err = new Error("لا يوجد مستقل مرتبط بهذا الطلب.");
    err.statusCode = 409;
    throw err;
  }
  if (freelancerId === cid) {
    const err = new Error("لا يمكن تقييم نفسك.");
    err.statusCode = 403;
    throw err;
  }
  return { order, freelancerId };
}

async function getClientReviewStatusForOrder({ clientUserId, orderId }) {
  const { order, freelancerId } = await loadOrderForClientReview(orderId, clientUserId);
  const { rows } = await pool.query(
    `SELECT fr.*, o.title AS order_title,
            c.first_name AS client_first_name,
            c.family_name AS client_family_name
     FROM freelancer_reviews fr
     JOIN orders o ON o.id = fr.order_id
     JOIN users c ON c.id = fr.client_id
     WHERE fr.order_id = $1
     LIMIT 1`,
    [Number(orderId)],
  );
  const existing = rows[0]
    ? mapReviewRow(
        {
          ...rows[0],
          can_edit:
            Date.now() - new Date(rows[0].created_at).getTime() < EDIT_WINDOW_MS &&
            Number(rows[0].client_id) === Number(clientUserId),
        },
        { includeClientLabel: false },
      )
    : null;

  const freelancerName = [order.freelancer_first_name, order.freelancer_family_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    canSubmit: !existing,
    existingReview: existing,
    freelancerId: String(freelancerId),
    freelancerName: freelancerName || null,
    orderTitle: order.title || null,
  };
}

async function createClientReviewForOrder({ clientUserId, orderId, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { order, freelancerId } = await loadOrderForClientReview(orderId, clientUserId, client);

    const dup = await client.query(`SELECT id FROM freelancer_reviews WHERE order_id = $1 LIMIT 1`, [
      Number(orderId),
    ]);
    if (dup.rows[0]) {
      const err = new Error("تم إرسال تقييم لهذا الطلب مسبقاً.");
      err.statusCode = 409;
      throw err;
    }

    const rating = parseRating(payload.rating, { required: true });
    const reviewText = parseReviewText(payload.reviewText);
    const professionalismRating = parseRating(payload.professionalismRating, { fieldName: "professionalism_rating" });
    const communicationRating = parseRating(payload.communicationRating, { fieldName: "communication_rating" });
    const deliveryRating = parseRating(payload.deliveryRating, { fieldName: "delivery_rating" });
    const wouldRecommend =
      payload.wouldRecommend === undefined || payload.wouldRecommend === null
        ? true
        : Boolean(payload.wouldRecommend);

    const { rows } = await client.query(
      `INSERT INTO freelancer_reviews (
         order_id, freelancer_id, client_id, rating, review_text,
         professionalism_rating, communication_rating, delivery_rating,
         would_recommend, is_visible, is_verified
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, TRUE)
       RETURNING *`,
      [
        Number(orderId),
        freelancerId,
        Number(clientUserId),
        rating,
        reviewText,
        professionalismRating,
        communicationRating,
        deliveryRating,
        wouldRecommend,
      ],
    );

    await client.query("COMMIT");

    const review = mapReviewRow({ ...rows[0], order_title: order.title, can_edit: true });

    await safeNotify(() =>
      notificationEventsService.notifyUsers({
        userIds: [freelancerId],
        recipientRole: "freelancer",
        actorUserId: Number(clientUserId),
        type: "freelancer.review.received",
        title: "تقييم جديد من عميل",
        message: `حصلت على تقييم ${rating} نجوم لطلب «${order.title || "مشروع"}».`,
        entityType: "freelancer_review",
        entityId: Number(rows[0].id),
        link: "/dashboard/freelancer/profile",
        priority: "medium",
        dedupeKey: `freelancer_review_${rows[0].id}`,
        metadata: { orderId: String(orderId), reviewId: String(rows[0].id), rating },
      }),
    );

    return review;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateClientReviewForOrder({ clientUserId, orderId, payload }) {
  const { rows: existingRows } = await pool.query(
    `SELECT * FROM freelancer_reviews WHERE order_id = $1 AND client_id = $2 LIMIT 1`,
    [Number(orderId), Number(clientUserId)],
  );
  const existing = existingRows[0];
  if (!existing) {
    const err = new Error("التقييم غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  if (Date.now() - new Date(existing.created_at).getTime() > EDIT_WINDOW_MS) {
    const err = new Error("انتهت مهلة تعديل التقييم (48 ساعة).");
    err.statusCode = 409;
    throw err;
  }

  const rating = payload.rating !== undefined ? parseRating(payload.rating, { required: true }) : existing.rating;
  const reviewText =
    payload.reviewText !== undefined ? parseReviewText(payload.reviewText) : existing.review_text;
  const professionalismRating =
    payload.professionalismRating !== undefined
      ? parseRating(payload.professionalismRating, { fieldName: "professionalism_rating" })
      : existing.professionalism_rating;
  const communicationRating =
    payload.communicationRating !== undefined
      ? parseRating(payload.communicationRating, { fieldName: "communication_rating" })
      : existing.communication_rating;
  const deliveryRating =
    payload.deliveryRating !== undefined
      ? parseRating(payload.deliveryRating, { fieldName: "delivery_rating" })
      : existing.delivery_rating;
  const wouldRecommend =
    payload.wouldRecommend !== undefined ? Boolean(payload.wouldRecommend) : existing.would_recommend;

  const { rows } = await pool.query(
    `UPDATE freelancer_reviews
     SET rating = $3,
         review_text = $4,
         professionalism_rating = $5,
         communication_rating = $6,
         delivery_rating = $7,
         would_recommend = $8,
         updated_at = NOW()
     WHERE order_id = $1 AND client_id = $2
     RETURNING *`,
    [
      Number(orderId),
      Number(clientUserId),
      rating,
      reviewText,
      professionalismRating,
      communicationRating,
      deliveryRating,
      wouldRecommend,
    ],
  );
  return mapReviewRow({ ...rows[0], can_edit: true });
}

const VISIBLE_REVIEW_WHERE = `fr.is_visible = TRUE AND fr.is_verified = TRUE`;

async function getFreelancerReviewAggregates(freelancerUserId) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    return emptyAggregates();
  }

  const { rows: aggRows } = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_reviews,
      ROUND(AVG(fr.rating)::numeric, 2) AS average_rating,
      COUNT(*) FILTER (WHERE fr.would_recommend = TRUE)::int AS recommend_count,
      COUNT(*) FILTER (WHERE fr.rating = 5)::int AS stars_5,
      COUNT(*) FILTER (WHERE fr.rating = 4)::int AS stars_4,
      COUNT(*) FILTER (WHERE fr.rating = 3)::int AS stars_3,
      COUNT(*) FILTER (WHERE fr.rating = 2)::int AS stars_2,
      COUNT(*) FILTER (WHERE fr.rating = 1)::int AS stars_1,
      ROUND(AVG(fr.communication_rating)::numeric, 2) AS avg_communication,
      ROUND(AVG(fr.delivery_rating)::numeric, 2) AS avg_delivery,
      ROUND(AVG(fr.professionalism_rating)::numeric, 2) AS avg_professionalism,
      COUNT(*) FILTER (WHERE fr.created_at >= date_trunc('month', NOW()))::int AS reviews_this_month
    FROM freelancer_reviews fr
    WHERE fr.freelancer_id = $1 AND ${VISIBLE_REVIEW_WHERE}
    `,
    [uid],
  );

  const agg = aggRows[0] || {};
  const total = Number(agg.total_reviews || 0);
  if (total === 0) {
    return {
      available: true,
      averageRating: null,
      totalReviews: 0,
      recommendationRate: null,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      latestReviews: [],
      analytics: null,
    };
  }

  const recommendCount = Number(agg.recommend_count || 0);
  const recommendationRate = Math.round((recommendCount / total) * 1000) / 10;

  const { rows: latestRows } = await pool.query(
    `
    SELECT fr.*, o.title AS order_title,
           c.first_name AS client_first_name,
           c.family_name AS client_family_name
    FROM freelancer_reviews fr
    JOIN orders o ON o.id = fr.order_id
    JOIN users c ON c.id = fr.client_id
    WHERE fr.freelancer_id = $1 AND ${VISIBLE_REVIEW_WHERE}
    ORDER BY fr.created_at DESC, fr.id DESC
    LIMIT 3
    `,
    [uid],
  );

  const analytics = buildReviewAnalytics(agg, total);

  return {
    available: true,
    averageRating: agg.average_rating != null ? Number(agg.average_rating) : null,
    totalReviews: total,
    recommendationRate,
    ratingDistribution: {
      1: Number(agg.stars_1 || 0),
      2: Number(agg.stars_2 || 0),
      3: Number(agg.stars_3 || 0),
      4: Number(agg.stars_4 || 0),
      5: Number(agg.stars_5 || 0),
    },
    latestReviews: latestRows.map((r) => mapReviewRow(r)),
    analytics,
  };
}

function buildReviewAnalytics(agg, total) {
  if (total < 1) return null;
  const insights = [];
  const avgComm = agg.avg_communication != null ? Number(agg.avg_communication) : null;
  const avgDel = agg.avg_delivery != null ? Number(agg.avg_delivery) : null;
  const monthCount = Number(agg.reviews_this_month || 0);

  if (avgComm != null && avgComm >= 4.2 && total >= 2) {
    insights.push("العملاء يقيّمون تواصلك بشكل مرتفع.");
  }
  if (avgDel != null && avgDel >= 4.2 && total >= 2) {
    insights.push("معدل تقييم التسليم لديك ممتاز.");
  }
  if (monthCount >= 3) {
    insights.push(`تلقيت ${monthCount} تقييماً إيجابياً هذا الشهر.`);
  } else if (monthCount === 1) {
    insights.push("تلقيت تقييماً جديداً هذا الشهر.");
  }

  return insights.length ? { insights } : null;
}

function emptyAggregates() {
  return {
    available: true,
    averageRating: null,
    totalReviews: 0,
    recommendationRate: null,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    latestReviews: [],
    analytics: null,
  };
}

async function listFreelancerReviews({ freelancerUserId, page = 1, limit = 10 }) {
  const uid = Number(freelancerUserId);
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const pg = Math.max(Number(page) || 1, 1);
  const offset = (pg - 1) * lim;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM freelancer_reviews fr
     WHERE fr.freelancer_id = $1 AND ${VISIBLE_REVIEW_WHERE}`,
    [uid],
  );
  const total = Number(countRows[0]?.total || 0);

  const { rows } = await pool.query(
    `
    SELECT fr.*, o.title AS order_title,
           c.first_name AS client_first_name,
           c.family_name AS client_family_name
    FROM freelancer_reviews fr
    JOIN orders o ON o.id = fr.order_id
    JOIN users c ON c.id = fr.client_id
    WHERE fr.freelancer_id = $1 AND ${VISIBLE_REVIEW_WHERE}
    ORDER BY fr.created_at DESC, fr.id DESC
    LIMIT $2 OFFSET $3
    `,
    [uid, lim, offset],
  );

  return {
    reviews: rows.map((r) => mapReviewRow(r)),
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages: Math.max(1, Math.ceil(total / lim)),
    },
  };
}

async function notifyClientReviewReminder({ clientUserId, orderId, orderTitle }) {
  const uid = Number(clientUserId);
  const oid = Number(orderId);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(oid) || oid < 1) return null;

  const { rows } = await pool.query(`SELECT id FROM freelancer_reviews WHERE order_id = $1 LIMIT 1`, [oid]);
  if (rows[0]) return null;

  return notificationEventsService.notifyUsers({
    userIds: [uid],
    recipientRole: "client",
    type: "order.review.reminder",
    title: "قيّم تجربتك مع المستقل",
    message: `شاركنا رأيك في مشروع «${orderTitle || "مكتمل"}» — يستغرق أقل من دقيقة.`,
    entityType: "order",
    entityId: oid,
    link: "/dashboard/client/my-orders",
    priority: "low",
    dedupeKey: `client_review_reminder_${oid}`,
    metadata: { orderId: String(oid) },
  });
}

module.exports = {
  getClientReviewStatusForOrder,
  createClientReviewForOrder,
  updateClientReviewForOrder,
  getFreelancerReviewAggregates,
  listFreelancerReviews,
  notifyClientReviewReminder,
  EDIT_WINDOW_MS,
};
