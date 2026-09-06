const { pool } = require("../config/db");
const authService = require("./authService");
const subscriptionsService = require("./subscriptionsService");
const coursesService = require("./coursesService");
const { aggregateCourses } = require("./freelancerDashboardAggregates");
const { CONDITION_KEYS, EVENT_TYPES, ITEM_TYPES, PLACEMENTS, STATUS_COPY } = require("../constants/onboarding");
const {
  buildFreelancerFacts,
  pickBannerItem,
  compactForItem,
  statusPayload,
  conditionMatches,
} = require("./onboardingConditionResolver");

function isMissingRelation(err) {
  return err?.code === "42P01";
}

function mapItem(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    key: row.key,
    title: row.title,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    targetRole: row.target_role,
    targetPlanKey: row.target_plan_key,
    targetCategoryKey: row.target_category_key,
    conditionKey: row.condition_key,
    itemType: row.item_type,
    placement: row.placement,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    isDismissible: row.is_dismissible,
    maxViews: row.max_views,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stats: row.views_count != null
      ? {
          views: Number(row.views_count) || 0,
          ctaClicks: Number(row.cta_clicks) || 0,
          dismissals: Number(row.dismissals) || 0,
          completions: Number(row.completions) || 0,
        }
      : undefined,
  };
}

async function loadFreelancerFacts(userId) {
  const uid = Number(userId);
  const [userRow, subscription, coursesList] = await Promise.all([
    authService.findUserById(uid),
    subscriptionsService.getCurrentSubscriptionForFreelancer(uid),
    coursesService.listAssignedCoursesForFreelancerDashboard({ freelancerUserId: uid }),
  ]);
  const coursesAgg = aggregateCourses(coursesList || []);
  return { userRow, subscription, coursesAgg };
}

async function listEnabledItems() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM onboarding_items
       WHERE is_enabled = TRUE
       ORDER BY sort_order ASC, id ASC`,
    );
    return rows;
  } catch (err) {
    if (isMissingRelation(err)) return [];
    throw err;
  }
}

async function listAllItemsWithStats() {
  try {
    const { rows } = await pool.query(
      `SELECT i.*,
        COALESCE(SUM(CASE WHEN e.event_type = 'viewed' THEN 1 ELSE 0 END), 0) AS views_count,
        COALESCE(SUM(CASE WHEN e.event_type = 'clicked_cta' THEN 1 ELSE 0 END), 0) AS cta_clicks,
        COALESCE(SUM(CASE WHEN e.event_type = 'dismissed' THEN 1 ELSE 0 END), 0) AS dismissals,
        COALESCE(SUM(CASE WHEN e.event_type = 'completed' THEN 1 ELSE 0 END), 0) AS completions
       FROM onboarding_items i
       LEFT JOIN user_onboarding_events e ON e.onboarding_item_id = i.id
       GROUP BY i.id
       ORDER BY i.sort_order ASC, i.id ASC`,
    );
    return rows.map(mapItem);
  } catch (err) {
    if (isMissingRelation(err)) return [];
    throw err;
  }
}

async function loadProgressMap(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM user_onboarding_progress WHERE user_id = $1::bigint`,
      [userId],
    );
    const map = new Map();
    for (const row of rows) map.set(String(row.onboarding_item_id), row);
    return map;
  } catch (err) {
    if (isMissingRelation(err)) return new Map();
    throw err;
  }
}

async function getMyCurrent(userId) {
  const { userRow, subscription, coursesAgg } = await loadFreelancerFacts(userId);
  const items = await listEnabledItems();
  const progressByItemId = await loadProgressMap(userId);
  const welcomeItem = items.find((row) => row.key === "welcome");
  const welcomeProgress = welcomeItem ? progressByItemId.get(String(welcomeItem.id)) : null;
  const welcomeCompleted = Boolean(welcomeProgress?.completed_at);
  const facts = buildFreelancerFacts({ userRow, subscription, coursesAgg, welcomeCompleted });
  const status = statusPayload(facts);
  const banner = pickBannerItem(items, facts, progressByItemId);
  if (!banner || facts.activated) {
    return {
      ...status,
      showPanel: false,
      currentItem: null,
    };
  }
  const progress = progressByItemId.get(String(banner.id));
  const compact = compactForItem(banner, facts, progress);
  const copy = STATUS_COPY[banner.condition_key] || {};
  return {
    ...status,
    showPanel: true,
    currentItem: {
      ...mapItem(banner),
      compact,
      compactBody: compact ? copy.compact || banner.body : null,
    },
  };
}

async function getGettingStarted(userId) {
  const { userRow, subscription, coursesAgg } = await loadFreelancerFacts(userId);
  const facts = buildFreelancerFacts({ userRow, subscription, coursesAgg, welcomeCompleted: true });
  const items = await listEnabledItems();
  const now = new Date();
  const list = items.filter((row) => {
    if (row.placement !== "getting_started" && row.placement !== "inline_help") return false;
    if (String(row.target_role || "freelancer") !== "freelancer") return false;
    if (row.starts_at && new Date(row.starts_at) > now) return false;
    if (row.ends_at && new Date(row.ends_at) < now) return false;
    return conditionMatches(row.condition_key, facts) || row.placement === "getting_started" || row.placement === "inline_help";
  });
  return list.map(mapItem);
}

async function recordEvent({ userId, itemId, eventType, metadata }) {
  if (!EVENT_TYPES.includes(eventType)) {
    const err = new Error("نوع الحدث غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  const uid = Number(userId);
  const oid = itemId == null || itemId === "" ? null : Number(itemId);
  try {
    await pool.query(
      `INSERT INTO user_onboarding_events (user_id, onboarding_item_id, event_type, metadata)
       VALUES ($1::bigint, $2::bigint, $3, $4::jsonb)`,
      [uid, Number.isFinite(oid) ? oid : null, eventType, metadata ? JSON.stringify(metadata) : null],
    );
    if (Number.isFinite(oid)) {
      await pool.query(
        `INSERT INTO user_onboarding_progress (user_id, onboarding_item_id, views_count, last_seen_at, dismissed_at, completed_at)
         VALUES ($1::bigint, $2::bigint,
           CASE WHEN $3 = 'viewed' THEN 1 ELSE 0 END,
           NOW(),
           CASE WHEN $3 = 'dismissed' THEN NOW() ELSE NULL END,
           CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END)
         ON CONFLICT (user_id, onboarding_item_id) DO UPDATE SET
           views_count = user_onboarding_progress.views_count + CASE WHEN EXCLUDED.views_count > 0 THEN 1 ELSE 0 END,
           last_seen_at = NOW(),
           dismissed_at = COALESCE(EXCLUDED.dismissed_at, user_onboarding_progress.dismissed_at),
           completed_at = COALESCE(user_onboarding_progress.completed_at, EXCLUDED.completed_at)`,
        [uid, oid, eventType],
      );
    }
    return { ok: true };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, skipped: true };
    throw err;
  }
}

function normalizeAdminPayload(body = {}) {
  const conditionKey = String(body.conditionKey || "").trim();
  if (!CONDITION_KEYS.includes(conditionKey)) {
    const err = new Error("مفتاح الشرط غير مدعوم.");
    err.statusCode = 400;
    throw err;
  }
  const itemType = String(body.itemType || "informational").trim();
  const placement = String(body.placement || "dashboard_banner").trim();
  if (!ITEM_TYPES.includes(itemType) || !PLACEMENTS.includes(placement)) {
    const err = new Error("نوع العنصر أو موضع العرض غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  return {
    key: String(body.key || "").trim(),
    title: String(body.title || "").trim(),
    body: String(body.body || "").trim(),
    ctaLabel: body.ctaLabel ? String(body.ctaLabel).trim() : null,
    ctaUrl: body.ctaUrl ? String(body.ctaUrl).trim() : null,
    targetRole: String(body.targetRole || "freelancer").trim() || "freelancer",
    targetPlanKey: body.targetPlanKey ? String(body.targetPlanKey).trim() : null,
    targetCategoryKey: body.targetCategoryKey ? String(body.targetCategoryKey).trim() : null,
    conditionKey,
    itemType,
    placement,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    isEnabled: body.isEnabled !== false,
    isDismissible: body.isDismissible !== false,
    maxViews: body.maxViews == null || body.maxViews === "" ? null : Number(body.maxViews),
    startsAt: body.startsAt || null,
    endsAt: body.endsAt || null,
  };
}

async function createItem(body, adminId) {
  const p = normalizeAdminPayload(body);
  if (!p.key || !p.title || !p.body) {
    const err = new Error("المفتاح والعنوان والنص مطلوبة.");
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await pool.query(
    `INSERT INTO onboarding_items (
      key, title, body, cta_label, cta_url, target_role, target_plan_key, target_category_key,
      condition_key, item_type, placement, sort_order, is_enabled, is_dismissible, max_views,
      starts_at, ends_at, created_by_admin_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING *`,
    [
      p.key, p.title, p.body, p.ctaLabel, p.ctaUrl, p.targetRole, p.targetPlanKey, p.targetCategoryKey,
      p.conditionKey, p.itemType, p.placement, p.sortOrder, p.isEnabled, p.isDismissible, p.maxViews,
      p.startsAt, p.endsAt, adminId || null,
    ],
  );
  return mapItem(rows[0]);
}

async function updateItem(id, body) {
  const existing = await pool.query(`SELECT * FROM onboarding_items WHERE id = $1::bigint`, [id]);
  if (!existing.rows[0]) {
    const err = new Error("العنصر غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  const merged = {
    ...mapItem(existing.rows[0]),
    ...body,
    conditionKey: body.conditionKey || existing.rows[0].condition_key,
    itemType: body.itemType || existing.rows[0].item_type,
    placement: body.placement || existing.rows[0].placement,
  };
  const p = normalizeAdminPayload({
    ...merged,
    key: existing.rows[0].key,
  });
  const { rows } = await pool.query(
    `UPDATE onboarding_items SET
      title = $2, body = $3, cta_label = $4, cta_url = $5, target_role = $6,
      target_plan_key = $7, target_category_key = $8, condition_key = $9, item_type = $10,
      placement = $11, sort_order = $12, is_enabled = $13, is_dismissible = $14, max_views = $15,
      starts_at = $16, ends_at = $17, updated_at = NOW()
     WHERE id = $1::bigint
     RETURNING *`,
    [
      id, p.title, p.body, p.ctaLabel, p.ctaUrl, p.targetRole, p.targetPlanKey, p.targetCategoryKey,
      p.conditionKey, p.itemType, p.placement, p.sortOrder, p.isEnabled, p.isDismissible, p.maxViews,
      p.startsAt, p.endsAt,
    ],
  );
  return mapItem(rows[0]);
}

async function setEnabled(id, isEnabled) {
  const { rows } = await pool.query(
    `UPDATE onboarding_items SET is_enabled = $2, updated_at = NOW() WHERE id = $1::bigint RETURNING *`,
    [id, Boolean(isEnabled)],
  );
  if (!rows[0]) {
    const err = new Error("العنصر غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  return mapItem(rows[0]);
}

module.exports = {
  getMyCurrent,
  getGettingStarted,
  recordEvent,
  listAllItemsWithStats,
  createItem,
  updateItem,
  setEnabled,
};
