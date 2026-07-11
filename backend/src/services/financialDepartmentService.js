const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");

const DEPT_STATUSES = new Set(["active", "inactive"]);

function mapDepartment(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug || null,
    isDefault: Boolean(row.is_default),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listDepartments({ status = "active" } = {}) {
  const params = [];
  let where = "TRUE";
  if (status && DEPT_STATUSES.has(status)) {
    params.push(status);
    where = `status = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM financial_departments
     WHERE ${where}
     ORDER BY is_default DESC, name ASC`,
    params,
  );
  return rows.map(mapDepartment);
}

async function getDepartmentById(id) {
  const deptId = Number(id);
  if (!Number.isInteger(deptId) || deptId < 1) return null;
  const { rows } = await pool.query(`SELECT * FROM financial_departments WHERE id = $1`, [deptId]);
  return mapDepartment(rows[0]);
}

async function createDepartment({ name, actorUserId }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw createPublicApiError("اسم القسم مطلوب.", 400, "VALIDATION_ERROR");
  }
  if (trimmed.length > 120) {
    throw createPublicApiError("اسم القسم طويل جدًا.", 400, "VALIDATION_ERROR");
  }

  const { rows: existing } = await pool.query(
    `SELECT id FROM financial_departments WHERE lower(name) = lower($1) LIMIT 1`,
    [trimmed],
  );
  if (existing[0]) {
    throw createPublicApiError("هذا القسم موجود مسبقًا.", 409, "DEPARTMENT_ALREADY_EXISTS");
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO financial_departments (name, slug, is_default, status, created_by)
       VALUES ($1, NULL, FALSE, 'active', $2)
       RETURNING *`,
      [trimmed, actorUserId ? Number(actorUserId) : null],
    );
    return mapDepartment(rows[0]);
  } catch (e) {
    if (e.code === "23505") {
      throw createPublicApiError("هذا القسم موجود مسبقًا.", 409, "DEPARTMENT_ALREADY_EXISTS");
    }
    throw e;
  }
}

async function assertActiveDepartmentId(departmentId) {
  if (departmentId == null || departmentId === "") return null;
  const deptId = Number(departmentId);
  if (!Number.isInteger(deptId) || deptId < 1) {
    throw createPublicApiError("القسم المحدد غير صالح.", 400, "VALIDATION_ERROR");
  }
  const dept = await getDepartmentById(deptId);
  if (!dept || dept.status !== "active") {
    throw createPublicApiError("القسم المحدد غير موجود أو غير نشط.", 400, "VALIDATION_ERROR");
  }
  return deptId;
}

module.exports = {
  listDepartments,
  getDepartmentById,
  createDepartment,
  assertActiveDepartmentId,
  mapDepartment,
};
