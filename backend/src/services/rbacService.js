const { pool } = require("../config/db");

function isMissingTableError(err) {
  return err && (err.code === "42P01" || String(err.message || "").includes("does not exist"));
}

async function getUserRoles(userId) {
  const { rows } = await pool.query(
    `SELECT r.name, r.display_name, r.is_system
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.is_system DESC, r.name ASC`,
    [userId],
  );
  return rows.map((r) => ({
    name: r.name,
    displayName: r.display_name,
    isSystem: r.is_system,
  }));
}

async function getUserPermissionKeys(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.key
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1
     ORDER BY p.key ASC`,
    [userId],
  );
  return rows.map((r) => r.key);
}

function pickPrimaryRole({ roles, legacyRole }) {
  if (legacyRole && roles.some((r) => r.name === legacyRole)) {
    return legacyRole;
  }
  return roles[0]?.name || legacyRole || null;
}

/**
 * Resolve user's roles + permissions with safe fallback.
 * - If RBAC tables aren't present yet, returns legacy role + empty permissions.
 */
async function resolveAuthzContext({ userId, legacyRole = null }) {
  try {
    const roles = await getUserRoles(userId);
    const permissions = await getUserPermissionKeys(userId);
    const primaryRole = pickPrimaryRole({ roles, legacyRole });
    const isSuperAdmin = roles.some((r) => r.name === "super_admin");
    return { roles, permissions, primaryRole, isSuperAdmin, rbacReady: true };
  } catch (err) {
    if (isMissingTableError(err)) {
      const roles = legacyRole ? [{ name: legacyRole, displayName: legacyRole, isSystem: true }] : [];
      const primaryRole = legacyRole || null;
      const isSuperAdmin = legacyRole === "super_admin";
      return { roles, permissions: [], primaryRole, isSuperAdmin, rbacReady: false };
    }
    throw err;
  }
}

/**
 * Assign a role to a user in user_roles (idempotent). Safe if RBAC not ready.
 */
async function ensureUserRole({ userId, roleName }) {
  try {
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.name = $2
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleName],
    );
  } catch (err) {
    if (isMissingTableError(err)) return;
    throw err;
  }
}

module.exports = {
  resolveAuthzContext,
  ensureUserRole,
};

