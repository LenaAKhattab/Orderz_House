/**
 * Map Admin action-center summary API → card count state.
 * Web-Admin-A2: paidActivationPendingCount is legacy API-only — not mapped/displayed.
 */

export const ACTION_CENTER_COUNT_KEYS = Object.freeze([
  "identity",
  "pantry",
  "articles",
  "feedback",
  "notifications",
]);

export const EMPTY_ACTION_CENTER_COUNTS = Object.freeze({
  identity: 0,
  pantry: 0,
  articles: 0,
  feedback: 0,
  notifications: 0,
});

function toCount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

/**
 * @param {unknown} payload - axios data: { success, data } or data object
 * @returns {{
 *   counts: typeof EMPTY_ACTION_CENTER_COUNTS,
 *   partialErrors: string[],
 *   allFailed: boolean,
 *   updatedAt: string | null,
 * }}
 */
export function mapActionCenterSummary(payload) {
  const data = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : payload && typeof payload === "object"
      ? payload
      : {};

  const counts = {
    identity: toCount(data.identityPendingCount),
    pantry: toCount(data.pantryPendingCount),
    articles: toCount(data.articlesPendingCount),
    feedback: toCount(data.feedbackPendingCount),
    notifications: toCount(data.unreadNotificationsCount),
  };

  const rawErrors = Array.isArray(data.partialErrors) ? data.partialErrors : [];
  const partialErrors = rawErrors
    .map((row) => (typeof row === "string" ? row : row?.key))
    .filter(Boolean);

  const failedKeySet = new Set(partialErrors);
  const mappedFailKeys = [];
  if (failedKeySet.has("identityPendingCount")) mappedFailKeys.push("identity");
  if (failedKeySet.has("pantryPendingCount")) mappedFailKeys.push("pantry");
  if (failedKeySet.has("articlesPendingCount")) mappedFailKeys.push("articles");
  if (failedKeySet.has("feedbackPendingCount")) mappedFailKeys.push("feedback");
  if (failedKeySet.has("unreadNotificationsCount")) mappedFailKeys.push("notifications");

  const countKeys = ACTION_CENTER_COUNT_KEYS;

  return {
    counts,
    partialErrors: mappedFailKeys,
    allFailed: mappedFailKeys.length === countKeys.length,
    updatedAt: data.updatedAt || null,
  };
}

export function mergeCountsPreservingPrevious(previous, next, { preserveOnNull = false } = {}) {
  const out = { ...EMPTY_ACTION_CENTER_COUNTS };
  for (const key of ACTION_CENTER_COUNT_KEYS) {
    const nextVal = next?.[key];
    if (nextVal == null && preserveOnNull && previous?.[key] != null) {
      out[key] = previous[key];
    } else {
      out[key] = toCount(nextVal, previous?.[key] != null ? previous[key] : 0);
    }
  }
  return out;
}
