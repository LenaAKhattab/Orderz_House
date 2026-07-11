const { pool } = require("../config/db");
const { mapSubscription } = require("./subscriptionsService");
const { createPublicApiError } = require("../utils/publicApiError");
const {
  roundMoney,
  calcStripeFeeAmount,
  calcNetAfterStripe,
  calcBonusPoolAmount,
  calcAllocationAmount,
  sumPercentages,
  toNum,
} = require("../utils/moneyMath");
const { logFinancialAudit, listAuditLogsForEntity } = require("./financialCenterAuditService");
const {
  createLoginAccountForPerson,
  assertEmailAvailable,
} = require("./financialCenterAccountService");
const { assertActiveDepartmentId } = require("./financialDepartmentService");

const PERSON_STATUSES = new Set(["active", "inactive"]);
const ROW_STATUSES = new Set(["draft", "approved", "paid", "unpaid", "cancelled"]);
const SOURCE_TYPES = new Set(["manual", "subscription_payment", "order_payment"]);
const RECEIVED_STATUSES = new Set(["received", "not_received", "partially_received"]);
const ALLOCATION_PAID_STATUSES = new Set(["unpaid", "paid", "held"]);

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function mapPerson(row) {
  if (!row) return null;
  const hasAccount = row.user_id != null;
  return {
    id: String(row.id),
    userId: row.user_id != null ? String(row.user_id) : null,
    fullName: row.full_name,
    email: row.email || null,
    phone: row.phone || null,
    jobTitle: row.job_title || null,
    departmentId: row.department_id != null ? String(row.department_id) : null,
    departmentName: row.department_name || row.department || null,
    departmentSlug: row.department_slug || null,
    department: row.department_name || row.department || null,
    paymentMethod: row.payment_method || null,
    paymentDetails: row.payment_details || null,
    notes: row.notes || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalBonus: row.total_bonus != null ? roundMoney(row.total_bonus) : undefined,
    totalPaid: row.total_paid != null ? roundMoney(row.total_paid) : undefined,
    totalUnpaid: row.total_unpaid != null ? roundMoney(row.total_unpaid) : undefined,
    lastBonusAt: row.last_bonus_at || null,
    loginEmail: row.login_email || null,
    accountIsActive: hasAccount ? Boolean(row.account_is_active) : null,
    accountStatus: !hasAccount ? "none" : row.account_is_active ? "active" : "suspended",
    accountCreatedAt: row.account_created_at || null,
  };
}

function mapAllocation(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    bonusRowId: String(row.bonus_row_id),
    personId: String(row.person_id),
    personName: row.person_name || null,
    percentageShare: roundMoney(row.percentage_share),
    calculatedAmount: roundMoney(row.calculated_amount),
    paidStatus: row.paid_status,
    paidAt: row.paid_at || null,
    note: row.note || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBonusRow(row, allocations = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    monthKey: row.month_key,
    note: row.note || null,
    sourceType: row.source_type,
    sourceRefId: row.source_ref_id != null ? String(row.source_ref_id) : null,
    sourceLabel: row.source_label || null,
    grossAmount: roundMoney(row.gross_amount),
    currency: row.currency || "JOD",
    stripeDeductionEnabled: Boolean(row.stripe_deduction_enabled),
    stripePercentage: roundMoney(row.stripe_percentage),
    stripeFixedFee: roundMoney(row.stripe_fixed_fee),
    stripeFeeAmount: roundMoney(row.stripe_fee_amount),
    netAmountAfterStripe: roundMoney(row.net_amount_after_stripe),
    bonusPercentage: roundMoney(row.bonus_percentage),
    bonusPoolAmount: roundMoney(row.bonus_pool_amount),
    receivedStatus: row.received_status,
    receivedAmount: row.received_amount != null ? roundMoney(row.received_amount) : null,
    receivedAt: row.received_at || null,
    receivedNote: row.received_note || null,
    status: row.status,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    updatedBy: row.updated_by != null ? String(row.updated_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    beneficiaryCount: row.beneficiary_count != null ? Number(row.beneficiary_count) : allocations.length,
    allocations,
  };
}

function assertMonthKey(monthKey) {
  const m = String(monthKey || "").trim();
  if (!MONTH_KEY_RE.test(m)) {
    throw createPublicApiError("صيغة الشهر غير صالحة (مثال: 2026-07).", 400, "VALIDATION_ERROR");
  }
  return m;
}

function computeRowAmounts(payload) {
  const grossAmount = roundMoney(payload.grossAmount);
  if (grossAmount <= 0) {
    throw createPublicApiError("المبلغ الأصلي يجب أن يكون أكبر من صفر.", 400, "VALIDATION_ERROR");
  }
  const stripeDeductionEnabled = Boolean(payload.stripeDeductionEnabled);
  const stripePercentage = roundMoney(payload.stripePercentage || 0);
  const stripeFixedFee = roundMoney(payload.stripeFixedFee || 0);
  const bonusPercentage = roundMoney(payload.bonusPercentage || 0);

  if (stripePercentage < 0 || stripePercentage > 100) {
    throw createPublicApiError("نسبة Stripe يجب أن تكون بين 0 و 100.", 400, "VALIDATION_ERROR");
  }
  if (stripeFixedFee < 0) {
    throw createPublicApiError("الرسوم الثابتة لا يمكن أن تكون سالبة.", 400, "VALIDATION_ERROR");
  }
  if (bonusPercentage < 0 || bonusPercentage > 100) {
    throw createPublicApiError("نسبة البونص يجب أن تكون بين 0 و 100.", 400, "VALIDATION_ERROR");
  }

  const stripeFeeAmount = stripeDeductionEnabled
    ? calcStripeFeeAmount(grossAmount, stripePercentage, stripeFixedFee)
    : 0;
  const netAmountAfterStripe = calcNetAfterStripe(
    grossAmount,
    stripeDeductionEnabled,
    stripePercentage,
    stripeFixedFee,
  );
  const bonusPoolAmount = calcBonusPoolAmount(netAmountAfterStripe, bonusPercentage);

  return {
    grossAmount,
    stripeDeductionEnabled,
    stripePercentage,
    stripeFixedFee,
    stripeFeeAmount,
    netAmountAfterStripe,
    bonusPercentage,
    bonusPoolAmount,
  };
}

function normalizeAllocationsInput(allocations, bonusPoolAmount) {
  const list = Array.isArray(allocations) ? allocations : [];
  const seen = new Set();
  const out = [];

  for (const raw of list) {
    const personId = Number(raw.personId);
    const percentageShare = roundMoney(raw.percentageShare);
    if (!Number.isInteger(personId) || personId < 1) {
      throw createPublicApiError("معرّف الموظف غير صالح في التوزيع.", 400, "VALIDATION_ERROR");
    }
    if (seen.has(personId)) {
      throw createPublicApiError("لا يمكن تكرار نفس الموظف في نفس صف البونص.", 400, "VALIDATION_ERROR");
    }
    if (percentageShare <= 0 || percentageShare > 100) {
      throw createPublicApiError("نسبة التوزيع يجب أن تكون بين 0 و 100.", 400, "VALIDATION_ERROR");
    }
    seen.add(personId);
    out.push({
      personId,
      percentageShare,
      calculatedAmount: calcAllocationAmount(bonusPoolAmount, percentageShare),
      paidStatus: ALLOCATION_PAID_STATUSES.has(raw.paidStatus) ? raw.paidStatus : "unpaid",
      paidAt: raw.paidAt || null,
      note: raw.note ? String(raw.note).trim() : null,
    });
  }

  const totalPct = sumPercentages(out);
  if (totalPct > 100) {
    throw createPublicApiError("مجموع نسب التوزيع يتجاوز 100%.", 400, "VALIDATION_ERROR");
  }
  return { allocations: out, totalPct };
}

function assertRowEditable(row) {
  if (!row) throw createPublicApiError("صف البونص غير موجود.", 404, "NOT_FOUND");
  if (row.status === "paid") {
    throw createPublicApiError("لا يمكن تعديل صف مدفوع.", 403, "FORBIDDEN");
  }
  if (row.status === "cancelled") {
    throw createPublicApiError("لا يمكن تعديل صف ملغي.", 403, "FORBIDDEN");
  }
}

async function fetchAllocationsForRow(bonusRowId, client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT a.*, p.full_name AS person_name
     FROM financial_bonus_allocations a
     JOIN financial_people p ON p.id = a.person_id
     WHERE a.bonus_row_id = $1
     ORDER BY a.id ASC`,
    [Number(bonusRowId)],
  );
  return rows.map(mapAllocation);
}

async function listPeople({ q = "", status = "", limit = 50, offset = 0 } = {}) {
  const params = [];
  const where = ["TRUE"];
  const qTrim = String(q || "").trim();
  if (qTrim) {
    params.push(`%${qTrim.toLowerCase()}%`);
    where.push(
      `(LOWER(p.full_name) LIKE $${params.length} OR LOWER(COALESCE(p.email,'')) LIKE $${params.length} OR COALESCE(p.phone,'') LIKE $${params.length})`,
    );
  }
  if (status && PERSON_STATUSES.has(status)) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const whereSql = where.join(" AND ");

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM financial_people p
     WHERE ${whereSql}`,
    params,
  );
  const total = countRes.rows[0]?.total ?? 0;

  const listParams = [...params, lim, off];
  const { rows } = await pool.query(
    `SELECT p.*,
            u.email AS login_email,
            u.is_active AS account_is_active,
            fd.name AS department_name,
            fd.slug AS department_slug,
            COALESCE(SUM(a.calculated_amount), 0)::numeric AS total_bonus,
            COALESCE(SUM(a.calculated_amount) FILTER (WHERE a.paid_status = 'paid'), 0)::numeric AS total_paid,
            COALESCE(SUM(a.calculated_amount) FILTER (WHERE a.paid_status != 'paid'), 0)::numeric AS total_unpaid,
            MAX(br.created_at) AS last_bonus_at
     FROM financial_people p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN financial_departments fd ON fd.id = p.department_id
     LEFT JOIN financial_bonus_allocations a ON a.person_id = p.id
     LEFT JOIN financial_bonus_rows br ON br.id = a.bonus_row_id AND br.status != 'cancelled'
     WHERE ${whereSql}
     GROUP BY p.id, u.email, u.is_active, fd.name, fd.slug
     ORDER BY p.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { items: rows.map(mapPerson), total, limit: lim, offset: off };
}

async function getPersonById(id) {
  const personId = Number(id);
  const { rows } = await pool.query(
    `SELECT p.*,
            u.email AS login_email,
            u.is_active AS account_is_active,
            fd.name AS department_name,
            fd.slug AS department_slug,
            COALESCE(SUM(a.calculated_amount), 0)::numeric AS total_bonus,
            COALESCE(SUM(a.calculated_amount) FILTER (WHERE a.paid_status = 'paid'), 0)::numeric AS total_paid,
            COALESCE(SUM(a.calculated_amount) FILTER (WHERE a.paid_status != 'paid'), 0)::numeric AS total_unpaid,
            MAX(br.created_at) AS last_bonus_at
     FROM financial_people p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN financial_departments fd ON fd.id = p.department_id
     LEFT JOIN financial_bonus_allocations a ON a.person_id = p.id
     LEFT JOIN financial_bonus_rows br ON br.id = a.bonus_row_id AND br.status != 'cancelled'
     WHERE p.id = $1
     GROUP BY p.id, u.email, u.is_active, fd.name, fd.slug`,
    [personId],
  );
  return mapPerson(rows[0]);
}

async function createPerson({ actorUserId, payload }) {
  const fullName = String(payload.fullName || "").trim();
  if (!fullName) throw createPublicApiError("الاسم الكامل مطلوب.", 400, "VALIDATION_ERROR");
  const status = PERSON_STATUSES.has(payload.status) ? payload.status : "active";
  const departmentId = await assertActiveDepartmentId(payload.departmentId);

  const wantsAccount = Boolean(payload.createLoginAccount);
  if (wantsAccount) {
    const loginEmail = payload.loginEmail || payload.email;
    if (!loginEmail) {
      throw createPublicApiError("البريد الإلكتروني لتسجيل الدخول مطلوب.", 400, "VALIDATION_ERROR");
    }
    if (!payload.password) {
      throw createPublicApiError("كلمة المرور مطلوبة لإنشاء حساب الدخول.", 400, "VALIDATION_ERROR");
    }
    await assertEmailAvailable(loginEmail);
  }

  const client = wantsAccount ? await pool.connect() : null;
  try {
    if (client) await client.query("BEGIN");

    const runner = client || pool;
    const { rows } = await runner.query(
      `INSERT INTO financial_people (
        user_id, full_name, email, phone, job_title, department_id, department,
        payment_method, payment_details, notes, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,(SELECT name FROM financial_departments WHERE id = $6),$7,$8,$9,$10,$11,$11)
      RETURNING *`,
      [
        payload.userId ? Number(payload.userId) : null,
        fullName,
        payload.email ? String(payload.email).trim() : null,
        payload.phone ? String(payload.phone).trim() : null,
        payload.jobTitle ? String(payload.jobTitle).trim() : null,
        departmentId,
        payload.paymentMethod ? String(payload.paymentMethod).trim() : null,
        payload.paymentDetails ? String(payload.paymentDetails).trim() : null,
        payload.notes ? String(payload.notes).trim() : null,
        status,
        actorUserId,
      ],
    );
    const personId = rows[0].id;
    const insertedPerson = mapPerson(rows[0]);
    await logFinancialAudit(
      {
        entityType: "financial_person",
        entityId: personId,
        action: "create",
        oldValue: null,
        newValue: insertedPerson,
        actorId: actorUserId,
      },
      client,
    );

    if (wantsAccount) {
      await createLoginAccountForPerson({
        actorUserId,
        personId,
        loginEmail: payload.loginEmail || payload.email,
        password: payload.password,
        fullName,
        client,
      });
      await client.query("COMMIT");
      return getPersonById(personId);
    }

    return insertedPerson;
  } catch (e) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    if (client) client.release();
  }
}

async function updatePerson({ actorUserId, id, payload }) {
  const existing = await getPersonById(id);
  if (!existing) throw createPublicApiError("الموظف غير موجود.", 404, "NOT_FOUND");

  const fullName = payload.fullName != null ? String(payload.fullName).trim() : existing.fullName;
  if (!fullName) throw createPublicApiError("الاسم الكامل مطلوب.", 400, "VALIDATION_ERROR");

  const nextDepartmentId =
    payload.departmentId !== undefined
      ? await assertActiveDepartmentId(payload.departmentId)
      : existing.departmentId
        ? Number(existing.departmentId)
        : null;

  const { rows } = await pool.query(
    `UPDATE financial_people SET
      user_id = COALESCE($2, user_id),
      full_name = $3,
      email = $4,
      phone = $5,
      job_title = $6,
      department_id = $7,
      department = (SELECT name FROM financial_departments WHERE id = $7),
      payment_method = $8,
      payment_details = $9,
      notes = $10,
      status = COALESCE($11, status),
      updated_by = $12,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [
      Number(id),
      payload.userId !== undefined ? (payload.userId ? Number(payload.userId) : null) : existing.userId,
      fullName,
      payload.email !== undefined ? (payload.email ? String(payload.email).trim() : null) : existing.email,
      payload.phone !== undefined ? (payload.phone ? String(payload.phone).trim() : null) : existing.phone,
      payload.jobTitle !== undefined ? (payload.jobTitle ? String(payload.jobTitle).trim() : null) : existing.jobTitle,
      nextDepartmentId,
      payload.paymentMethod !== undefined ? (payload.paymentMethod ? String(payload.paymentMethod).trim() : null) : existing.paymentMethod,
      payload.paymentDetails !== undefined ? (payload.paymentDetails ? String(payload.paymentDetails).trim() : null) : existing.paymentDetails,
      payload.notes !== undefined ? (payload.notes ? String(payload.notes).trim() : null) : existing.notes,
      payload.status && PERSON_STATUSES.has(payload.status) ? payload.status : null,
      actorUserId,
    ],
  );
  const person = await getPersonById(id);
  await logFinancialAudit({
    entityType: "financial_person",
    entityId: person.id,
    action: "update",
    oldValue: existing,
    newValue: person,
    actorId: actorUserId,
  });
  return person;
}

async function deactivatePerson({ actorUserId, id }) {
  return updatePerson({ actorUserId, id, payload: { status: "inactive" } });
}

async function listBonusRows({
  month = "",
  status = "",
  sourceType = "",
  receivedStatus = "",
  q = "",
  limit = 50,
  offset = 0,
} = {}) {
  const params = [];
  const where = ["TRUE"];
  if (month) {
    params.push(assertMonthKey(month));
    where.push(`br.month_key = $${params.length}`);
  }
  if (status && ROW_STATUSES.has(status)) {
    if (status === "unpaid") {
      where.push(`br.status IN ('unpaid', 'approved')`);
    } else {
      params.push(status);
      where.push(`br.status = $${params.length}`);
    }
  }
  if (sourceType && SOURCE_TYPES.has(sourceType)) {
    params.push(sourceType);
    where.push(`br.source_type = $${params.length}`);
  }
  if (receivedStatus && RECEIVED_STATUSES.has(receivedStatus)) {
    params.push(receivedStatus);
    where.push(`br.received_status = $${params.length}`);
  }
  const qTrim = String(q || "").trim();
  if (qTrim) {
    params.push(`%${qTrim.toLowerCase()}%`);
    where.push(`(LOWER(br.title) LIKE $${params.length} OR LOWER(COALESCE(br.note,'')) LIKE $${params.length})`);
  }
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const whereSql = where.join(" AND ");

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM financial_bonus_rows br
     WHERE ${whereSql}`,
    params,
  );
  const total = countRes.rows[0]?.total ?? 0;

  const listParams = [...params, lim, off];
  const { rows } = await pool.query(
    `SELECT br.*, COUNT(a.id)::int AS beneficiary_count
     FROM financial_bonus_rows br
     LEFT JOIN financial_bonus_allocations a ON a.bonus_row_id = br.id
     WHERE ${whereSql}
     GROUP BY br.id
     ORDER BY br.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { items: rows.map((r) => mapBonusRow(r)), total, limit: lim, offset: off };
}

async function getBonusRowById(id, { includeAllocations = true, includeAudit = false } = {}) {
  const { rows } = await pool.query(`SELECT * FROM financial_bonus_rows WHERE id = $1`, [Number(id)]);
  if (!rows[0]) return null;
  const allocations = includeAllocations ? await fetchAllocationsForRow(id) : [];
  const row = mapBonusRow(rows[0], allocations);
  if (includeAudit) {
    row.auditLogs = await listAuditLogsForEntity({ entityType: "financial_bonus_row", entityId: id });
  }
  return row;
}

async function insertAllocations(client, bonusRowId, allocations) {
  for (const a of allocations) {
    await client.query(
      `INSERT INTO financial_bonus_allocations (
        bonus_row_id, person_id, percentage_share, calculated_amount, paid_status, paid_at, note
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        Number(bonusRowId),
        a.personId,
        a.percentageShare,
        a.calculatedAmount,
        a.paidStatus || "unpaid",
        a.paidAt || null,
        a.note || null,
      ],
    );
  }
}

async function createBonusRow({ actorUserId, payload }) {
  const monthKey = assertMonthKey(payload.monthKey || payload.month);
  const title = String(payload.title || "").trim();
  if (!title) throw createPublicApiError("عنوان العملية مطلوب.", 400, "VALIDATION_ERROR");
  const sourceType = String(payload.sourceType || "manual");
  if (!SOURCE_TYPES.has(sourceType)) {
    throw createPublicApiError("نوع مصدر المبلغ غير صالح.", 400, "VALIDATION_ERROR");
  }

  const amounts = computeRowAmounts(payload);
  const { allocations, totalPct } = normalizeAllocationsInput(payload.allocations, amounts.bonusPoolAmount);
  const targetStatus =
    payload.status && ROW_STATUSES.has(payload.status)
      ? payload.status
      : allocations.length > 0 && totalPct <= 100 && totalPct === 100
        ? "unpaid"
        : "draft";
  if ((targetStatus === "unpaid" || targetStatus === "approved" || targetStatus === "paid") && allocations.length === 0) {
    throw createPublicApiError("لا يمكن تفعيل صف بدون توزيعات.", 400, "VALIDATION_ERROR");
  }
  if ((targetStatus === "unpaid" || targetStatus === "approved" || targetStatus === "paid") && totalPct > 100) {
    throw createPublicApiError("مجموع نسب التوزيع يتجاوز 100%.", 400, "VALIDATION_ERROR");
  }

  const receivedStatus = RECEIVED_STATUSES.has(payload.receivedStatus) ? payload.receivedStatus : "not_received";
  const receivedAmount = payload.receivedAmount != null ? roundMoney(payload.receivedAmount) : null;
  if (receivedAmount != null && receivedAmount > amounts.grossAmount) {
    throw createPublicApiError("مبلغ الاستلام لا يمكن أن يتجاوز المبلغ الأصلي.", 400, "VALIDATION_ERROR");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO financial_bonus_rows (
        title, month_key, note, source_type, source_ref_id, source_label,
        gross_amount, currency, stripe_deduction_enabled, stripe_percentage, stripe_fixed_fee,
        stripe_fee_amount, net_amount_after_stripe, bonus_percentage, bonus_pool_amount,
        received_status, received_amount, received_at, received_note, status,
        created_by, updated_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'JOD',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20
      ) RETURNING *`,
      [
        title,
        monthKey,
        payload.note ? String(payload.note).trim() : null,
        sourceType,
        payload.sourceRefId ? Number(payload.sourceRefId) : null,
        payload.sourceLabel ? String(payload.sourceLabel).trim() : null,
        amounts.grossAmount,
        amounts.stripeDeductionEnabled,
        amounts.stripePercentage,
        amounts.stripeFixedFee,
        amounts.stripeFeeAmount,
        amounts.netAmountAfterStripe,
        amounts.bonusPercentage,
        amounts.bonusPoolAmount,
        receivedStatus,
        receivedAmount,
        payload.receivedAt || null,
        payload.receivedNote ? String(payload.receivedNote).trim() : null,
        targetStatus,
        actorUserId,
      ],
    );
    const rowId = rows[0].id;
    if (allocations.length) await insertAllocations(client, rowId, allocations);
    await logFinancialAudit(
      {
        entityType: "financial_bonus_row",
        entityId: rowId,
        action: "create",
        oldValue: null,
        newValue: mapBonusRow(rows[0], allocations),
        actorId: actorUserId,
      },
      client,
    );
    await client.query("COMMIT");
    return getBonusRowById(rowId, { includeAudit: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function updateBonusRow({ actorUserId, id, payload, auditAction }) {
  const existingRows = await pool.query(`SELECT * FROM financial_bonus_rows WHERE id = $1`, [Number(id)]);
  assertRowEditable(existingRows.rows[0]);
  const existing = mapBonusRow(existingRows.rows[0], await fetchAllocationsForRow(id));

  const merged = {
    grossAmount: payload.grossAmount ?? existing.grossAmount,
    stripeDeductionEnabled: payload.stripeDeductionEnabled ?? existing.stripeDeductionEnabled,
    stripePercentage: payload.stripePercentage ?? existing.stripePercentage,
    stripeFixedFee: payload.stripeFixedFee ?? existing.stripeFixedFee,
    bonusPercentage: payload.bonusPercentage ?? existing.bonusPercentage,
  };
  const amounts = computeRowAmounts(merged);
  const allocationsInput = payload.allocations != null ? payload.allocations : existing.allocations;
  const { allocations, totalPct } = normalizeAllocationsInput(allocationsInput, amounts.bonusPoolAmount);

  const nextStatus = payload.status && ROW_STATUSES.has(payload.status) ? payload.status : existing.status;
  if ((nextStatus === "unpaid" || nextStatus === "approved" || nextStatus === "paid") && allocations.length === 0) {
    throw createPublicApiError("لا يمكن تفعيل صف بدون توزيعات.", 400, "VALIDATION_ERROR");
  }
  if ((nextStatus === "unpaid" || nextStatus === "approved" || nextStatus === "paid") && totalPct > 100) {
    throw createPublicApiError("مجموع نسب التوزيع يتجاوز 100%.", 400, "VALIDATION_ERROR");
  }

  const receivedAmount =
    payload.receivedAmount !== undefined
      ? payload.receivedAmount != null
        ? roundMoney(payload.receivedAmount)
        : null
      : existing.receivedAmount;
  if (receivedAmount != null && receivedAmount > amounts.grossAmount) {
    throw createPublicApiError("مبلغ الاستلام لا يمكن أن يتجاوز المبلغ الأصلي.", 400, "VALIDATION_ERROR");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE financial_bonus_rows SET
        title = COALESCE($2, title),
        month_key = COALESCE($3, month_key),
        note = COALESCE($4, note),
        source_type = COALESCE($5, source_type),
        source_ref_id = COALESCE($6, source_ref_id),
        source_label = COALESCE($7, source_label),
        gross_amount = $8,
        stripe_deduction_enabled = $9,
        stripe_percentage = $10,
        stripe_fixed_fee = $11,
        stripe_fee_amount = $12,
        net_amount_after_stripe = $13,
        bonus_percentage = $14,
        bonus_pool_amount = $15,
        received_status = COALESCE($16, received_status),
        received_amount = $17,
        received_at = COALESCE($18, received_at),
        received_note = COALESCE($19, received_note),
        status = $20,
        updated_by = $21,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [
        Number(id),
        payload.title != null ? String(payload.title).trim() : null,
        payload.monthKey ? assertMonthKey(payload.monthKey) : null,
        payload.note !== undefined ? (payload.note ? String(payload.note).trim() : null) : null,
        payload.sourceType || null,
        payload.sourceRefId !== undefined ? (payload.sourceRefId ? Number(payload.sourceRefId) : null) : null,
        payload.sourceLabel !== undefined ? (payload.sourceLabel ? String(payload.sourceLabel).trim() : null) : null,
        amounts.grossAmount,
        amounts.stripeDeductionEnabled,
        amounts.stripePercentage,
        amounts.stripeFixedFee,
        amounts.stripeFeeAmount,
        amounts.netAmountAfterStripe,
        amounts.bonusPercentage,
        amounts.bonusPoolAmount,
        payload.receivedStatus && RECEIVED_STATUSES.has(payload.receivedStatus) ? payload.receivedStatus : null,
        receivedAmount,
        payload.receivedAt !== undefined ? payload.receivedAt : null,
        payload.receivedNote !== undefined ? (payload.receivedNote ? String(payload.receivedNote).trim() : null) : null,
        nextStatus,
        actorUserId,
      ],
    );

    if (payload.allocations != null) {
      await client.query(`DELETE FROM financial_bonus_allocations WHERE bonus_row_id = $1`, [Number(id)]);
      if (allocations.length) await insertAllocations(client, id, allocations);
    }

    const updated = mapBonusRow(rows[0], allocations);
    await logFinancialAudit(
      {
        entityType: "financial_bonus_row",
        entityId: id,
        action: auditAction || "update_bonus_row",
        oldValue: existing,
        newValue: updated,
        actorId: actorUserId,
      },
      client,
    );
    await client.query("COMMIT");
    return getBonusRowById(id, { includeAudit: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function transitionBonusRow({ actorUserId, id, action, payload = {} }) {
  const row = await getBonusRowById(id);
  if (!row) throw createPublicApiError("صف البونص غير موجود.", 404, "NOT_FOUND");

  if (action === "approve") {
    if (row.status === "cancelled") throw createPublicApiError("لا يمكن اعتماد صف ملغي.", 400, "VALIDATION_ERROR");
    if (!row.allocations?.length) throw createPublicApiError("لا يمكن اعتماد صف بدون توزيعات.", 400, "VALIDATION_ERROR");
    const totalPct = sumPercentages(row.allocations);
    if (totalPct > 100) throw createPublicApiError("مجموع نسب التوزيع يتجاوز 100%.", 400, "VALIDATION_ERROR");
    return updateBonusRow({ actorUserId, id, payload: { status: "approved" } });
  }

  if (action === "cancel") {
    if (row.status === "paid") throw createPublicApiError("لا يمكن إلغاء صف مدفوع.", 400, "VALIDATION_ERROR");
    return updateBonusRow({ actorUserId, id, payload: { status: "cancelled" } });
  }

  if (action === "mark-received") {
    if (row.status === "cancelled") {
      throw createPublicApiError("لا يمكن تحديث حالة الاستلام لصف ملغي.", 400, "VALIDATION_ERROR");
    }
    const receivedStatus = RECEIVED_STATUSES.has(payload.receivedStatus) ? payload.receivedStatus : "received";
    let receivedAmount;
    if (receivedStatus === "not_received") {
      receivedAmount = 0;
    } else if (receivedStatus === "partially_received") {
      if (payload.receivedAmount == null) {
        throw createPublicApiError("مبلغ الاستلام مطلوب للاستلام الجزئي.", 400, "VALIDATION_ERROR");
      }
      receivedAmount = roundMoney(payload.receivedAmount);
      if (receivedAmount <= 0) {
        throw createPublicApiError("مبلغ الاستلام الجزئي يجب أن يكون أكبر من صفر.", 400, "VALIDATION_ERROR");
      }
      if (receivedAmount >= row.grossAmount) {
        throw createPublicApiError("مبلغ الاستلام الجزئي يجب أن يكون أقل من المبلغ الأصلي.", 400, "VALIDATION_ERROR");
      }
    } else {
      receivedAmount =
        payload.receivedAmount != null ? roundMoney(payload.receivedAmount) : roundMoney(row.grossAmount);
      if (receivedAmount > row.grossAmount) {
        throw createPublicApiError("مبلغ الاستلام لا يمكن أن يتجاوز المبلغ الأصلي.", 400, "VALIDATION_ERROR");
      }
    }
    return updateBonusRow({
      actorUserId,
      id,
      payload: {
        receivedStatus,
        receivedAmount,
        receivedAt: receivedStatus === "not_received" ? null : payload.receivedAt || new Date().toISOString(),
        receivedNote: payload.receivedNote || null,
      },
      auditAction: "mark_received",
    });
  }

  if (action === "mark-paid") {
    if (row.status === "cancelled") throw createPublicApiError("لا يمكن تعليم صف ملغي كمدفوع.", 400, "VALIDATION_ERROR");
    return updateBonusRow({ actorUserId, id, payload: { status: "paid" } });
  }

  throw createPublicApiError("إجراء غير معروف.", 400, "VALIDATION_ERROR");
}

async function updateAllocation({ actorUserId, allocationId, payload }) {
  const { rows } = await pool.query(
    `SELECT a.*, br.status AS row_status
     FROM financial_bonus_allocations a
     JOIN financial_bonus_rows br ON br.id = a.bonus_row_id
     WHERE a.id = $1`,
    [Number(allocationId)],
  );
  const row = rows[0];
  if (!row) throw createPublicApiError("التوزيع غير موجود.", 404, "NOT_FOUND");
  if (row.row_status === "cancelled" || row.row_status === "paid") {
    throw createPublicApiError("لا يمكن تعديل توزيع في صف ملغي أو مدفوع.", 400, "VALIDATION_ERROR");
  }

  const old = mapAllocation(row);
  const paidStatus =
    payload.paidStatus && ALLOCATION_PAID_STATUSES.has(payload.paidStatus) ? payload.paidStatus : old.paidStatus;

  const { rows: updated } = await pool.query(
    `UPDATE financial_bonus_allocations SET
      paid_status = $2,
      paid_at = $3,
      note = COALESCE($4, note),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [
      Number(allocationId),
      paidStatus,
      paidStatus === "paid" ? payload.paidAt || new Date().toISOString() : null,
      payload.note !== undefined ? (payload.note ? String(payload.note).trim() : null) : null,
    ],
  );
  const allocation = mapAllocation(updated[0]);
  let auditAction = "update_allocation";
  if (paidStatus === "paid") auditAction = "mark_allocation_paid";
  else if (paidStatus === "unpaid") auditAction = "mark_allocation_unpaid";
  else if (paidStatus === "held") auditAction = "mark_allocation_held";

  await logFinancialAudit({
    entityType: "financial_bonus_allocation",
    entityId: allocationId,
    action: auditAction,
    oldValue: old,
    newValue: allocation,
    actorId: actorUserId,
  });
  return allocation;
}

async function listSubscriptionSourcePayments({ q = "", limit = 30, offset = 0 } = {}) {
  const params = [];
  const where = [`fs.payment_status = 'paid'`];
  const qTrim = String(q || "").trim();
  if (qTrim) {
    params.push(`%${qTrim.toLowerCase()}%`);
    where.push(
      `(LOWER(u.email) LIKE $${params.length} OR LOWER(COALESCE(u.first_name,'') || ' ' || COALESCE(u.family_name,'')) LIKE $${params.length} OR CAST(fs.id AS TEXT) LIKE $${params.length})`,
    );
  }
  const lim = Math.min(50, Math.max(1, Number(limit) || 30));
  const off = Math.max(0, Number(offset) || 0);
  params.push(lim, off);

  const { rows } = await pool.query(
    `SELECT fs.*,
            u.first_name AS freelancer_first_name, u.father_name AS freelancer_father_name,
            u.family_name AS freelancer_family_name, u.email AS freelancer_email,
            u.account_id AS freelancer_account_id, u.phone AS freelancer_phone,
            u.whatsapp AS freelancer_whatsapp, u.country AS freelancer_country,
            u.billing_country AS freelancer_billing_country,
            p.name AS plan_name, p.title AS plan_title, p.duration_days AS plan_duration_days,
            p.price_jod AS plan_price_jod
     FROM freelancer_subscriptions fs
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     LEFT JOIN plans p ON p.id = fs.plan_id
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(fs.paid_at, fs.assigned_at, fs.created_at) DESC, fs.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return rows.map((r) => {
    const sub = mapSubscription(r);
    const amount = sub?.plan?.priceJod != null ? roundMoney(sub.plan.priceJod) : 0;
    const name = [sub?.freelancer?.firstName, sub?.freelancer?.familyName].filter(Boolean).join(" ").trim();
    return {
      id: sub.id,
      type: "subscription_payment",
      label: `${name || sub?.freelancer?.email || "مستقل"} — ${sub?.plan?.title || sub?.plan?.name || "باقة"} (#${sub.id})`,
      freelancerName: name || null,
      email: sub?.freelancer?.email || null,
      planTitle: sub?.plan?.title || sub?.plan?.name || null,
      amountJod: amount,
      paidAt: sub?.paidAt || sub?.assignedAt || sub?.createdAt,
      paymentStatus: sub?.paymentStatus,
      subscriptionId: sub.id,
    };
  });
}

async function listOrderSourcePayments({ q = "", limit = 30, offset = 0 } = {}) {
  const params = [];
  const where = [`o.payment_status = 'paid'`, `o.paid_at IS NOT NULL`];
  const qTrim = String(q || "").trim();
  if (qTrim) {
    params.push(`%${qTrim.toLowerCase()}%`);
    where.push(
      `(LOWER(o.title) LIKE $${params.length} OR CAST(o.id AS TEXT) LIKE $${params.length} OR LOWER(COALESCE(u.email,'')) LIKE $${params.length})`,
    );
  }
  const lim = Math.min(50, Math.max(1, Number(limit) || 30));
  const off = Math.max(0, Number(offset) || 0);
  params.push(lim, off);

  const { rows } = await pool.query(
    `SELECT o.id, o.order_code, o.title, o.payment_amount, o.payment_status, o.paid_at,
            u.first_name AS client_first_name, u.family_name AS client_family_name, u.email AS client_email
     FROM orders o
     LEFT JOIN users u ON u.id = o.created_by_user_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.paid_at DESC NULLS LAST, o.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return rows.map((r) => {
    const clientName = [r.client_first_name, r.client_family_name].filter(Boolean).join(" ").trim();
    const amount = roundMoney(r.payment_amount);
    return {
      id: String(r.id),
      type: "order_payment",
      label: `#${r.id} — ${r.title}${clientName ? ` (${clientName})` : ""}`,
      orderId: String(r.id),
      orderCode: r.order_code,
      title: r.title,
      clientName: clientName || null,
      clientEmail: r.client_email || null,
      amountJod: amount,
      paidAt: r.paid_at,
      paymentStatus: r.payment_status,
    };
  });
}

async function getSummary({ month } = {}) {
  const monthKey = month ? assertMonthKey(month) : null;
  const params = monthKey ? [monthKey] : [];
  const monthFilter = monthKey ? `AND br.month_key = $1` : "";
  const monthFilterPeople = monthKey ? `AND br.month_key = $1` : "";

  const { rows } = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM financial_people WHERE status = 'active') AS active_people,
      (SELECT COALESCE(SUM(br.bonus_pool_amount),0)::numeric FROM financial_bonus_rows br
        WHERE br.status NOT IN ('cancelled','draft') ${monthFilter}) AS total_bonus_month,
      (SELECT COALESCE(SUM(a.calculated_amount),0)::numeric
        FROM financial_bonus_allocations a
        JOIN financial_bonus_rows br ON br.id = a.bonus_row_id
        WHERE a.paid_status = 'paid' ${monthFilterPeople}) AS total_paid_month,
      (SELECT COALESCE(SUM(a.calculated_amount),0)::numeric
        FROM financial_bonus_allocations a
        JOIN financial_bonus_rows br ON br.id = a.bonus_row_id
        WHERE a.paid_status != 'paid' AND br.status != 'cancelled' ${monthFilterPeople}) AS total_unpaid,
      (SELECT COUNT(*)::int FROM financial_bonus_rows br
        WHERE br.received_status = 'not_received' AND br.status NOT IN ('cancelled','draft') ${monthFilter}) AS unreceived_rows`,
    params,
  );
  const s = rows[0] || {};
  return {
    activePeople: Number(s.active_people) || 0,
    totalBonusMonth: roundMoney(s.total_bonus_month),
    totalPaidMonth: roundMoney(s.total_paid_month),
    totalUnpaid: roundMoney(s.total_unpaid),
    unreceivedRows: Number(s.unreceived_rows) || 0,
    monthKey: monthKey || null,
  };
}

async function getPersonBonusDetails({ personId, month = "" } = {}) {
  const pid = Number(personId);
  const person = await getPersonById(pid);
  if (!person) throw createPublicApiError("الموظف غير موجود.", 404, "NOT_FOUND");

  const params = [pid];
  let monthClause = "";
  if (month) {
    params.push(assertMonthKey(month));
    monthClause = `AND br.month_key = $2`;
  }

  const { rows } = await pool.query(
    `SELECT a.*, br.title AS row_title, br.month_key, br.source_type, br.source_label,
            br.bonus_pool_amount, br.status AS row_status, p.full_name AS person_name
     FROM financial_bonus_allocations a
     JOIN financial_bonus_rows br ON br.id = a.bonus_row_id
     JOIN financial_people p ON p.id = a.person_id
     WHERE a.person_id = $1 AND br.status != 'cancelled' ${monthClause}
     ORDER BY br.month_key DESC, br.created_at DESC`,
    params,
  );

  const items = rows.map((r) => ({
    allocationId: String(r.id),
    bonusRowId: String(r.bonus_row_id),
    monthKey: r.month_key,
    title: r.row_title,
    sourceType: r.source_type,
    sourceLabel: r.source_label,
    bonusPoolAmount: roundMoney(r.bonus_pool_amount),
    percentageShare: roundMoney(r.percentage_share),
    calculatedAmount: roundMoney(r.calculated_amount),
    paidStatus: r.paid_status,
    paidAt: r.paid_at,
    note: r.note,
    rowStatus: r.row_status,
  }));

  const currentMonth = month || new Date().toISOString().slice(0, 7);
  const currentMonthBonus = items
    .filter((i) => i.monthKey === currentMonth)
    .reduce((s, i) => s + toNum(i.calculatedAmount), 0);

  return {
    person,
    currentMonthBonus: roundMoney(currentMonthBonus),
    items,
  };
}

module.exports = {
  listPeople,
  getPersonById,
  createPerson,
  updatePerson,
  deactivatePerson,
  listBonusRows,
  getBonusRowById,
  createBonusRow,
  updateBonusRow,
  transitionBonusRow,
  updateAllocation,
  listSubscriptionSourcePayments,
  listOrderSourcePayments,
  getSummary,
  getPersonBonusDetails,
  computeRowAmounts,
};
