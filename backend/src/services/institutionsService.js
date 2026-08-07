/**
 * Institutions catalog + membership (إدارة المؤسسات).
 */
const { pool } = require("../config/db");
const { BUDGET_CONSUMING_STATUSES } = require("./institutionalStorageDistribution");

function mapInstitution(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug || null,
    description: row.description || null,
    status: row.status,
    memberCount: row.member_count != null ? Number(row.member_count) : undefined,
    membershipTotalCount:
      row.membership_total_count != null ? Number(row.membership_total_count) : undefined,
    linkedStorageCount:
      row.linked_storage_count != null ? Number(row.linked_storage_count) : undefined,
    activeStorageCount:
      row.active_storage_count != null ? Number(row.active_storage_count) : undefined,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapMember(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    institutionId: String(row.institution_id),
    userId: String(row.user_id),
    memberRole: row.member_role,
    status: row.status,
    email: row.email || null,
    fullName: row.full_name || row.name || null,
    userRole: row.user_role || null,
    createdAt: row.created_at || null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdByName: row.created_by_name || null,
  };
}

const INSTITUTION_SELECT_EXTRAS = `
  COALESCE(mc.active_count, 0)::int AS member_count,
  COALESCE(mc.total_count, 0)::int AS membership_total_count,
  COALESCE(sc.linked_count, 0)::int AS linked_storage_count,
  COALESCE(sc.active_storage_count, 0)::int AS active_storage_count,
  COALESCE(
    NULLIF(trim(concat_ws(' ', cb.first_name, cb.father_name, cb.family_name)), ''),
    cb.email
  ) AS created_by_name
`;

const INSTITUTION_COUNT_JOINS = `
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE m.status = 'active')::int AS active_count,
      COUNT(*)::int AS total_count
    FROM institution_members m
    WHERE m.institution_id = i.id
  ) mc ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS linked_count,
      COUNT(*) FILTER (WHERE s.status = 'active')::int AS active_storage_count
    FROM institutional_storage_institutions si
    LEFT JOIN institutional_order_storages s ON s.id = si.storage_id
    WHERE si.institution_id = i.id
  ) sc ON TRUE
`;

async function getInstitutionsSummary() {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive,
       (SELECT COUNT(*)::int FROM institution_members WHERE status = 'active') AS active_members,
       (SELECT COUNT(DISTINCT institution_id)::int FROM institutional_storage_institutions) AS linked_to_storage
     FROM institutions`,
  );
  const r = rows[0] || {};
  return {
    totalInstitutions: Number(r.total || 0),
    activeInstitutions: Number(r.active || 0),
    inactiveInstitutions: Number(r.inactive || 0),
    totalActiveMembers: Number(r.active_members || 0),
    institutionsLinkedToStorage: Number(r.linked_to_storage || 0),
  };
}

async function listInstitutions({ q = "", status = null, page = 1, limit = 20 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = ["1=1"];
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(i.name ILIKE $${params.length} OR COALESCE(i.description, '') ILIKE $${params.length})`);
  }
  if (status === "active" || status === "inactive" || status === "frozen") {
    params.push(String(status));
    where.push(`i.status = $${params.length}`);
  }
  const whereSql = where.join(" AND ");
  const { rows: cRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM institutions i WHERE ${whereSql}`,
    params,
  );
  const total = Number(cRows[0]?.c || 0);
  params.push(lim, off);
  const { rows } = await pool.query(
    `SELECT i.*,
       ${INSTITUTION_SELECT_EXTRAS}
     FROM institutions i
     LEFT JOIN users cb ON cb.id = i.created_by
     ${INSTITUTION_COUNT_JOINS}
     WHERE ${whereSql}
     ORDER BY i.name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const summary = await getInstitutionsSummary();
  return {
    institutions: rows.map(mapInstitution),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
    summary,
  };
}

async function getInstitutionById(id) {
  const { rows } = await pool.query(
    `SELECT i.*,
       ${INSTITUTION_SELECT_EXTRAS}
     FROM institutions i
     LEFT JOIN users cb ON cb.id = i.created_by
     ${INSTITUTION_COUNT_JOINS}
     WHERE i.id = $1
     LIMIT 1`,
    [Number(id)],
  );
  return mapInstitution(rows[0]);
}

async function getDeactivationImpact(institutionId) {
  const iid = Number(institutionId);
  const { rows: memberRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM institution_members WHERE institution_id = $1 AND status = 'active'`,
    [iid],
  );
  const { rows: linkRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS linked,
       COUNT(*) FILTER (WHERE s.status = 'active')::int AS active_storages,
       COUNT(*) FILTER (
         WHERE s.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM institutional_storage_institutions si2
             INNER JOIN institutions i2 ON i2.id = si2.institution_id
             WHERE si2.storage_id = s.id
               AND i2.status = 'active'
               AND i2.id <> $1
           )
       )::int AS active_storages_sole_active_institution
     FROM institutional_storage_institutions si
     INNER JOIN institutional_order_storages s ON s.id = si.storage_id
     WHERE si.institution_id = $1`,
    [iid],
  );
  const linked = Number(linkRows[0]?.linked || 0);
  const activeStorages = Number(linkRows[0]?.active_storages || 0);
  const soleActive = Number(linkRows[0]?.active_storages_sole_active_institution || 0);
  return {
    activeMemberCount: Number(memberRows[0]?.c || 0),
    linkedStorageCount: linked,
    activeStorageCount: activeStorages,
    activeStoragesWithNoOtherActiveInstitution: soleActive,
    warningLevel: soleActive > 0 ? "critical" : activeStorages > 0 ? "high" : linked > 0 ? "medium" : "low",
  };
}

async function createInstitution({ actorUserId, name, description = null, slug = null, status = "active" }) {
  const n = String(name || "").trim();
  if (n.length < 2) {
    const err = new Error("اسم المؤسسة مطلوب (حرفان على الأقل).");
    err.statusCode = 400;
    err.publicCode = "VALIDATION_ERROR";
    throw err;
  }
  if (n.length > 200) {
    const err = new Error("اسم المؤسسة طويل جداً.");
    err.statusCode = 400;
    err.publicCode = "VALIDATION_ERROR";
    throw err;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO institutions (name, slug, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        n,
        slug ? String(slug).trim().slice(0, 80) : null,
        description ? String(description).trim() : null,
        status === "inactive" ? "inactive" : "active",
        Number(actorUserId),
      ],
    );
    return getInstitutionById(rows[0].id);
  } catch (e) {
    if (e && e.code === "23505") {
      const err = new Error("اسم المؤسسة مستخدم مسبقاً.");
      err.statusCode = 409;
      err.publicCode = "DUPLICATE_INSTITUTION_NAME";
      throw err;
    }
    throw e;
  }
}

async function updateInstitution({ id, patch, actorUserId = null }) {
  const existing = await getInstitutionById(id);
  if (!existing) {
    const err = new Error("المؤسسة غير موجودة.");
    err.statusCode = 404;
    throw err;
  }

  // Frozen institutions are read-only except dedicated freeze/unfreeze endpoints.
  if (existing.status === "frozen") {
    throw institutionFrozenError();
  }

  const fields = [];
  const params = [];
  if (patch.name != null) {
    const n = String(patch.name).trim();
    if (n.length < 2) {
      const err = new Error("اسم المؤسسة مطلوب (حرفان على الأقل).");
      err.statusCode = 400;
      throw err;
    }
    params.push(n);
    fields.push(`name = $${params.length}`);
  }
  if (patch.description !== undefined) {
    params.push(patch.description == null ? null : String(patch.description).trim());
    fields.push(`description = $${params.length}`);
  }
  if (patch.slug !== undefined) {
    params.push(patch.slug == null || String(patch.slug).trim() === "" ? null : String(patch.slug).trim().slice(0, 80));
    fields.push(`slug = $${params.length}`);
  }
  let deactivationImpact = null;
  if (patch.status != null) {
    // Patch only toggles active/inactive (deactivate workflow). Freeze uses dedicated endpoints.
    if (patch.status === "frozen") {
      const err = new Error("استخدم مسار التجميد المخصص لتجميد المؤسسة.");
      err.statusCode = 400;
      err.publicCode = "USE_FREEZE_ENDPOINT";
      throw err;
    }
    const nextStatus = patch.status === "inactive" ? "inactive" : "active";
    if (nextStatus === "inactive" && existing.status === "active") {
      deactivationImpact = await getDeactivationImpact(id);
    }
    params.push(nextStatus);
    fields.push(`status = $${params.length}`);
  }
  if (!fields.length) return { institution: existing, deactivationImpact: null };
  fields.push(`updated_at = NOW()`);
  params.push(Number(id));
  try {
    const { rows } = await pool.query(
      `UPDATE institutions SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING id`,
      params,
    );
    if (!rows[0]) {
      const err = new Error("المؤسسة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
  } catch (e) {
    if (e && e.code === "23505") {
      const err = new Error("اسم المؤسسة مستخدم مسبقاً.");
      err.statusCode = 409;
      err.publicCode = "DUPLICATE_INSTITUTION_NAME";
      throw err;
    }
    throw e;
  }
  if (patch.status != null && actorUserId != null) {
    const nextStatus = patch.status === "inactive" ? "inactive" : "active";
    if (nextStatus !== existing.status) {
      await writeInstitutionAudit(pool, {
        institutionId: id,
        actorUserId,
        action: nextStatus === "inactive" ? "deactivate" : "activate",
        previousStatus: existing.status,
        newStatus: nextStatus,
      }).catch(() => {});
    }
  }
  const institution = await getInstitutionById(id);
  return { institution, deactivationImpact };
}

async function listMembers(institutionId, { page = 1, limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const iid = Number(institutionId);
  const { rows } = await pool.query(
    `SELECT m.*, u.email, u.role AS user_role,
       COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.father_name, u.family_name)), ''), u.email) AS full_name,
       COALESCE(
         NULLIF(trim(concat_ws(' ', cb.first_name, cb.father_name, cb.family_name)), ''),
         cb.email
       ) AS created_by_name,
       COUNT(*) OVER()::int AS total_count
     FROM institution_members m
     INNER JOIN users u ON u.id = m.user_id
     LEFT JOIN users cb ON cb.id = m.created_by
     WHERE m.institution_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2 OFFSET $3`,
    [iid, lim, off],
  );
  const total = Number(rows[0]?.total_count || 0);
  return {
    members: rows.map(mapMember),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim) || 1) },
  };
}

async function addMember({ institutionId, userId, memberRole = "member", actorUserId }) {
  await assertInstitutionNotFrozen(institutionId);
  const { rows: uRows } = await pool.query(
    `SELECT id, is_active FROM users WHERE id = $1 LIMIT 1`,
    [Number(userId)],
  );
  if (!uRows[0]) {
    const err = new Error("المستخدم غير موجود.");
    err.statusCode = 404;
    throw err;
  }

  const { rows: existing } = await pool.query(
    `SELECT id, status FROM institution_members
     WHERE institution_id = $1 AND user_id = $2
     LIMIT 1`,
    [Number(institutionId), Number(userId)],
  );
  if (existing[0]?.status === "active") {
    const err = new Error("هذا المستخدم عضو بالفعل في المؤسسة.");
    err.statusCode = 409;
    err.code = "DUPLICATE_MEMBERSHIP";
    err.publicCode = "DUPLICATE_MEMBERSHIP";
    throw err;
  }

  const reactivated = Boolean(existing[0] && existing[0].status === "inactive");
  const role = memberRole === "manager" ? "manager" : "member";
  const { rows } = await pool.query(
    `INSERT INTO institution_members (institution_id, user_id, member_role, status, created_by)
     VALUES ($1, $2, $3, 'active', $4)
     ON CONFLICT (institution_id, user_id) DO UPDATE
       SET member_role = EXCLUDED.member_role,
           status = 'active',
           updated_at = NOW(),
           created_by = COALESCE(institution_members.created_by, EXCLUDED.created_by)
     RETURNING *`,
    [Number(institutionId), Number(userId), role, Number(actorUserId)],
  );
  const { rows: enriched } = await pool.query(
    `SELECT m.*, u.email, u.role AS user_role,
       COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.father_name, u.family_name)), ''), u.email) AS full_name,
       COALESCE(
         NULLIF(trim(concat_ws(' ', cb.first_name, cb.father_name, cb.family_name)), ''),
         cb.email
       ) AS created_by_name
     FROM institution_members m
     INNER JOIN users u ON u.id = m.user_id
     LEFT JOIN users cb ON cb.id = m.created_by
     WHERE m.id = $1`,
    [rows[0].id],
  );
  return { member: mapMember(enriched[0] || rows[0]), reactivated };
}

async function removeMember({ institutionId, userId }) {
  await assertInstitutionNotFrozen(institutionId);
  const { rowCount } = await pool.query(
    `UPDATE institution_members
     SET status = 'inactive', updated_at = NOW()
     WHERE institution_id = $1 AND user_id = $2 AND status = 'active'`,
    [Number(institutionId), Number(userId)],
  );
  return { ok: rowCount > 0 };
}

async function listStoragesForInstitution(institutionId, { page = 1, limit = 20 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const iid = Number(institutionId);
  const consuming = BUDGET_CONSUMING_STATUSES;

  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.status, s.financial_limit_jod, s.distribution_start_date,
       COALESCE(metrics.consumed_amount_jod, 0)::numeric AS consumed_amount_jod,
       COALESCE(metrics.approved_order_count, 0)::int AS approved_order_count,
       COALESCE(metrics.released_count, 0)::int AS released_count,
       COUNT(*) OVER()::int AS total_count
     FROM institutional_order_storages s
     INNER JOIN institutional_storage_institutions si ON si.storage_id = s.id
     LEFT JOIN LATERAL (
       SELECT
         COALESCE(SUM(o.order_price_jod) FILTER (
           WHERE o.lifecycle_status = ANY($2::text[]) AND o.deleted_at IS NULL
         ), 0)::numeric AS consumed_amount_jod,
         COUNT(*) FILTER (
           WHERE o.lifecycle_status = ANY($2::text[]) AND o.deleted_at IS NULL
         )::int AS approved_order_count,
         COUNT(*) FILTER (
           WHERE o.lifecycle_status = 'released' AND o.deleted_at IS NULL
         )::int AS released_count
       FROM institutional_stored_orders o
       WHERE o.storage_id = s.id
     ) metrics ON TRUE
     WHERE si.institution_id = $1
     ORDER BY s.created_at DESC
     LIMIT $3 OFFSET $4`,
    [iid, consuming, lim, off],
  );

  const total = Number(rows[0]?.total_count || 0);
  return {
    storages: rows.map((r) => {
      const financialLimitJod = Number(r.financial_limit_jod);
      const consumedAmountJod = Number(r.consumed_amount_jod || 0);
      return {
        id: String(r.id),
        name: r.name,
        status: r.status,
        financialLimitJod,
        remainingJod: Math.max(0, financialLimitJod - consumedAmountJod),
        approvedOrderCount: Number(r.approved_order_count || 0),
        releasedCount: Number(r.released_count || 0),
        distributionStartDate: r.distribution_start_date
          ? String(r.distribution_start_date).slice(0, 10)
          : null,
      };
    }),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim) || 1) },
  };
}

function institutionFrozenError() {
  const err = new Error("هذه المؤسسة مجمدة حاليًا، ولا يمكن تنفيذ هذه العملية.");
  err.statusCode = 409;
  err.code = "INSTITUTION_FROZEN";
  err.publicCode = "INSTITUTION_FROZEN";
  return err;
}

async function writeInstitutionAudit(clientOrPool, {
  institutionId,
  actorUserId,
  action,
  previousStatus,
  newStatus,
  reason = null,
  metadata = {},
}) {
  await clientOrPool.query(
    `INSERT INTO institution_audit_logs
      (institution_id, actor_user_id, action, previous_status, new_status, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      Number(institutionId),
      actorUserId != null ? Number(actorUserId) : null,
      action,
      previousStatus || null,
      newStatus || null,
      reason || null,
      JSON.stringify(metadata || {}),
    ],
  );
}

/**
 * Institution statistics from real relationships (no N+1).
 * Orders: institutional_stored_orders on storages linked to this institution.
 * Value: order_price_jod (canonical institutional financial amount).
 */
async function getInstitutionStatistics(institutionId) {
  const iid = Number(institutionId);
  if (!Number.isInteger(iid) || iid < 1) {
    const err = new Error("معرّف المؤسسة غير صالح.");
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT
       (
         SELECT COUNT(*)::int
         FROM institution_members m
         WHERE m.institution_id = $1
           AND m.status = 'active'
       ) AS users_count,
       (
         SELECT COUNT(*)::int
         FROM institutional_stored_orders o
         INNER JOIN institutional_storage_institutions si ON si.storage_id = o.storage_id
         WHERE si.institution_id = $1
           AND o.deleted_at IS NULL
           AND o.lifecycle_status NOT IN ('draft', 'rejected')
       ) AS orders_count,
       (
         SELECT COALESCE(SUM(o.order_price_jod), 0)::numeric
         FROM institutional_stored_orders o
         INNER JOIN institutional_storage_institutions si ON si.storage_id = o.storage_id
         WHERE si.institution_id = $1
           AND o.deleted_at IS NULL
           AND o.lifecycle_status NOT IN ('draft', 'rejected')
       ) AS orders_total_amount
    `,
    [iid],
  );
  const r = rows[0] || {};
  return {
    ordersCount: Number(r.orders_count || 0),
    usersCount: Number(r.users_count || 0),
    ordersTotalAmount: Number(r.orders_total_amount || 0),
  };
}

/** Throws 409 if institution is frozen. Super Admin reads are not blocked by callers. */
async function assertInstitutionNotFrozen(institutionId, clientOrPool = pool) {
  const { rows } = await clientOrPool.query(
    `SELECT status FROM institutions WHERE id = $1 LIMIT 1`,
    [Number(institutionId)],
  );
  if (!rows[0]) {
    const err = new Error("المؤسسة غير موجودة.");
    err.statusCode = 404;
    throw err;
  }
  if (rows[0].status === "frozen") throw institutionFrozenError();
  return rows[0].status;
}

/** Block writes when any linked institution is frozen. */
async function assertStorageInstitutionsNotFrozen(storageId, clientOrPool = pool) {
  const { rows } = await clientOrPool.query(
    `SELECT i.id, i.name, i.status
     FROM institutional_storage_institutions si
     INNER JOIN institutions i ON i.id = si.institution_id
     WHERE si.storage_id = $1 AND i.status = 'frozen'
     LIMIT 1`,
    [Number(storageId)],
  );
  if (rows[0]) throw institutionFrozenError();
}

/**
 * Active memberships on non-frozen institutions (pool claim / institutional writes visibility).
 * Personal platform access is unaffected; frozen institutions simply yield no institutional ops.
 */
async function listActiveInstitutionIdsForUser(userId, clientOrPool = pool) {
  const { rows } = await clientOrPool.query(
    `SELECT m.institution_id
     FROM institution_members m
     INNER JOIN institutions i ON i.id = m.institution_id
     WHERE m.user_id = $1
       AND m.status = 'active'
       AND i.status = 'active'`,
    [Number(userId)],
  );
  return rows.map((r) => Number(r.institution_id));
}

async function userBelongsToAnyInstitution(userId, institutionIds, clientOrPool = pool) {
  const ids = (institutionIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return false;
  const { rows } = await clientOrPool.query(
    `SELECT 1
     FROM institution_members m
     INNER JOIN institutions i ON i.id = m.institution_id
     WHERE m.user_id = $1
       AND m.status = 'active'
       AND i.status = 'active'
       AND m.institution_id = ANY($2::bigint[])
     LIMIT 1`,
    [Number(userId), ids],
  );
  return Boolean(rows[0]);
}

async function freezeInstitution({ id, actorUserId, reason = null }) {
  const iid = Number(id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, status FROM institutions WHERE id = $1 FOR UPDATE`,
      [iid],
    );
    if (!rows[0]) {
      const err = new Error("المؤسسة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const previous = rows[0].status;
    if (previous === "frozen") {
      await client.query("COMMIT");
      const institution = await getInstitutionById(iid);
      const statistics = await getInstitutionStatistics(iid);
      return { institution, statistics, alreadyFrozen: true };
    }
    await client.query(
      `UPDATE institutions SET status = 'frozen', updated_at = NOW() WHERE id = $1`,
      [iid],
    );
    await writeInstitutionAudit(client, {
      institutionId: iid,
      actorUserId,
      action: "freeze",
      previousStatus: previous,
      newStatus: "frozen",
      reason,
    });
    await client.query("COMMIT");
    const institution = await getInstitutionById(iid);
    const statistics = await getInstitutionStatistics(iid);
    return { institution, statistics, alreadyFrozen: false };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function unfreezeInstitution({ id, actorUserId, reason = null }) {
  const iid = Number(id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, status FROM institutions WHERE id = $1 FOR UPDATE`,
      [iid],
    );
    if (!rows[0]) {
      const err = new Error("المؤسسة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const previous = rows[0].status;
    if (previous !== "frozen") {
      await client.query("COMMIT");
      const institution = await getInstitutionById(iid);
      const statistics = await getInstitutionStatistics(iid);
      return { institution, statistics, alreadyActive: previous === "active", alreadyUnfrozen: true };
    }
    await client.query(
      `UPDATE institutions SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [iid],
    );
    await writeInstitutionAudit(client, {
      institutionId: iid,
      actorUserId,
      action: "unfreeze",
      previousStatus: previous,
      newStatus: "active",
      reason,
    });
    await client.query("COMMIT");
    const institution = await getInstitutionById(iid);
    const statistics = await getInstitutionStatistics(iid);
    return { institution, statistics, alreadyUnfrozen: false };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function getInstitutionDetailBundle(
  id,
  { membersPage = 1, membersLimit = 20, storagesPage = 1, storagesLimit = 20 } = {},
) {
  const [institution, membersData, storagesData, statistics] = await Promise.all([
    getInstitutionById(id),
    listMembers(id, { page: membersPage, limit: membersLimit }),
    listStoragesForInstitution(id, { page: storagesPage, limit: storagesLimit }),
    getInstitutionStatistics(id).catch(() => ({
      ordersCount: 0,
      usersCount: 0,
      ordersTotalAmount: 0,
    })),
  ]);
  if (!institution) return null;
  return {
    institution,
    members: membersData.members,
    membersPagination: membersData.pagination,
    storages: storagesData.storages,
    storagesPagination: storagesData.pagination,
    statistics,
  };
}

module.exports = {
  listInstitutions,
  getInstitutionById,
  getInstitutionDetailBundle,
  getInstitutionStatistics,
  getInstitutionsSummary,
  getDeactivationImpact,
  createInstitution,
  updateInstitution,
  listMembers,
  addMember,
  removeMember,
  listStoragesForInstitution,
  listActiveInstitutionIdsForUser,
  userBelongsToAnyInstitution,
  assertInstitutionNotFrozen,
  assertStorageInstitutionsNotFrozen,
  freezeInstitution,
  unfreezeInstitution,
  writeInstitutionAudit,
  mapInstitution,
};
