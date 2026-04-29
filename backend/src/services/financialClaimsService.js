const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

const CLAIM_STATUSES = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  FROZEN: "frozen",
  REQUIRES_IN_PERSON_REVIEW: "requires_in_person_review",
  PAID: "paid",
});

const PAYOUT_STATUSES = Object.freeze({
  MISSING_COMPLETION_DATE: "missing_completion_date",
  NOT_DUE_YET: "not_due_yet",
  WITHIN_PAYOUT_WINDOW: "within_payout_window",
  LATE_AFTER_PAYOUT_WINDOW: "late_after_payout_window",
  PAID: "paid",
});

function normalizeCategories(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || "").trim()).filter(Boolean))];
  }
  if (typeof raw === "string") {
    return [...new Set(raw.split(",").map((x) => x.trim()).filter(Boolean))];
  }
  return [];
}

function toIsoDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function computePayoutWindow(actualCompletionDate) {
  const dateOnly = toIsoDateOnly(actualCompletionDate);
  if (!dateOnly) return null;
  const [y, m] = dateOnly.split("-").map((n) => Number(n));
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const start = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(nextYear, nextMonth - 1, 10, 23, 59, 59));
  return { payoutWindowStart: start, payoutWindowEnd: end };
}

function computePayoutStatus({ actualCompletionDate, paidAmount, remainingAmount, now = new Date() }) {
  const paid = Number(paidAmount || 0);
  const remaining = Number(remainingAmount || 0);
  if (paid > 0 && remaining <= 0.000001) return PAYOUT_STATUSES.PAID;

  const window = computePayoutWindow(actualCompletionDate);
  if (!window) return PAYOUT_STATUSES.MISSING_COMPLETION_DATE;
  const nowMs = now.getTime();
  if (nowMs < window.payoutWindowStart.getTime()) return PAYOUT_STATUSES.NOT_DUE_YET;
  if (nowMs <= window.payoutWindowEnd.getTime()) return PAYOUT_STATUSES.WITHIN_PAYOUT_WINDOW;
  return PAYOUT_STATUSES.LATE_AFTER_PAYOUT_WINDOW;
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(value) {
  const n = Number(value || 0);
  return Math.round(n * 100) / 100;
}

function durationValueUnitToMinutes(durationValue, durationUnit) {
  const v = Number(durationValue || 0);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (durationUnit === "days") return Math.round(v * 24 * 60);
  if (durationUnit === "hours") return Math.round(v * 60);
  return Math.round(v);
}

function computeActualExecutionMinutesFromOrder(orderRow) {
  if (!orderRow || typeof orderRow !== "object") return 0;
  const startRaw = orderRow.received_at || orderRow.started_at || orderRow.taken_at || null;
  // Prefer freelancer submission instant when available; otherwise fallback to acceptance instant.
  const endRaw = orderRow.submitted_at || orderRow.accepted_at || null;
  if (!startRaw || !endRaw) return 0;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  const diff = endMs - startMs;
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.max(0, Math.round(diff / (60 * 1000)));
}

async function appendStatusHistory(
  { claimId, oldStatus = null, newStatus, changedBy = null, adminNote = null },
  clientMaybe,
) {
  const runner = clientMaybe || pool;
  await runner.query(
    `INSERT INTO financial_claim_status_history (
      claim_id, old_status, new_status, changed_by, changed_at, admin_note
    ) VALUES ($1, $2, $3, $4, NOW(), $5)`,
    [Number(claimId), oldStatus, newStatus, changedBy ? Number(changedBy) : null, adminNote || null],
  );
}

async function getClaimByIdRaw({ claimId }, clientMaybe) {
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(`SELECT * FROM financial_claims WHERE id = $1 LIMIT 1`, [Number(claimId)]);
  return rows[0] || null;
}

function mapClaimRow(row) {
  if (!row) return null;
  const payoutWindow = computePayoutWindow(row.actual_completion_date);
  return {
    id: String(row.id),
    freelancerId: String(row.freelancer_id),
    projectId: row.project_id ? String(row.project_id) : null,
    orderNumber: row.order_number,
    requestTitle: row.request_title,
    categories: Array.isArray(row.categories) ? row.categories : [],
    durationMinutes: Number(row.duration_minutes || 0),
    actualCompletionDate: row.actual_completion_date || null,
    status: row.status,
    payoutStatus: row.payout_status,
    totalPriceSnapshot: row.total_price_snapshot != null ? Number(row.total_price_snapshot) : null,
    userPercentageSnapshot: row.user_percentage_snapshot != null ? Number(row.user_percentage_snapshot) : null,
    companyPercentageSnapshot: row.company_percentage_snapshot != null ? Number(row.company_percentage_snapshot) : null,
    userAmountSnapshot: row.user_amount_snapshot != null ? Number(row.user_amount_snapshot) : null,
    companyAmountSnapshot: row.company_amount_snapshot != null ? Number(row.company_amount_snapshot) : null,
    paidAmount: Number(row.paid_amount || 0),
    remainingAmount: Number(row.remaining_amount || 0),
    freelancerNote: row.freelancer_note || null,
    adminNote: row.admin_note || null,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payoutWindowStart: payoutWindow ? payoutWindow.payoutWindowStart : null,
    payoutWindowEnd: payoutWindow ? payoutWindow.payoutWindowEnd : null,
  };
}

async function listDoneProjectsForFreelancer({ freelancerUserId, q = "", limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const query = String(q || "").trim();
  const params = [Number(freelancerUserId), lim];
  let qClause = "";
  if (query) {
    params.push(`%${query}%`);
    qClause = `AND (o.order_code ILIKE $3 OR o.title ILIKE $3)`;
  }

  const { rows } = await pool.query(
    `SELECT
       o.id,
       o.order_code,
       o.title,
       o.order_status,
       o.project_type,
       o.source_type,
       o.payment_required,
       o.payment_status,
       o.paid_at,
       o.currency_code,
       o.budget,
       o.payment_amount,
       o.received_at,
       o.started_at,
       o.taken_at,
       o.submitted_at,
       o.accepted_at AS actual_completion_date,
       o.duration_value,
       o.duration_unit,
       o.extra_category_ids,
       c.name AS category_name,
       EXISTS (
         SELECT 1 FROM financial_claims fc
         WHERE fc.freelancer_id = $1
           AND fc.project_id = o.id
       ) AS already_claimed
     FROM orders o
     LEFT JOIN categories c ON c.id = o.category_id
     WHERE o.assigned_freelancer_id = $1
       AND o.order_status = 'completed'
       ${qClause}
     ORDER BY o.id DESC
     LIMIT $2`,
    params,
  );
  const unclaimedRows = rows.filter((r) => !r.already_claimed);
  const extraCategoryIds = [
    ...new Set(
      unclaimedRows
        .flatMap((r) => (Array.isArray(r.extra_category_ids) ? r.extra_category_ids : []))
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  let extraCategoryNameById = {};
  if (extraCategoryIds.length) {
    const { rows: extraCats } = await pool.query(`SELECT id, name FROM categories WHERE id = ANY($1::bigint[])`, [extraCategoryIds]);
    extraCategoryNameById = Object.fromEntries(extraCats.map((c) => [String(c.id), c.name]));
  }

  return unclaimedRows.map((r) => {
    const actualExecutionMinutes = computeActualExecutionMinutesFromOrder(r);
    const plannedMinutes = durationValueUnitToMinutes(r.duration_value, r.duration_unit);
    const categories = [];
    if (r.category_name) categories.push(String(r.category_name));
    if (Array.isArray(r.extra_category_ids)) {
      for (const id of r.extra_category_ids) {
        const name = extraCategoryNameById[String(id)];
        if (name && !categories.includes(name)) categories.push(name);
      }
    }
    return {
      projectId: String(r.id),
      orderNumber: r.order_code || `#${String(r.id)}`,
      requestTitle: r.title,
      orderStatus: r.order_status,
      projectType: r.project_type,
      sourceType: r.source_type || null,
      categories,
      actualCompletionDate: r.actual_completion_date ? toIsoDateOnly(r.actual_completion_date) : null,
      durationMinutes: actualExecutionMinutes > 0 ? actualExecutionMinutes : plannedMinutes,
      totalPriceSnapshot: r.payment_amount != null ? Number(r.payment_amount) : r.budget != null ? Number(r.budget) : null,
      currencyCode: r.currency_code || null,
      paymentRequired: Boolean(r.payment_required),
      paymentStatus: r.payment_status || null,
      paidAt: r.paid_at || null,
      hasMissingCompletionDate: !r.actual_completion_date,
    };
  });
}

async function listClaimsForFreelancer({ freelancerUserId } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM financial_claims
     WHERE freelancer_id = $1
     ORDER BY submitted_at DESC, id DESC`,
    [Number(freelancerUserId)],
  );
  return rows.map(mapClaimRow);
}

async function createFinancialClaimForFreelancer({ freelancerUserId, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mode = String(payload.mode || "manual").trim();
    const freelancerId = Number(freelancerUserId);

    let orderNumber = String(payload.orderNumber || "").trim();
    let requestTitle = String(payload.requestTitle || "").trim();
    let categories = normalizeCategories(payload.categories);
    let durationMinutes = Number(payload.durationMinutes);
    let actualCompletionDate = toIsoDateOnly(payload.actualCompletionDate);
    let projectId = payload.projectId ? Number(payload.projectId) : null;
    const freelancerNote = payload.freelancerNote ? String(payload.freelancerNote).trim() : null;
    let totalPriceSnapshot = parseNumeric(payload.totalPriceSnapshot);
    let userPercentageSnapshot = parseNumeric(payload.userPercentageSnapshot);
    let companyPercentageSnapshot = parseNumeric(payload.companyPercentageSnapshot);

    if (mode === "done_project") {
      if (!projectId || !Number.isInteger(projectId)) {
        const err = new Error("projectId is required for done project claim.");
        err.statusCode = 400;
        throw err;
      }
      const { rows: orderRows } = await client.query(
        `SELECT o.*, c.name AS category_name
         FROM orders o
         LEFT JOIN categories c ON c.id = o.category_id
         WHERE o.id = $1
           AND o.assigned_freelancer_id = $2
         LIMIT 1`,
        [projectId, freelancerId],
      );
      const order = orderRows[0];
      if (!order) {
        const err = new Error("لا يمكن إنشاء مطالبة لهذا المشروع.");
        err.statusCode = 403;
        throw err;
      }
      if (order.order_status !== "completed") {
        const err = new Error("لا يمكن إنشاء مطالبة لمشروع غير مكتمل.");
        err.statusCode = 409;
        throw err;
      }
      const { rowCount: duplicateByProject } = await client.query(
        `SELECT 1 FROM financial_claims WHERE freelancer_id = $1 AND project_id = $2 LIMIT 1`,
        [freelancerId, projectId],
      );
      if (duplicateByProject > 0) {
        const err = new Error("تم إنشاء مطالبة لهذا المشروع مسبقاً.");
        err.statusCode = 409;
        throw err;
      }

      orderNumber = order.order_code || orderNumber || `#${String(order.id)}`;
      requestTitle = order.title || requestTitle;
      categories = order.category_name ? [String(order.category_name)] : categories;
      actualCompletionDate = order.accepted_at ? toIsoDateOnly(order.accepted_at) : actualCompletionDate;
      const actualExecutionMinutes = computeActualExecutionMinutesFromOrder(order);
      durationMinutes =
        Number.isFinite(durationMinutes) && durationMinutes >= 0
          ? durationMinutes
          : actualExecutionMinutes > 0
            ? actualExecutionMinutes
            : durationValueUnitToMinutes(order.duration_value, order.duration_unit);
      totalPriceSnapshot = order.budget != null ? Number(order.budget) : totalPriceSnapshot;
    } else {
      projectId = null;
    }

    if (!actualCompletionDate) {
      const err = new Error("لا يمكن إنشاء مطالبة بدون تاريخ إنجاز فعلي.");
      err.statusCode = 400;
      throw err;
    }
    if (!orderNumber) {
      const err = new Error("رقم الطلب مطلوب.");
      err.statusCode = 400;
      throw err;
    }
    if (!requestTitle) {
      const err = new Error("عنوان الطلب مطلوب.");
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
      const err = new Error("durationMinutes must be >= 0.");
      err.statusCode = 400;
      throw err;
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      const err = new Error("يجب اختيار تصنيف واحد على الأقل.");
      err.statusCode = 400;
      throw err;
    }

    const { rowCount: duplicateByOrder } = await client.query(
      `SELECT 1 FROM financial_claims WHERE freelancer_id = $1 AND order_number = $2 LIMIT 1`,
      [freelancerId, orderNumber],
    );
    if (duplicateByOrder > 0) {
      const err = new Error("لا يمكن تكرار نفس رقم الطلب لنفس المستقل.");
      err.statusCode = 409;
      throw err;
    }

    if (userPercentageSnapshot != null || companyPercentageSnapshot != null) {
      if (userPercentageSnapshot == null || companyPercentageSnapshot == null) {
        const err = new Error("يجب توفير نسبتي المستقل والشركة معاً.");
        err.statusCode = 400;
        throw err;
      }
      if (round2(userPercentageSnapshot + companyPercentageSnapshot) !== 100) {
        const err = new Error("مجموع نسبتي المستقل والشركة يجب أن يساوي 100.");
        err.statusCode = 400;
        throw err;
      }
    }

    const total = totalPriceSnapshot != null ? round2(totalPriceSnapshot) : null;
    const userAmountSnapshot =
      total != null && userPercentageSnapshot != null ? round2((total * userPercentageSnapshot) / 100) : null;
    const companyAmountSnapshot =
      total != null && companyPercentageSnapshot != null ? round2((total * companyPercentageSnapshot) / 100) : null;
    const remainingAmount = userAmountSnapshot != null ? userAmountSnapshot : 0;
    const payoutStatus = computePayoutStatus({
      actualCompletionDate,
      paidAmount: 0,
      remainingAmount,
    });

    const { rows } = await client.query(
      `INSERT INTO financial_claims (
        freelancer_id, project_id, order_number, request_title, categories,
        duration_minutes, actual_completion_date, status, payout_status,
        total_price_snapshot, user_percentage_snapshot, company_percentage_snapshot,
        user_amount_snapshot, company_amount_snapshot, paid_amount, remaining_amount,
        freelancer_note, admin_note, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, 0, $15,
        $16, NULL, NOW(), NULL, NULL, NOW(), NOW()
      )
      RETURNING *`,
      [
        freelancerId,
        projectId,
        orderNumber,
        requestTitle,
        JSON.stringify(categories),
        Number(durationMinutes),
        actualCompletionDate,
        CLAIM_STATUSES.PENDING,
        payoutStatus,
        total,
        userPercentageSnapshot,
        companyPercentageSnapshot,
        userAmountSnapshot,
        companyAmountSnapshot,
        remainingAmount,
        freelancerNote,
      ],
    );

    const created = rows[0];
    await appendStatusHistory(
      {
        claimId: created.id,
        oldStatus: null,
        newStatus: CLAIM_STATUSES.PENDING,
        changedBy: freelancerId,
        adminNote: null,
      },
      client,
    );
    await safeNotify(() =>
      notificationEventsService.notifyFinancialClaimOwner(
        {
          claim: created,
          actorUserId: Number(freelancerId),
          type: "financial_claim.created",
          title: "تم إرسال مطالبتك المالية",
          message: "تم إنشاء المطالبة المالية وهي الآن قيد المراجعة.",
          priority: "high",
          dedupeKey: `financial_claim_created_${String(created.id)}`,
          metadata: { claimId: String(created.id) },
        },
        client,
      ),
    );
    await safeNotify(() =>
      notificationEventsService.notifySuperAdmins(
        {
          recipientRole: "super_admin",
          actorUserId: Number(freelancerId),
          type: "financial_claim.created",
          title: "مطالبة مالية جديدة",
          message: "تم استلام مطالبة مالية جديدة وتحتاج إلى مراجعة.",
          entityType: "financial_claim",
          entityId: Number(created.id),
          link: "/dashboard/super-admin/financial-claims",
          priority: "high",
          metadata: { claimId: String(created.id), freelancerId: String(freelancerId) },
          dedupeKey: `financial_claim_created_${String(created.id)}`,
        },
        client,
      ),
    );

    await client.query("COMMIT");
    return mapClaimRow(created);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listClaimsForSuperAdmin({ q = "", status = "", payoutStatus = "" } = {}) {
  const params = [];
  const where = [];
  if (status) {
    params.push(String(status).trim());
    where.push(`fc.status = $${params.length}`);
  }
  if (payoutStatus) {
    params.push(String(payoutStatus).trim());
    where.push(`fc.payout_status = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(fc.order_number ILIKE $${params.length} OR fc.request_title ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT fc.*, u.first_name, u.father_name, u.family_name, u.email
     FROM financial_claims fc
     JOIN users u ON u.id = fc.freelancer_id
     ${whereSql}
     ORDER BY fc.submitted_at DESC, fc.id DESC`,
    params,
  );
  return rows.map((r) => ({
    ...mapClaimRow(r),
    freelancer: {
      id: String(r.freelancer_id),
      firstName: r.first_name,
      fatherName: r.father_name,
      familyName: r.family_name,
      email: r.email,
    },
  }));
}

async function getClaimDetailsForSuperAdmin({ claimId }) {
  const claim = await getClaimByIdRaw({ claimId });
  if (!claim) return null;
  const { rows: freelancerRows } = await pool.query(
    `SELECT id, first_name, father_name, family_name, email FROM users WHERE id = $1 LIMIT 1`,
    [Number(claim.freelancer_id)],
  );
  const { rows: historyRows } = await pool.query(
    `SELECT h.*, u.first_name, u.father_name, u.family_name, u.email
     FROM financial_claim_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.claim_id = $1
     ORDER BY h.changed_at DESC, h.id DESC`,
    [Number(claimId)],
  );
  const { rows: allocationsRows } = await pool.query(
    `SELECT a.*, p.freelancer_id, p.payment_method, p.payment_reference, p.paid_at, p.status
     FROM financial_freelancer_payment_allocations a
     JOIN financial_freelancer_payments p ON p.id = a.payment_id
     WHERE a.claim_id = $1
     ORDER BY a.id DESC`,
    [Number(claimId)],
  );
  const detail = mapClaimRow(claim);
  return {
    ...detail,
    freelancer: freelancerRows[0]
      ? {
          id: String(freelancerRows[0].id),
          firstName: freelancerRows[0].first_name,
          fatherName: freelancerRows[0].father_name,
          familyName: freelancerRows[0].family_name,
          email: freelancerRows[0].email,
        }
      : null,
    statusHistory: historyRows.map((h) => ({
      id: String(h.id),
      oldStatus: h.old_status,
      newStatus: h.new_status,
      changedAt: h.changed_at,
      adminNote: h.admin_note || null,
      changedBy: h.changed_by
        ? {
            id: String(h.changed_by),
            firstName: h.first_name,
            fatherName: h.father_name,
            familyName: h.family_name,
            email: h.email,
          }
        : null,
    })),
    payments: allocationsRows.map((a) => ({
      allocationId: String(a.id),
      paymentId: String(a.payment_id),
      amountPaid: Number(a.amount_paid),
      paymentMethod: a.payment_method,
      paymentReference: a.payment_reference || null,
      paidAt: a.paid_at,
      paymentStatus: a.status,
    })),
  };
}

async function updateClaimStatusBySuperAdmin({ actorUserId, claimId, newStatus, adminNote = null }) {
  const nextStatus = String(newStatus || "").trim();
  const note = adminNote ? String(adminNote).trim() : "";
  const requiresNote = [
    CLAIM_STATUSES.REJECTED,
    CLAIM_STATUSES.FROZEN,
    CLAIM_STATUSES.REQUIRES_IN_PERSON_REVIEW,
  ].includes(nextStatus);
  if (requiresNote && !note) {
    const err = new Error("ملاحظة الإدارة مطلوبة لهذه الحالة.");
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await getClaimByIdRaw({ claimId }, client);
    if (!row) {
      const err = new Error("المطالبة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    if (nextStatus === CLAIM_STATUSES.ACCEPTED) {
      if (!row.actual_completion_date) {
        const err = new Error("لا يمكن قبول مطالبة بدون تاريخ إنجاز فعلي.");
        err.statusCode = 409;
        throw err;
      }
      if (!(Number(row.total_price_snapshot) > 0)) {
        const err = new Error("لا يمكن قبول مطالبة بدون تسعير صالح.");
        err.statusCode = 409;
        throw err;
      }
    }

    let payoutStatus = row.payout_status;
    if (nextStatus === CLAIM_STATUSES.PAID) {
      payoutStatus = PAYOUT_STATUSES.PAID;
    } else {
      payoutStatus = computePayoutStatus({
        actualCompletionDate: row.actual_completion_date,
        paidAmount: row.paid_amount,
        remainingAmount: row.remaining_amount,
      });
    }

    const { rows } = await client.query(
      `UPDATE financial_claims
       SET status = $2,
           admin_note = $3,
           reviewed_at = NOW(),
           reviewed_by = $4,
           payout_status = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [Number(claimId), nextStatus, note || null, Number(actorUserId), payoutStatus],
    );
    await appendStatusHistory(
      {
        claimId,
        oldStatus: row.status,
        newStatus: nextStatus,
        changedBy: actorUserId,
        adminNote: note || null,
      },
      client,
    );
    await safeNotify(() =>
      notificationEventsService.notifyFinancialClaimOwner(
        {
          claim: rows[0],
          actorUserId: Number(actorUserId),
          type: "financial_claim.status.changed",
          title: "تم تحديث حالة المطالبة المالية",
          message: `تم تحديث حالة المطالبة إلى: ${nextStatus}.`,
          priority: "high",
          dedupeKey: `financial_claim_status_${String(claimId)}_${nextStatus}_${String(rows[0].updated_at)}`,
          metadata: { claimId: String(claimId), status: nextStatus },
        },
        client,
      ),
    );
    await client.query("COMMIT");
    return mapClaimRow(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateClaimPricingBySuperAdmin({
  actorUserId,
  claimId,
  totalPriceSnapshot,
  userPercentageSnapshot,
  companyPercentageSnapshot,
}) {
  const total = parseNumeric(totalPriceSnapshot);
  const userPct = parseNumeric(userPercentageSnapshot);
  const companyPct = parseNumeric(companyPercentageSnapshot);
  if (total == null || total <= 0) {
    const err = new Error("totalPriceSnapshot يجب أن يكون أكبر من 0.");
    err.statusCode = 400;
    throw err;
  }
  if (userPct == null || companyPct == null) {
    const err = new Error("نسبة المستقل ونسبة الشركة مطلوبة.");
    err.statusCode = 400;
    throw err;
  }
  if (userPct < 0 || userPct > 100 || companyPct < 0 || companyPct > 100) {
    const err = new Error("النسب يجب أن تكون بين 0 و100.");
    err.statusCode = 400;
    throw err;
  }
  if (round2(userPct + companyPct) !== 100) {
    const err = new Error("مجموع النسب يجب أن يساوي 100.");
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await getClaimByIdRaw({ claimId }, client);
    if (!claim) {
      const err = new Error("المطالبة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const { rowCount: hasAllocations } = await client.query(
      `SELECT 1 FROM financial_freelancer_payment_allocations WHERE claim_id = $1 LIMIT 1`,
      [Number(claimId)],
    );
    if (hasAllocations > 0) {
      const err = new Error("لا يمكن تعديل التسعير بعد تسجيل دفعات على المطالبة.");
      err.statusCode = 409;
      throw err;
    }

    const userAmount = round2((total * userPct) / 100);
    const companyAmount = round2((total * companyPct) / 100);
    const paidAmount = Number(claim.paid_amount || 0);
    const remaining = round2(Math.max(0, userAmount - paidAmount));
    const payoutStatus = computePayoutStatus({
      actualCompletionDate: claim.actual_completion_date,
      paidAmount,
      remainingAmount: remaining,
    });

    const { rows } = await client.query(
      `UPDATE financial_claims
       SET total_price_snapshot = $2,
           user_percentage_snapshot = $3,
           company_percentage_snapshot = $4,
           user_amount_snapshot = $5,
           company_amount_snapshot = $6,
           remaining_amount = $7,
           payout_status = $8,
           reviewed_by = $9,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [Number(claimId), total, userPct, companyPct, userAmount, companyAmount, remaining, payoutStatus, Number(actorUserId)],
    );
    await safeNotify(() =>
      notificationEventsService.notifyFinancialClaimOwner(
        {
          claim: rows[0],
          actorUserId: Number(actorUserId),
          type: "financial_claim.pricing.updated",
          title: "تم تحديث تسعير المطالبة",
          message: "تم تحديث تفاصيل التسعير والمبلغ المستحق لمطالبتك.",
          priority: "medium",
          dedupeKey: `financial_claim_pricing_${String(claimId)}_${String(rows[0].updated_at)}`,
          metadata: { claimId: String(claimId) },
        },
        client,
      ),
    );
    await client.query("COMMIT");
    return mapClaimRow(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createFreelancerPaymentBySuperAdmin({
  actorUserId,
  freelancerId,
  paymentMethod,
  paymentReference = null,
  paidAt = null,
  claimIds = [],
}) {
  const targetClaimIds = [...new Set((Array.isArray(claimIds) ? claimIds : []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  if (targetClaimIds.length === 0) {
    const err = new Error("يجب تحديد مطالبة واحدة على الأقل.");
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: claims } = await client.query(
      `SELECT * FROM financial_claims WHERE id = ANY($1::bigint[]) FOR UPDATE`,
      [targetClaimIds],
    );
    if (claims.length !== targetClaimIds.length) {
      const err = new Error("بعض المطالبات غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    for (const c of claims) {
      if (Number(c.freelancer_id) !== Number(freelancerId)) {
        const err = new Error("يجب أن تكون كل المطالبات لنفس المستقل.");
        err.statusCode = 409;
        throw err;
      }
      if (![CLAIM_STATUSES.ACCEPTED, CLAIM_STATUSES.REQUIRES_IN_PERSON_REVIEW].includes(c.status)) {
        const err = new Error("المطالبة غير مؤهلة للدفع.");
        err.statusCode = 409;
        throw err;
      }
      if (!c.actual_completion_date) {
        const err = new Error("المطالبة لا تحتوي تاريخ إنجاز فعلي.");
        err.statusCode = 409;
        throw err;
      }
      if (!(Number(c.total_price_snapshot || 0) > 0)) {
        const err = new Error("المطالبة غير مسعّرة بشكل صالح.");
        err.statusCode = 409;
        throw err;
      }
      const payoutStatusNow = computePayoutStatus({
        actualCompletionDate: c.actual_completion_date,
        paidAmount: c.paid_amount,
        remainingAmount: c.remaining_amount,
      });
      if (![PAYOUT_STATUSES.WITHIN_PAYOUT_WINDOW, PAYOUT_STATUSES.LATE_AFTER_PAYOUT_WINDOW].includes(payoutStatusNow)) {
        const err = new Error("لا يمكن الدفع قبل دخول نافذة الاستحقاق.");
        err.statusCode = 409;
        throw err;
      }
      if (!(Number(c.remaining_amount || 0) > 0)) {
        const err = new Error("المطالبة مدفوعة بالكامل مسبقاً.");
        err.statusCode = 409;
        throw err;
      }
      const { rowCount: allocated } = await client.query(
        `SELECT 1 FROM financial_freelancer_payment_allocations WHERE claim_id = $1 LIMIT 1`,
        [Number(c.id)],
      );
      if (allocated > 0) {
        const err = new Error("لا يمكن الدفع الجزئي أو المتكرر لنفس المطالبة.");
        err.statusCode = 409;
        throw err;
      }
    }

    const totalAmount = round2(claims.reduce((sum, c) => sum + Number(c.remaining_amount || 0), 0));
    const paidAtIso = paidAt ? new Date(paidAt) : new Date();
    if (!Number.isFinite(paidAtIso.getTime())) {
      const err = new Error("paidAt غير صالح.");
      err.statusCode = 400;
      throw err;
    }

    const { rows: paymentRows } = await client.query(
      `INSERT INTO financial_freelancer_payments (
        freelancer_id, total_amount, payment_method, payment_reference, paid_at, created_by, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', NOW(), NOW())
      RETURNING *`,
      [Number(freelancerId), totalAmount, String(paymentMethod).trim(), paymentReference ? String(paymentReference).trim() : null, paidAtIso.toISOString(), Number(actorUserId)],
    );
    const payment = paymentRows[0];

    for (const claim of claims) {
      const amountPaid = round2(Number(claim.remaining_amount || 0));
      await client.query(
        `INSERT INTO financial_freelancer_payment_allocations (payment_id, claim_id, amount_paid, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [Number(payment.id), Number(claim.id), amountPaid],
      );
      await client.query(
        `UPDATE financial_claims
         SET paid_amount = paid_amount + $2,
             remaining_amount = 0,
             payout_status = $3,
             status = $4,
             admin_note = COALESCE(admin_note, 'تم الدفع بالكامل.'),
             reviewed_at = NOW(),
             reviewed_by = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [Number(claim.id), amountPaid, PAYOUT_STATUSES.PAID, CLAIM_STATUSES.PAID, Number(actorUserId)],
      );
      await appendStatusHistory(
        {
          claimId: claim.id,
          oldStatus: claim.status,
          newStatus: CLAIM_STATUSES.PAID,
          changedBy: actorUserId,
          adminNote: "تم تسجيل دفعة وإغلاق المطالبة كمدفوعة.",
        },
        client,
      );
      await safeNotify(() =>
        notificationEventsService.notifyFinancialClaimOwner(
          {
            claim: { ...claim, id: claim.id, freelancer_id: claim.freelancer_id },
            actorUserId: Number(actorUserId),
            type: "financial_claim.paid",
            title: "تم دفع مستحقات المطالبة",
            message: "تم تسجيل عملية الدفع وإغلاق المطالبة كمدفوعة.",
            priority: "critical",
            dedupeKey: `financial_claim_paid_${String(claim.id)}`,
            metadata: { claimId: String(claim.id), paymentId: String(payment.id) },
          },
          client,
        ),
      );
    }

    await client.query("COMMIT");
    return {
      payment: {
        id: String(payment.id),
        freelancerId: String(payment.freelancer_id),
        totalAmount: Number(payment.total_amount),
        paymentMethod: payment.payment_method,
        paymentReference: payment.payment_reference || null,
        paidAt: payment.paid_at,
        createdBy: String(payment.created_by),
        status: payment.status,
      },
      allocations: claims.map((c) => ({
        claimId: String(c.id),
        amountPaid: Number(c.remaining_amount),
      })),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  CLAIM_STATUSES,
  PAYOUT_STATUSES,
  computePayoutStatus,
  computePayoutWindow,
  listDoneProjectsForFreelancer,
  listClaimsForFreelancer,
  createFinancialClaimForFreelancer,
  listClaimsForSuperAdmin,
  getClaimDetailsForSuperAdmin,
  updateClaimStatusBySuperAdmin,
  updateClaimPricingBySuperAdmin,
  createFreelancerPaymentBySuperAdmin,
};
