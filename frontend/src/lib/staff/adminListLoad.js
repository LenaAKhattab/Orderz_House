import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage.js";
import { localeFromEnFlag, pt } from "../../i18n/activeLocale.js";
/**
 * Shared helpers for Admin list pages — request races, soft refresh errors, Abort.
 * Web-Admin-List-Timeout-02 / 05
 */

import {
  isAxiosCanceledError,
  isAxiosTimeoutError,
  isRateLimitedError,
} from "../../utils/apiErrorMessage.js";

/** Admin list GETs — Staging/Neon often exceeds the default 10s client timeout. */
export const ADMIN_LIST_TIMEOUT_MS = 20000;

/** Heavier Admin lists (pantry requests/deliveries). */
export const ADMIN_LIST_HEAVY_TIMEOUT_MS = 25000;

/** Debounce for list search inputs (450–600ms). */
export const ADMIN_LIST_SEARCH_DEBOUNCE_MS = 500;

/**
 * Admin list notes were Arabic-only copy (also on the English UI). `localeFromEnFlag(false)` keeps Arabic for
 * the Arabic and English UIs and uses the German / Dutch / Romanian catalog for the new locales.
 */
const adminListLocale = () => localeFromEnFlag(false);

/** Soft note when refresh fails but previous rows stay visible (UI-locale aware). */
export function adminListRefreshSoftNote(locale = adminListLocale()) {
  return pt("platformCore.adminList.refreshSoftNote", undefined, locale);
}

/** Soft/hard note when the API returns HTTP 429 (UI-locale aware). */
export function adminListRateLimitNote(locale = adminListLocale()) {
  return pt("platformCore.adminList.rateLimitNote", undefined, locale);
}

/** Initial-load error when no mapped API message is available (UI-locale aware). */
export function adminListLoadFailedMessage(locale = adminListLocale()) {
  return pt("platformCore.adminList.loadFailed", undefined, locale);
}

/** Soft note when refresh fails but previous rows stay visible (Arabic; prefer `adminListRefreshSoftNote()`). */
export const ADMIN_LIST_REFRESH_SOFT_NOTE = adminListRefreshSoftNote("ar");

/** Soft/hard note when the API returns HTTP 429 (Arabic; prefer `adminListRateLimitNote()`). */
export const ADMIN_LIST_RATE_LIMIT_NOTE = adminListRateLimitNote("ar");

/** Local UI cooldown after 429 before allowing search/refresh again. */
export const ADMIN_LIST_RATE_LIMIT_COOLDOWN_MS = 15000;

export function isAdminListAbortError(err) {
  if (!err) return false;
  if (isAxiosCanceledError(err)) return true;
  if (err?.name === "AbortError" || err?.name === "CanceledError") return true;
  if (err?.code === "ERR_CANCELED") return true;
  return false;
}

/**
 * @param {object} opts
 * @param {boolean} opts.hasExistingRows
 * @param {unknown} opts.error
 * @param {(err: unknown) => string} [opts.mapError]
 * @returns {{ softNote: string, hardError: string, shouldClearRows: boolean, rateLimited: boolean }}
 */
export function resolveAdminListFailure({ hasExistingRows, error, mapError }) {
  if (isAdminListAbortError(error)) {
    return { softNote: "", hardError: "", shouldClearRows: false, rateLimited: false };
  }

  if (isRateLimitedError(error)) {
    if (hasExistingRows) {
      return {
        softNote: adminListRateLimitNote(),
        hardError: "",
        shouldClearRows: false,
        rateLimited: true,
      };
    }
    return {
      softNote: "",
      hardError: adminListRateLimitNote(),
      shouldClearRows: true,
      rateLimited: true,
    };
  }

  const mapped =
    typeof mapError === "function"
      ? mapError(error)
      : error && typeof error === "object"
        ? getSafeApiErrorMessage(error)
        : "";
  if (hasExistingRows) {
    return {
      softNote: adminListRefreshSoftNote(),
      hardError: "",
      shouldClearRows: false,
      rateLimited: false,
    };
  }
  return {
    softNote: "",
    hardError: mapped || adminListLoadFailedMessage(),
    shouldClearRows: true,
    rateLimited: false,
  };
}

/**
 * Mutable request sequence for list loaders (guards stale responses).
 */
export function createAdminListRequestGate() {
  let seq = 0;
  /** @type {AbortController | null} */
  let controller = null;

  return {
    /** Begin a new request; aborts any in-flight previous one. */
    begin() {
      if (controller) {
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
      }
      controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const id = ++seq;
      return {
        id,
        signal: controller?.signal,
        isCurrent: () => id === seq,
      };
    },
    /** Abort in-flight without starting a new request (unmount). */
    abortInFlight() {
      if (controller) {
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
        controller = null;
      }
      seq += 1;
    },
    isCurrent(id) {
      return id === seq;
    },
    currentId() {
      return seq;
    },
  };
}

export { isAxiosTimeoutError, isRateLimitedError };
