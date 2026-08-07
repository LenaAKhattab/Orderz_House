/**
 * Storage lifecycle transitions + schedule editing for institutional order storage.
 */
const { pool } = require("../config/db");
const base = require("./institutionalStorageService");
const {
  getStorageBudgetLocked,
  writeAudit,
  httpError,
  loadStorageInstitutions,
  tryAcquireReleaseLock,
} = base;

const STATUS_TRANSITIONS = Object.freeze({
  draft: ["active", "archived"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  archived: [],
});

async function validateActivation(client, storageId, { allowPastBatches = false } = {}) {
  const institutions = await loadStorageInstitutions(storageId, client);
  const activeInstitutions = institutions.filter((i) => i.status === "active");
  if (!activeInstitutions.length) {
    throw httpError("يجب وجود مؤسسة نشطة واحدة على الأقل قبل التفعيل.", 409, "NO_ACTIVE_INSTITUTION");
  }

  const budget = await getStorageBudgetLocked(client, storageId);
  if (budget.approvedOrderCount < 1) {
    throw httpError("يجب وجود طلب معتمد واحد على الأقل قبل التفعيل.", 409, "NO_APPROVED_ORDERS");
  }
  if (budget.consumedAmountJod > budget.financialLimitJod + 1e-9) {
    throw httpError("المبلغ المخصص يتجاوز الحد المالي.", 409, "FINANCIAL_LIMIT_EXCEEDED");
  }

  const { rows: months } = await client.query(
    `SELECT COUNT(*)::int AS c FROM institutional_storage_months WHERE storage_id = $1`,
    [Number(storageId)],
  );
  if (Number(months[0]?.c || 0) < 1) {
    throw httpError("يجب توليد الجدول قبل التفعيل.", 409, "NO_SCHEDULE");
  }

  const { rows: batches } = await client.query(
    `SELECT id, scheduled_release_at, status
     FROM institutional_release_batches
     WHERE storage_id = $1 AND status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')`,
    [Number(storageId)],
  );
  if (!batches.length) {
    throw httpError("لا توجد دفعات إطلاق غير مطلقة في الجدول.", 409, "NO_UNRELEASED_BATCHES");
  }

  const past = batches.filter((b) => new Date(b.scheduled_release_at).getTime() < Date.now());
  if (past.length && !allowPastBatches) {
    throw httpError(
      "بعض مواعيد الإطلاق في الماضي. أكّد المتابعة صراحة أو عدّل المواعيد.",
      409,
      "PAST_RELEASE_DATES",
    );
  }

  const { rows: orphan } = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM institutional_batch_orders bo
     INNER JOIN institutional_release_batches b ON b.id = bo.batch_id
     INNER JOIN institutional_stored_orders o ON o.id = bo.stored_order_id
     WHERE b.storage_id = $1
       AND bo.release_status = 'pending'
       AND o.lifecycle_status NOT IN ('scheduled', 'approved_unscheduled')`,
    [Number(storageId)],
  );
  if (Number(orphan[0]?.c || 0) > 0) {
    throw httpError("توجد تعيينات دفعات غير صالحة. راجع الجدول قبل التفعيل.", 409, "INVALID_BATCH_ASSIGNMENTS");
  }

  return { budget, pastBatchCount: past.length };
}

async function transitionStorageStatus({
  actorUserId,
  storageId,
  status,
  allowPastBatches = false,
  confirmPastBatches = false,
}) {
  if (status === "active") {
    const institutionsService = require("./institutionsService");
    await institutionsService.assertStorageInstitutionsNotFrozen(storageId);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const budget = await getStorageBudgetLocked(client, storageId);
    const current = budget.storage.status;
    const next = String(status || "");
    const allowed = STATUS_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw httpError(`لا يمكن الانتقال من «${current}» إلى «${next}».`, 409, "INVALID_STATUS_TRANSITION");
    }

    if (next === "active") {
      await validateActivation(client, storageId, {
        allowPastBatches: Boolean(allowPastBatches || confirmPastBatches),
      });
    }

    await client.query(
      `UPDATE institutional_order_storages
       SET status = $2, updated_by = $3, updated_at = NOW()
       WHERE id = $1`,
      [Number(storageId), next, Number(actorUserId)],
    );
    await writeAudit(client, {
      storageId,
      actorUserId,
      action: `storage_status_${next}`,
      entityType: "storage",
      entityId: storageId,
      before: { status: current },
      after: { status: next },
    });
    await client.query("COMMIT");
    return base.getStorageMetrics(storageId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function assertBatchEditable(client, batchId) {
  const { rows } = await client.query(
    `SELECT * FROM institutional_release_batches WHERE id = $1 FOR UPDATE`,
    [Number(batchId)],
  );
  const batch = rows[0];
  if (!batch) throw httpError("الدفعة غير موجودة.", 404);
  if (["RELEASED", "PROCESSING"].includes(batch.status)) {
    throw httpError("لا يمكن تعديل دفعة مطلقة أو قيد المعالجة.", 409, "BATCH_IMMUTABLE");
  }
  return batch;
}

async function updateBatchReleaseAt({ actorUserId, batchId, scheduledReleaseAt }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batch = await assertBatchEditable(client, batchId);
    const at = new Date(scheduledReleaseAt);
    if (!Number.isFinite(at.getTime())) throw httpError("موعد الإطلاق غير صالح.");

    const { rows: monthRows } = await client.query(
      `SELECT period_start_date, period_end_date FROM institutional_storage_months WHERE id = $1`,
      [batch.month_id],
    );
    const month = monthRows[0];
    if (month) {
      const start = new Date(`${String(month.period_start_date).slice(0, 10)}T00:00:00.000Z`);
      const end = new Date(`${String(month.period_end_date).slice(0, 10)}T23:59:59.999Z`);
      if (at.getTime() < start.getTime() || at.getTime() > end.getTime()) {
        throw httpError("موعد الإطلاق يجب أن يقع ضمن نافذة الشهر (30 يوماً).", 400);
      }
    }

    await client.query(
      `UPDATE institutional_release_batches
       SET scheduled_release_at = $2, updated_by = $3, updated_at = NOW()
       WHERE id = $1`,
      [batch.id, at.toISOString(), Number(actorUserId)],
    );
    await writeAudit(client, {
      storageId: batch.storage_id,
      actorUserId,
      action: "batch_reschedule",
      entityType: "batch",
      entityId: batch.id,
      before: { scheduledReleaseAt: batch.scheduled_release_at },
      after: { scheduledReleaseAt: at.toISOString() },
    });
    await client.query("COMMIT");
    return { id: String(batch.id), scheduledReleaseAt: at.toISOString() };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function cancelBatch({ actorUserId, batchId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batch = await assertBatchEditable(client, batchId);
    const { rows: pending } = await client.query(
      `SELECT stored_order_id FROM institutional_batch_orders
       WHERE batch_id = $1 AND release_status = 'pending'`,
      [batch.id],
    );
    await client.query(
      `UPDATE institutional_batch_orders SET release_status = 'cancelled'
       WHERE batch_id = $1 AND release_status = 'pending'`,
      [batch.id],
    );
    for (const row of pending) {
      await client.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'approved_unscheduled', updated_by = $2, updated_at = NOW()
         WHERE id = $1 AND lifecycle_status = 'scheduled' AND released_order_id IS NULL`,
        [row.stored_order_id, Number(actorUserId)],
      );
    }
    await client.query(
      `UPDATE institutional_release_batches
       SET status = 'CANCELLED', assigned_order_count = 0, updated_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [batch.id, Number(actorUserId)],
    );
    await writeAudit(client, {
      storageId: batch.storage_id,
      actorUserId,
      action: "batch_cancelled",
      entityType: "batch",
      entityId: batch.id,
    });
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function removeOrderFromBatch({ actorUserId, batchId, storedOrderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batch = await assertBatchEditable(client, batchId);
    const { rowCount } = await client.query(
      `UPDATE institutional_batch_orders
       SET release_status = 'cancelled'
       WHERE batch_id = $1 AND stored_order_id = $2 AND release_status = 'pending'`,
      [batch.id, Number(storedOrderId)],
    );
    if (!rowCount) throw httpError("الطلب غير موجود في هذه الدفعة أو تم إطلاقه.", 409);
    await client.query(
      `UPDATE institutional_stored_orders
       SET lifecycle_status = 'approved_unscheduled', updated_by = $2, updated_at = NOW()
       WHERE id = $1 AND released_order_id IS NULL`,
      [Number(storedOrderId), Number(actorUserId)],
    );
    await client.query(
      `UPDATE institutional_release_batches
       SET assigned_order_count = GREATEST(0, assigned_order_count - 1), updated_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [batch.id, Number(actorUserId)],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function moveOrderToBatch({ actorUserId, storedOrderId, targetBatchId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await assertBatchEditable(client, targetBatchId);
    const { rows: oRows } = await client.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [Number(storedOrderId)],
    );
    const order = oRows[0];
    if (!order) throw httpError("الطلب غير موجود.", 404);
    if (Number(order.storage_id) !== Number(target.storage_id)) {
      throw httpError("الطلب لا ينتمي لنفس المخزن.", 409);
    }
    if (order.lifecycle_status === "released" || order.released_order_id) {
      throw httpError("لا يمكن نقل طلب مطلق.", 409);
    }
    if (!["approved_unscheduled", "scheduled"].includes(order.lifecycle_status)) {
      throw httpError("يمكن نقل الطلبات المعتمدة غير المطلقة فقط.", 409);
    }

    // Leave any other pending batch assignment
    await client.query(
      `UPDATE institutional_batch_orders bo
       SET release_status = 'cancelled'
       FROM institutional_release_batches b
       WHERE bo.batch_id = b.id
         AND bo.stored_order_id = $1
         AND bo.release_status = 'pending'
         AND b.status NOT IN ('RELEASED', 'PROCESSING')`,
      [order.id],
    );

    await client.query(
      `INSERT INTO institutional_batch_orders (batch_id, stored_order_id, position, release_status)
       VALUES ($1, $2, COALESCE((SELECT MAX(position)+1 FROM institutional_batch_orders WHERE batch_id = $1), 0), 'pending')
       ON CONFLICT (batch_id, stored_order_id) DO UPDATE
         SET release_status = 'pending', failure_reason = NULL`,
      [target.id, order.id],
    );
    await client.query(
      `UPDATE institutional_stored_orders
       SET lifecycle_status = 'scheduled', updated_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [order.id, Number(actorUserId)],
    );
    await client.query(
      `UPDATE institutional_release_batches b
       SET assigned_order_count = (
         SELECT COUNT(*)::int FROM institutional_batch_orders bo
         WHERE bo.batch_id = b.id AND bo.release_status = 'pending'
       ),
       updated_by = $2,
       updated_at = NOW()
       WHERE b.storage_id = $1 AND b.status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED', 'CANCELLED')`,
      [target.storage_id, Number(actorUserId)],
    );
    await writeAudit(client, {
      storageId: order.storage_id,
      actorUserId,
      action: "order_moved_to_batch",
      entityType: "stored_order",
      entityId: order.id,
      after: { targetBatchId: target.id },
    });
    await client.query("COMMIT");
    return { ok: true, batchId: String(target.id) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function listBatchOrders(batchId) {
  const { rows } = await pool.query(
    `SELECT bo.*, o.title, o.lifecycle_status, o.order_price_jod, o.released_order_id
     FROM institutional_batch_orders bo
     INNER JOIN institutional_stored_orders o ON o.id = bo.stored_order_id
     WHERE bo.batch_id = $1
     ORDER BY bo.position ASC, o.id ASC`,
    [Number(batchId)],
  );
  return rows.map((r) => ({
    storedOrderId: String(r.stored_order_id),
    title: r.title,
    lifecycleStatus: r.lifecycle_status,
    orderPriceJod: Number(r.order_price_jod),
    releaseStatus: r.release_status,
    releasedOrderId: r.released_order_id != null ? String(r.released_order_id) : null,
    failureReason: r.failure_reason,
    position: Number(r.position),
  }));
}

async function listReleaseLogs({ storageId, limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT * FROM institutional_release_logs
     WHERE storage_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [Number(storageId), lim],
  );
  return rows.map((r) => ({
    id: String(r.id),
    batchId: r.batch_id != null ? String(r.batch_id) : null,
    storedOrderId: r.stored_order_id != null ? String(r.stored_order_id) : null,
    event: r.event,
    success: Boolean(r.success),
    message: r.message,
    metadata: r.metadata || {},
    createdAt: r.created_at,
  }));
}

async function recordSchedulerTick({ status, error = null, summary = {} }) {
  await pool.query(
    `UPDATE institutional_release_scheduler_state
     SET last_tick_at = NOW(),
         last_tick_status = $1,
         last_tick_error = $2,
         last_success_at = CASE WHEN $1 = 'success' THEN NOW() ELSE last_success_at END,
         last_failure_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE last_failure_at END,
         last_result_summary = $3::jsonb,
         updated_at = NOW()
     WHERE id = 1`,
    [status, error, JSON.stringify(summary || {})],
  );
}

async function getSchedulerHealth() {
  const {
    isInstitutionalReleaseIntervalEnabled,
    getInstitutionalReleaseTickMs,
    isInstitutionalReleaseProcessRunning,
  } = require("../config/institutionalReleaseScheduler");

  const { rows: stateRows } = await pool.query(
    `SELECT * FROM institutional_release_scheduler_state WHERE id = 1 LIMIT 1`,
  );
  const state = stateRows[0] || {};
  const { rows: nextDue } = await pool.query(
    `SELECT b.id, b.scheduled_release_at, b.status, b.storage_id, s.name AS storage_name, s.status AS storage_status
     FROM institutional_release_batches b
     INNER JOIN institutional_order_storages s ON s.id = b.storage_id
     WHERE b.status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')
     ORDER BY b.scheduled_release_at ASC
     LIMIT 1`,
  );
  const { rows: overdue } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM institutional_release_batches b
     INNER JOIN institutional_order_storages s ON s.id = b.storage_id
     WHERE b.status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')
       AND b.scheduled_release_at <= NOW()
       AND s.status = 'active'`,
  );
  const { rows: processing } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM institutional_release_batches
     WHERE status = 'PROCESSING'`,
  );
  const { rows: failed } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM institutional_release_batches
     WHERE status IN ('FAILED', 'PARTIALLY_RELEASED')`,
  );
  const { rows: stuck } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM institutional_release_batches
     WHERE status = 'PROCESSING'
       AND updated_at < NOW() - INTERVAL '15 minutes'`,
  );

  const configEnabled = isInstitutionalReleaseIntervalEnabled();
  const processRunning = isInstitutionalReleaseProcessRunning();
  const overdueBatchCount = Number(overdue[0]?.c || 0);
  const processingBatchCount = Number(processing[0]?.c || 0);
  const failedBatchCount = Number(failed[0]?.c || 0);
  const stuckProcessingCount = Number(stuck[0]?.c || 0);

  let schedulerMode = "disabled";
  if (configEnabled) schedulerMode = "in-process";
  else if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    schedulerMode = "external_cron_expected";
  }

  const warnings = [];
  if (overdueBatchCount > 0 && !configEnabled && !processRunning) {
    warnings.push({
      code: "OVERDUE_WHILE_DISABLED",
      messageAr: "توجد دفعات متأخرة بينما المجدول معطّل. فعّل عاملًا واحدًا أو نفّذ الإطلاق يدويًا.",
    });
  }
  if (overdueBatchCount > 0) {
    warnings.push({
      code: "OVERDUE_BATCHES",
      messageAr: `يوجد ${overdueBatchCount} دفعة متأخرة بانتظار الإطلاق.`,
    });
  }
  if (stuckProcessingCount > 0) {
    warnings.push({
      code: "STUCK_PROCESSING",
      messageAr: "توجد دفعات عالقة في حالة المعالجة لأكثر من 15 دقيقة. راجع السجلات أو أعد المحاولة يدويًا.",
    });
  }
  if (state.last_tick_error && state.last_failure_at) {
    const ageMs = Date.now() - new Date(state.last_failure_at).getTime();
    if (Number.isFinite(ageMs) && ageMs < 60 * 60 * 1000) {
      warnings.push({
        code: "RECENT_TICK_ERROR",
        messageAr: "حدث خطأ حديث في المجدول. راجع آخر خطأ أدناه.",
      });
    }
  }
  // Detectable dual-driver hint: process enabled while an external cron secret pattern is present
  // (institutional uses staff auth for manual tick; warn if both in-process is on in production).
  if (configEnabled && String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    warnings.push({
      code: "PRODUCTION_IN_PROCESS",
      messageAr:
        "المجدول داخل العملية مفعّل في الإنتاج. تأكد أنه يعمل على عامل واحد فقط وليس مع كرون خارجي متزامن.",
    });
  }

  return {
    configEnabled,
    processSchedulerEnabled: configEnabled,
    processCurrentlyRunning: processRunning,
    databaseReady: true,
    schedulerMode,
    tickMs: getInstitutionalReleaseTickMs(),
    environmentMode: String(process.env.NODE_ENV || "development"),
    manualExecutionAvailable: true,
    lastTickAt: state.last_tick_at || null,
    lastTickStatus: state.last_tick_status || null,
    lastTickError: state.last_tick_error || null,
    lastSuccessAt: state.last_success_at || null,
    lastFailureAt: state.last_failure_at || null,
    lastResultSummary: state.last_result_summary || {},
    nextDueBatch: nextDue[0]
      ? {
          id: String(nextDue[0].id),
          scheduledReleaseAt: nextDue[0].scheduled_release_at,
          status: nextDue[0].status,
          storageId: String(nextDue[0].storage_id),
          storageName: nextDue[0].storage_name,
          storageStatus: nextDue[0].storage_status,
        }
      : null,
    nextScheduledReleaseAt: nextDue[0]?.scheduled_release_at || null,
    overdueBatchCount,
    processingBatchCount,
    failedBatchCount,
    stuckProcessingCount,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  STATUS_TRANSITIONS,
  validateActivation,
  transitionStorageStatus,
  updateBatchReleaseAt,
  cancelBatch,
  removeOrderFromBatch,
  moveOrderToBatch,
  listBatchOrders,
  listReleaseLogs,
  recordSchedulerTick,
  getSchedulerHealth,
  tryAcquireReleaseLock,
};
