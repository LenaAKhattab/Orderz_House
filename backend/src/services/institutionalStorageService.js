/**
 * Institutional Order Storage — business logic.
 * Independent from training/fake rotation and from admin createInternalOrder publish path.
 */
const { pool } = require("../config/db");
const {
  distributeEvenly,
  buildMonthPeriods,
  buildStaggerBatchesForMonth,
  assignOrdersToMonthBatches,
  BUDGET_CONSUMING_STATUSES,
  resolveOrderPriceJod,
} = require("./institutionalStorageDistribution");
const institutionsService = require("./institutionsService");

const ADVISORY_LOCK_KEY = 913847201;

/**
 * Stored-order lifecycle buckets for storage KPI counts (mutually exclusive for available vs distributed).
 * Valid row base: deleted_at IS NULL AND lifecycle_status <> 'deleted'.
 * - available: still in storage inventory (not scheduled/released/terminal)
 * - distributed: assigned to a release batch OR released to a live marketplace order
 * - completed: live orders.order_status = 'completed' via released_order_id
 */
const STORAGE_ORDER_AVAILABLE_STATUSES = Object.freeze([
  "draft",
  "pending_super_admin_approval",
  "approved_unscheduled",
  "paused",
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function emptyOrderCounts() {
  return {
    totalOrdersCount: 0,
    availableOrdersCount: 0,
    distributedOrdersCount: 0,
    completedOrdersCount: 0,
  };
}

/**
 * Aggregate order KPIs for one storage. Does not load order rows into memory.
 * @param {number|string} storageId
 * @param {import("pg").Pool|import("pg").PoolClient} [clientOrPool]
 */
async function getStorageOrderCounts(storageId, clientOrPool = pool) {
  const sid = Number(storageId);
  if (!Number.isInteger(sid) || sid < 1) {
    throw httpError("معرّف المخزن غير صالح.", 400);
  }
  const { rows } = await clientOrPool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE o.deleted_at IS NULL AND o.lifecycle_status <> 'deleted'
       )::int AS total_orders,
       COUNT(*) FILTER (
         WHERE o.deleted_at IS NULL
           AND o.lifecycle_status <> 'deleted'
           AND o.released_order_id IS NULL
           AND o.lifecycle_status = ANY($2::text[])
       )::int AS available_orders,
       COUNT(*) FILTER (
         WHERE o.deleted_at IS NULL
           AND o.lifecycle_status <> 'deleted'
           AND (o.lifecycle_status = 'scheduled' OR o.released_order_id IS NOT NULL)
       )::int AS distributed_orders,
       COUNT(*) FILTER (
         WHERE o.deleted_at IS NULL
           AND o.lifecycle_status <> 'deleted'
           AND o.released_order_id IS NOT NULL
           AND live.order_status = 'completed'
       )::int AS completed_orders
     FROM institutional_stored_orders o
     LEFT JOIN orders live ON live.id = o.released_order_id
     WHERE o.storage_id = $1`,
    [sid, STORAGE_ORDER_AVAILABLE_STATUSES],
  );
  const r = rows[0] || {};
  return {
    totalOrdersCount: Number(r.total_orders || 0),
    availableOrdersCount: Number(r.available_orders || 0),
    distributedOrdersCount: Number(r.distributed_orders || 0),
    completedOrdersCount: Number(r.completed_orders || 0),
  };
}

/**
 * Session-scoped advisory lock so the lock survives the SELECT→COMMIT that
 * lists due batches and covers the full processOneBatch work that follows.
 * Callers must unlock on the same client in `finally` BEFORE `client.release()`,
 * and must destroy the client (release with an Error) if unlock fails — never
 * return a still-locked session to the shared pool.
 */
async function tryAcquireReleaseLock(client) {
  const { rows } = await client.query(`SELECT pg_try_advisory_lock($1::bigint) AS ok`, [ADVISORY_LOCK_KEY]);
  return Boolean(rows[0]?.ok);
}

/**
 * @returns {{ ok: boolean, released: boolean, error?: string }}
 */
async function releaseReleaseLock(client) {
  try {
    const { rows } = await client.query(`SELECT pg_advisory_unlock($1::bigint) AS released`, [ADVISORY_LOCK_KEY]);
    return { ok: true, released: Boolean(rows[0]?.released) };
  } catch (e) {
    return { ok: false, released: false, error: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * Return a pooled client after a session advisory lock attempt.
 * Destroys the underlying connection when unlock did not succeed after acquire.
 */
function releaseClientAfterSessionLock(client, { acquired, unlockResult } = {}) {
  if (!client) return;
  if (acquired && unlockResult && (!unlockResult.ok || !unlockResult.released)) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        component: "institutional_release",
        event: "advisory_unlock_failed_destroy_client",
        unlockOk: unlockResult?.ok ?? null,
        unlockReleased: unlockResult?.released ?? null,
        error: unlockResult?.error || null,
      }),
    );
    client.release(new Error("institutional_advisory_unlock_failed"));
    return;
  }
  client.release();
}

function httpError(message, statusCode = 400, code = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) {
    err.code = code;
    err.publicCode = code;
  }
  return err;
}

/** Normalize pg date / Date / ISO string to YYYY-MM-DD (never locale weekday strings). */
function formatPgDateOnly(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function mapStorage(row, extras = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    description: row.description || null,
    financialLimitJod: Number(row.financial_limit_jod),
    distributionMonths: Number(row.distribution_months),
    distributionStartDate: formatPgDateOnly(row.distribution_start_date),
    status: row.status,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    ...extras,
  };
}

function mapStoredOrder(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    storageId: String(row.storage_id),
    lifecycleStatus: row.lifecycle_status,
    orderCode: row.order_code || null,
    title: row.title,
    description: row.description,
    categoryId: row.category_id != null ? String(row.category_id) : null,
    subcategoryId: row.subcategory_id != null ? String(row.subcategory_id) : null,
    subSubcategoryId: row.sub_subcategory_id != null ? String(row.sub_subcategory_id) : null,
    extraCategoryIds: row.extra_category_ids || [],
    extraCategoryDetails: row.extra_category_details || {},
    projectType: row.project_type,
    budget: row.budget != null ? Number(row.budget) : null,
    bidBudgetMin: row.bid_budget_min != null ? Number(row.bid_budget_min) : null,
    bidBudgetMax: row.bid_budget_max != null ? Number(row.bid_budget_max) : null,
    currencyCode: row.currency_code || "JOD",
    durationValue: Number(row.duration_value),
    durationUnit: row.duration_unit,
    preferredSkills: Array.isArray(row.preferred_skills)
      ? row.preferred_skills
      : row.preferred_skills
        ? JSON.parse(JSON.stringify(row.preferred_skills))
        : [],
    assignedFreelancerId: row.assigned_freelancer_id != null ? String(row.assigned_freelancer_id) : null,
    orderPriceJod: Number(row.order_price_jod),
    releasedOrderId: row.released_order_id != null ? String(row.released_order_id) : null,
    releasedAt: row.released_at || null,
    transferredFakeOrderId:
      row.transferred_fake_order_id != null ? String(row.transferred_fake_order_id) : null,
    transferredAt: row.transferred_at || null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    approvedAt: row.approved_at || null,
    categoryName: row.category_name || null,
  };
}

async function writeAudit(client, { storageId, actorUserId, action, entityType, entityId, before, after }) {
  await client.query(
    `INSERT INTO institutional_storage_audit_logs
      (storage_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      Number(storageId),
      actorUserId != null ? Number(actorUserId) : null,
      action,
      entityType || null,
      entityId != null ? Number(entityId) : null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
}

async function writeReview(client, {
  storageId,
  storedOrderId,
  actorUserId,
  action,
  previousStatus,
  newStatus,
  reason,
  metadata,
}) {
  await client.query(
    `INSERT INTO institutional_order_reviews
      (storage_id, stored_order_id, actor_user_id, action, previous_status, new_status, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      Number(storageId),
      Number(storedOrderId),
      Number(actorUserId),
      action,
      previousStatus || null,
      newStatus || null,
      reason || null,
      JSON.stringify(metadata || {}),
    ],
  );
}

/** Lock storage row and compute budget metrics inside a transaction. */
async function getStorageBudgetLocked(client, storageId) {
  const { rows: sRows } = await client.query(
    `SELECT * FROM institutional_order_storages WHERE id = $1 FOR UPDATE`,
    [Number(storageId)],
  );
  const storage = sRows[0];
  if (!storage) throw httpError("المخزن غير موجود.", 404);

  const { rows: mRows } = await client.query(
    `SELECT
       COALESCE(SUM(order_price_jod) FILTER (
         WHERE lifecycle_status = ANY($2::text[]) AND deleted_at IS NULL
       ), 0)::numeric AS consumed_amount,
       COALESCE(SUM(order_price_jod) FILTER (
         WHERE lifecycle_status = 'pending_super_admin_approval' AND deleted_at IS NULL
       ), 0)::numeric AS pending_value,
       COUNT(*) FILTER (
         WHERE lifecycle_status = ANY($2::text[]) AND deleted_at IS NULL
       )::int AS approved_count,
       COUNT(*) FILTER (
         WHERE lifecycle_status = 'pending_super_admin_approval' AND deleted_at IS NULL
       )::int AS pending_count,
       COUNT(*) FILTER (
         WHERE lifecycle_status = 'released' AND deleted_at IS NULL
       )::int AS released_count
     FROM institutional_stored_orders
     WHERE storage_id = $1`,
    [Number(storageId), BUDGET_CONSUMING_STATUSES],
  );
  const metrics = mRows[0] || {};
  const limit = Number(storage.financial_limit_jod);
  // Usage from real budget-consuming orders (not an exposed "approved allocation" field).
  const consumedAmountJod = Number(metrics.consumed_amount || 0);
  return {
    storage,
    financialLimitJod: limit,
    consumedAmountJod,
    remainingJod: Math.max(0, limit - consumedAmountJod),
    pendingValueJod: Number(metrics.pending_value || 0),
    approvedOrderCount: Number(metrics.approved_count || 0),
    pendingOrderCount: Number(metrics.pending_count || 0),
    releasedCount: Number(metrics.released_count || 0),
  };
}

async function loadStorageInstitutions(storageId, clientOrPool = pool) {
  const { rows } = await clientOrPool.query(
    `SELECT i.id, i.name, i.status
     FROM institutional_storage_institutions si
     INNER JOIN institutions i ON i.id = si.institution_id
     WHERE si.storage_id = $1
     ORDER BY i.name ASC`,
    [Number(storageId)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    status: r.status,
  }));
}

async function assertStorageInstitutionsExist(client, institutionIds) {
  const ids = [...new Set((institutionIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) {
    throw httpError("يجب اختيار مؤسسة واحدة على الأقل.", 400, "NO_INSTITUTIONS_SELECTED");
  }
  const { rows } = await client.query(
    `SELECT id, status FROM institutions WHERE id = ANY($1::bigint[])`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw httpError("إحدى المؤسسات المحددة غير موجودة.", 400, "INSTITUTION_NOT_FOUND");
  }
  const inactive = ids.filter((id) => byId.get(id)?.status !== "active");
  if (inactive.length) {
    const frozen = ids.filter((id) => byId.get(id)?.status === "frozen");
    if (frozen.length) {
      throw httpError(
        "هذه المؤسسة مجمدة حاليًا، ولا يمكن تنفيذ هذه العملية.",
        409,
        "INSTITUTION_FROZEN",
      );
    }
    throw httpError("إحدى المؤسسات المحددة غير نشطة.", 400, "INSTITUTION_INACTIVE");
  }
  return ids;
}

async function createStorage({ actorUserId, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const name = String(payload.name || "").trim();
    if (name.length < 2) throw httpError("اسم المخزن مطلوب (حرفان على الأقل).", 400, "VALIDATION_ERROR");
    if (name.length > 200) throw httpError("اسم المخزن طويل جداً.", 400, "VALIDATION_ERROR");
    const limit = Number(payload.financialLimitJod);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw httpError("الحد المالي يجب أن يكون أكبر من صفر.", 400, "VALIDATION_ERROR");
    }
    if (limit > 1_000_000_000) {
      throw httpError("الحد المالي أكبر من الحد المسموح.", 400, "VALIDATION_ERROR");
    }
    if (Math.abs(limit * 100 - Math.round(limit * 100)) > 1e-6) {
      throw httpError("الحد المالي يقبل منزلتين عشريتين كحد أقصى.", 400, "VALIDATION_ERROR");
    }
    const months = Math.floor(Number(payload.distributionMonths));
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      throw httpError("عدد أشهر التوزيع غير صالح (1–120).", 400, "VALIDATION_ERROR");
    }
    const startDate = String(payload.distributionStartDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      throw httpError("تاريخ بدء التوزيع غير صالح.", 400, "VALIDATION_ERROR");
    }
    const institutionIds = await assertStorageInstitutionsExist(client, payload.institutionIds);

    const { rows } = await client.query(
      `INSERT INTO institutional_order_storages
        (name, description, financial_limit_jod, distribution_months, distribution_start_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5::date, 'draft', $6)
       RETURNING *`,
      [
        name,
        payload.description ? String(payload.description).trim() : null,
        limit,
        months,
        startDate,
        Number(actorUserId),
      ],
    );
    const storage = rows[0];
    for (const iid of institutionIds) {
      await client.query(
        `INSERT INTO institutional_storage_institutions (storage_id, institution_id) VALUES ($1, $2)`,
        [storage.id, iid],
      );
    }
    await writeAudit(client, {
      storageId: storage.id,
      actorUserId,
      action: "storage_created",
      entityType: "storage",
      entityId: storage.id,
      after: mapStorage(storage),
    });
    await client.query("COMMIT");
    const institutions = await loadStorageInstitutions(storage.id);
    return mapStorage(storage, { institutions, ...emptyMetrics(limit) });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function emptyMetrics(limit) {
  return {
    financialLimitJod: Number(limit),
    remainingJod: Number(limit),
    pendingValueJod: 0,
    approvedOrderCount: 0,
    pendingOrderCount: 0,
    releasedCount: 0,
    ...emptyOrderCounts(),
  };
}

async function getStorageMetrics(storageId, clientOrPool = pool) {
  const budget = await (async () => {
    if (clientOrPool === pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const b = await getStorageBudgetLocked(client, storageId);
        await client.query("COMMIT");
        return b;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    return getStorageBudgetLocked(clientOrPool, storageId);
  })();
  const institutions = await loadStorageInstitutions(storageId, clientOrPool === pool ? pool : clientOrPool);
  const { rows: nextBatch } = await pool.query(
    `SELECT scheduled_release_at
     FROM institutional_release_batches
     WHERE storage_id = $1 AND status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')
     ORDER BY scheduled_release_at ASC
     LIMIT 1`,
    [Number(storageId)],
  );
  const { rows: monthRows } = await pool.query(
    `SELECT month_sequence, status FROM institutional_storage_months
     WHERE storage_id = $1 ORDER BY month_sequence ASC`,
    [Number(storageId)],
  );
  const currentMonth =
    monthRows.find((m) => m.status === "active")?.month_sequence ||
    monthRows.find((m) => m.status === "planned")?.month_sequence ||
    null;

  const orderCounts = await getStorageOrderCounts(
    storageId,
    clientOrPool === pool ? pool : clientOrPool,
  );

  return mapStorage(budget.storage, {
    institutions,
    financialLimitJod: budget.financialLimitJod,
    remainingJod: budget.remainingJod,
    pendingValueJod: budget.pendingValueJod,
    approvedOrderCount: budget.approvedOrderCount,
    pendingOrderCount: budget.pendingOrderCount,
    releasedCount: budget.releasedCount,
    currentMonthSequence: currentMonth,
    nextReleaseAt: nextBatch[0]?.scheduled_release_at || null,
    ...orderCounts,
  });
}

async function getStoragesSummary() {
  const consuming = BUDGET_CONSUMING_STATUSES;
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE s.status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE s.status = 'paused')::int AS paused,
       COUNT(*) FILTER (WHERE s.status = 'draft')::int AS draft,
       COUNT(*) FILTER (WHERE s.status = 'archived')::int AS archived,
       COALESCE(SUM(s.financial_limit_jod), 0)::numeric AS total_limits,
       COALESCE((
         SELECT SUM(o.order_price_jod)
         FROM institutional_stored_orders o
         WHERE o.deleted_at IS NULL
           AND o.lifecycle_status = ANY($1::text[])
       ), 0)::numeric AS total_consumed,
       COALESCE((
         SELECT COUNT(*)::int FROM institutional_stored_orders o
         WHERE o.deleted_at IS NULL
           AND o.lifecycle_status = 'pending_super_admin_approval'
       ), 0) AS pending_approvals,
       COALESCE((
         SELECT COUNT(*)::int
         FROM institutional_release_batches b
         INNER JOIN institutional_order_storages s2 ON s2.id = b.storage_id
         WHERE s2.status = 'active'
           AND b.status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')
           AND b.scheduled_release_at < NOW()
       ), 0) AS overdue_batches
     FROM institutional_order_storages s`,
    [consuming],
  );
  const r = rows[0] || {};
  const totalLimits = Number(r.total_limits || 0);
  const totalConsumed = Number(r.total_consumed || 0);
  return {
    totalStorages: Number(r.total || 0),
    activeStorages: Number(r.active || 0),
    pausedStorages: Number(r.paused || 0),
    draftStorages: Number(r.draft || 0),
    archivedStorages: Number(r.archived || 0),
    totalFinancialLimitsJod: totalLimits,
    totalRemainingJod: Math.max(0, totalLimits - totalConsumed),
    pendingApprovalsCount: Number(r.pending_approvals || 0),
    overdueBatchesCount: Number(r.overdue_batches || 0),
  };
}

async function listStorages({
  q = "",
  status = null,
  institutionId = null,
  startDateFrom = null,
  startDateTo = null,
  sort = "created_at_desc",
  page = 1,
  limit = 20,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = ["1=1"];
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(s.name ILIKE $${params.length} OR COALESCE(s.description,'') ILIKE $${params.length})`);
  }
  const allowedStatus = ["draft", "active", "paused", "archived"];
  if (status && allowedStatus.includes(String(status))) {
    params.push(String(status));
    where.push(`s.status = $${params.length}`);
  }
  const iid = Number(institutionId);
  if (Number.isInteger(iid) && iid > 0) {
    params.push(iid);
    where.push(
      `EXISTS (
         SELECT 1 FROM institutional_storage_institutions si
         WHERE si.storage_id = s.id AND si.institution_id = $${params.length}
       )`,
    );
  }
  if (startDateFrom && /^\d{4}-\d{2}-\d{2}$/.test(String(startDateFrom).slice(0, 10))) {
    params.push(String(startDateFrom).slice(0, 10));
    where.push(`s.distribution_start_date >= $${params.length}::date`);
  }
  if (startDateTo && /^\d{4}-\d{2}-\d{2}$/.test(String(startDateTo).slice(0, 10))) {
    params.push(String(startDateTo).slice(0, 10));
    where.push(`s.distribution_start_date <= $${params.length}::date`);
  }
  const whereSql = where.join(" AND ");

  let orderSql = "s.created_at DESC";
  if (sort === "created_at_asc") orderSql = "s.created_at ASC";
  else if (sort === "start_date_asc") orderSql = "s.distribution_start_date ASC NULLS LAST, s.id ASC";
  else if (sort === "start_date_desc") orderSql = "s.distribution_start_date DESC NULLS LAST, s.id DESC";
  else if (sort === "next_release_asc") {
    orderSql = "next_release_at ASC NULLS LAST, s.id ASC";
  } else if (sort === "next_release_desc") {
    orderSql = "next_release_at DESC NULLS LAST, s.id DESC";
  }

  const consuming = BUDGET_CONSUMING_STATUSES;
  const listParams = [...params, consuming, lim, off];
  const consumingIdx = params.length + 1;
  const limIdx = params.length + 2;
  const offIdx = params.length + 3;

  const { rows: cRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM institutional_order_storages s WHERE ${whereSql}`,
    params,
  );
  const total = Number(cRows[0]?.c || 0);

  const { rows } = await pool.query(
    `SELECT s.*,
       COALESCE(m.consumed_amount, 0)::numeric AS consumed_amount,
       COALESCE(m.pending_value, 0)::numeric AS pending_value,
       COALESCE(m.approved_count, 0)::int AS approved_count,
       COALESCE(m.pending_count, 0)::int AS pending_count,
       COALESCE(m.released_count, 0)::int AS released_count,
       COALESCE(m.total_orders_count, 0)::int AS total_orders_count,
       nb.next_release_at,
       COALESCE(inst.institutions_json, '[]'::json) AS institutions_json
     FROM institutional_order_storages s
     LEFT JOIN LATERAL (
       SELECT
         COALESCE(SUM(o.order_price_jod) FILTER (
           WHERE o.lifecycle_status = ANY($${consumingIdx}::text[]) AND o.deleted_at IS NULL
         ), 0)::numeric AS consumed_amount,
         COALESCE(SUM(o.order_price_jod) FILTER (
           WHERE o.lifecycle_status = 'pending_super_admin_approval' AND o.deleted_at IS NULL
         ), 0)::numeric AS pending_value,
         COUNT(*) FILTER (
           WHERE o.lifecycle_status = ANY($${consumingIdx}::text[]) AND o.deleted_at IS NULL
         )::int AS approved_count,
         COUNT(*) FILTER (
           WHERE o.lifecycle_status = 'pending_super_admin_approval' AND o.deleted_at IS NULL
         )::int AS pending_count,
         COUNT(*) FILTER (
           WHERE o.lifecycle_status = 'released' AND o.deleted_at IS NULL
         )::int AS released_count,
         COUNT(*) FILTER (
           WHERE o.deleted_at IS NULL AND o.lifecycle_status <> 'deleted'
         )::int AS total_orders_count
       FROM institutional_stored_orders o
       WHERE o.storage_id = s.id
     ) m ON TRUE
     LEFT JOIN LATERAL (
       SELECT b.scheduled_release_at AS next_release_at
       FROM institutional_release_batches b
       WHERE b.storage_id = s.id
         AND b.status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')
       ORDER BY b.scheduled_release_at ASC
       LIMIT 1
     ) nb ON TRUE
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object('id', i.id::text, 'name', i.name, 'status', i.status)
         ORDER BY i.name ASC
       ) AS institutions_json
       FROM institutional_storage_institutions si
       INNER JOIN institutions i ON i.id = si.institution_id
       WHERE si.storage_id = s.id
     ) inst ON TRUE
     WHERE ${whereSql}
     ORDER BY ${orderSql}
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    listParams,
  );

  const summary = await getStoragesSummary();

  const storages = rows.map((row) => {
    const financialLimit = Number(row.financial_limit_jod);
    const consumedAmount = Number(row.consumed_amount || 0);
    let institutions = [];
    try {
      const raw = row.institutions_json;
      institutions = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : [];
    } catch {
      institutions = [];
    }
    return mapStorage(row, {
      institutions,
      financialLimitJod: financialLimit,
      remainingJod: Math.max(0, financialLimit - consumedAmount),
      pendingValueJod: Number(row.pending_value || 0),
      approvedOrderCount: Number(row.approved_count || 0),
      pendingOrderCount: Number(row.pending_count || 0),
      releasedCount: Number(row.released_count || 0),
      totalOrdersCount: Number(row.total_orders_count || 0),
      nextReleaseAt: row.next_release_at || null,
    });
  });

  return {
    storages,
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim) || 1) },
    summary,
  };
}

async function updateStorage({ actorUserId, storageId, patch }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const budget = await getStorageBudgetLocked(client, storageId);
    const storage = budget.storage;
    const fields = [];
    const params = [];

    if (patch.name != null) {
      params.push(String(patch.name).trim());
      fields.push(`name = $${params.length}`);
    }
    if (patch.description !== undefined) {
      params.push(patch.description == null ? null : String(patch.description).trim());
      fields.push(`description = $${params.length}`);
    }
    if (patch.financialLimitJod != null) {
      const nextLimit = Number(patch.financialLimitJod);
      if (!Number.isFinite(nextLimit) || nextLimit <= 0) throw httpError("الحد المالي غير صالح.");
      if (nextLimit < budget.consumedAmountJod) {
        throw httpError(
          "لا يمكن تخفيض الحد المالي عن المبلغ المخصص للطلبات المعتمدة.",
          409,
          "FINANCIAL_LIMIT_BELOW_ALLOCATED",
        );
      }
      params.push(nextLimit);
      fields.push(`financial_limit_jod = $${params.length}`);
    }
    if (patch.distributionMonths != null) {
      const months = Math.floor(Number(patch.distributionMonths));
      if (!Number.isInteger(months) || months < 1 || months > 120) throw httpError("عدد الأشهر غير صالح.");
      params.push(months);
      fields.push(`distribution_months = $${params.length}`);
    }
    if (patch.distributionStartDate != null) {
      const d = String(patch.distributionStartDate).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw httpError("تاريخ البدء غير صالح.");
      params.push(d);
      fields.push(`distribution_start_date = $${params.length}::date`);
    }
    if (patch.status != null) {
      const allowed = ["draft", "active", "paused", "archived"];
      if (!allowed.includes(patch.status)) throw httpError("حالة المخزن غير صالحة.");
      params.push(patch.status);
      fields.push(`status = $${params.length}`);
    }
    if (Array.isArray(patch.institutionIds)) {
      const ids = await assertStorageInstitutionsExist(client, patch.institutionIds);
      await client.query(`DELETE FROM institutional_storage_institutions WHERE storage_id = $1`, [
        Number(storageId),
      ]);
      for (const iid of ids) {
        await client.query(
          `INSERT INTO institutional_storage_institutions (storage_id, institution_id) VALUES ($1, $2)`,
          [Number(storageId), iid],
        );
      }
    }

    if (fields.length) {
      fields.push(`updated_by = $${params.length + 1}`);
      params.push(Number(actorUserId));
      fields.push(`updated_at = NOW()`);
      params.push(Number(storageId));
      await client.query(
        `UPDATE institutional_order_storages SET ${fields.join(", ")} WHERE id = $${params.length}`,
        params,
      );
    }
    await writeAudit(client, {
      storageId,
      actorUserId,
      action: "storage_updated",
      entityType: "storage",
      entityId: storageId,
      before: mapStorage(storage),
    });
    await client.query("COMMIT");
    return getStorageMetrics(storageId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  createStorage,
  listStorages,
  getStoragesSummary,
  getStorageMetrics,
  getStorageOrderCounts,
  updateStorage,
  getStorageBudgetLocked,
  writeAudit,
  writeReview,
  mapStoredOrder,
  mapStorage,
  formatPgDateOnly,
  loadStorageInstitutions,
  assertStorageInstitutionsExist,
  tryAcquireReleaseLock,
  releaseReleaseLock,
  releaseClientAfterSessionLock,
  ADVISORY_LOCK_KEY,
  STORAGE_ORDER_AVAILABLE_STATUSES,
  httpError,
  BUDGET_CONSUMING_STATUSES,
  resolveOrderPriceJod,
  distributeEvenly,
  buildMonthPeriods,
  buildStaggerBatchesForMonth,
  assignOrdersToMonthBatches,
  sleep,
  pool,
  institutionsService,
};
