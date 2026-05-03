/** @param {Record<string, unknown> | null | undefined} user */
export function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

export function fmtDateMedium(value) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

/** Default toggles when API returns empty preferences. */
export const DEFAULT_NOTIFICATION_PREFS = {
  orders: true,
  claims: true,
  courses: true,
  payments: true,
  offers: true,
  delivery: true,
  general: true,
};

export function mergeNotificationPrefs(raw) {
  const base = { ...DEFAULT_NOTIFICATION_PREFS };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const k of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
      if (typeof raw[k] === "boolean") base[k] = raw[k];
    }
  }
  return base;
}
