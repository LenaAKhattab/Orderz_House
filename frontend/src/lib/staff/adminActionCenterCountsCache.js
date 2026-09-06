/**
 * Short-lived session cache for Admin Action Center counts.
 */

import {
  ACTION_CENTER_COUNT_KEYS,
  EMPTY_ACTION_CENTER_COUNTS,
} from "./adminActionCenterSummary.js";

export const ACTION_CENTER_COUNTS_CACHE_KEY = "oh_admin_action_center_counts_v1";
export const ACTION_CENTER_COUNTS_CACHE_TTL_MS = 90_000;

function canUseSessionStorage() {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage != null;
  } catch {
    return false;
  }
}

export function readActionCenterCountsCache({ now = Date.now(), ttlMs = ACTION_CENTER_COUNTS_CACHE_TTL_MS } = {}) {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(ACTION_CENTER_COUNTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt);
    if (!Number.isFinite(savedAt) || now - savedAt > ttlMs) return null;
    const counts = { ...EMPTY_ACTION_CENTER_COUNTS };
    for (const key of ACTION_CENTER_COUNT_KEYS) {
      const n = Number(parsed?.counts?.[key]);
      counts[key] = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    }
    return { counts, savedAt };
  } catch {
    return null;
  }
}

export function writeActionCenterCountsCache(counts, { now = Date.now() } = {}) {
  if (!canUseSessionStorage()) return;
  try {
    const payload = {
      savedAt: now,
      counts: { ...EMPTY_ACTION_CENTER_COUNTS, ...(counts || {}) },
    };
    sessionStorage.setItem(ACTION_CENTER_COUNTS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}
