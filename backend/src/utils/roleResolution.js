/**
 * Single source for merging RBAC roles, primaryRole, legacy users.role, and JWT role.
 * Used by rbacMiddleware and orderAuthorizationService to avoid authorization drift.
 */

function normalizeRoleName(value) {
  if (value == null) return "";
  const s = String(value).trim();
  return s || "";
}

/**
 * @param {{ roles?: Array<{ name?: string }>, primaryRole?: string|null, legacyRole?: string|null }} auth
 * @param {string} [jwtRole] — used only when RBAC/primary/legacy yield no roles (stale-token fallback)
 * @returns {string[]}
 */
function collectResolvedRoleNames(auth, jwtRole) {
  const rbac = Array.isArray(auth?.roles)
    ? auth.roles.map((r) => normalizeRoleName(r?.name)).filter(Boolean)
    : [];
  const primary = normalizeRoleName(auth?.primaryRole);
  const legacy = normalizeRoleName(auth?.legacyRole);
  const merged = [...new Set([...rbac, primary, legacy].filter(Boolean))];
  if (merged.length) return merged;
  const jwt = normalizeRoleName(jwtRole);
  return jwt ? [jwt] : [];
}

module.exports = {
  collectResolvedRoleNames,
  normalizeRoleName,
};
