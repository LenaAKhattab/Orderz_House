/**
 * React hook — Admin list load with race guard, soft refresh errors, AbortController.
 * Web-Admin-List-Timeout-05: stable run() (no effect loops), in-flight clearing, 429 cooldown.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage.js";
import {
  ADMIN_LIST_RATE_LIMIT_COOLDOWN_MS,
  ADMIN_LIST_RATE_LIMIT_NOTE,
  ADMIN_LIST_REFRESH_SOFT_NOTE,
  createAdminListRequestGate,
  isAdminListAbortError,
  resolveAdminListFailure,
} from "../lib/staff/adminListLoad.js";

/**
 * @param {object} [options]
 * @param {(err: unknown) => string} [options.mapError]
 */
export function useAdminListLoad(options = {}) {
  const mapErrorRef = useRef(
    options.mapError ||
      ((err) => getSafeApiErrorMessage(err) || "تعذر تحميل القائمة. حاول مجدداً."),
  );
  mapErrorRef.current =
    options.mapError ||
    ((err) => getSafeApiErrorMessage(err) || "تعذر تحميل القائمة. حاول مجدداً.");

  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createAdminListRequestGate();

  const inFlightRef = useRef(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const [rateLimited, setRateLimited] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    return () => {
      gateRef.current?.abortInFlight();
      inFlightRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (!rateLimitUntil) {
      setRateLimited(false);
      return undefined;
    }
    const left = rateLimitUntil - Date.now();
    if (left <= 0) {
      setRateLimited(false);
      setRateLimitUntil(0);
      return undefined;
    }
    setRateLimited(true);
    const t = setTimeout(() => {
      setRateLimited(false);
      setRateLimitUntil(0);
    }, left);
    return () => clearTimeout(t);
  }, [rateLimitUntil]);

  /**
   * @template T
   * @param {(ctx: { signal?: AbortSignal }) => Promise<T>} fetcher
   * @param {{ hasExistingRows?: boolean }} [meta]
   * @returns {Promise<{ ok: boolean, data?: T, stale?: boolean, aborted?: boolean, rateLimited?: boolean }>}
   */
  const run = useCallback(async (fetcher, meta = {}) => {
    const hasExistingRows = Boolean(meta.hasExistingRows) || hasLoadedOnceRef.current;
    const ticket = gateRef.current.begin();

    inFlightRef.current += 1;
    if (hasExistingRows) {
      setRefreshing(true);
      setRefreshError("");
    } else {
      setInitialLoading(true);
      setInitialLoadError("");
    }

    try {
      const data = await fetcher({ signal: ticket.signal });
      if (!ticket.isCurrent()) return { ok: false, stale: true };
      hasLoadedOnceRef.current = true;
      setInitialLoadError("");
      setRefreshError("");
      return { ok: true, data };
    } catch (err) {
      if (!ticket.isCurrent()) return { ok: false, stale: true };
      if (isAdminListAbortError(err)) return { ok: false, aborted: true };
      const resolved = resolveAdminListFailure({
        hasExistingRows,
        error: err,
        mapError: (e) => mapErrorRef.current(e),
      });
      if (resolved.hardError) setInitialLoadError(resolved.hardError);
      if (resolved.softNote) setRefreshError(resolved.softNote || ADMIN_LIST_REFRESH_SOFT_NOTE);
      if (resolved.rateLimited) {
        setRateLimitUntil(Date.now() + ADMIN_LIST_RATE_LIMIT_COOLDOWN_MS);
      }
      return {
        ok: false,
        error: err,
        shouldClearRows: resolved.shouldClearRows,
        rateLimited: Boolean(resolved.rateLimited),
      };
    } finally {
      // Always decrement; clear busy flags when nothing is in flight.
      // Aborted/stale tickets must not leave Refresh stuck disabled.
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      if (inFlightRef.current === 0) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const clearRefreshError = useCallback(() => setRefreshError(""), []);

  return {
    initialLoading,
    refreshing,
    initialLoadError,
    refreshError,
    rateLimited,
    rateLimitUntil,
    hasLoadedOnce: hasLoadedOnceRef,
    run,
    clearRefreshError,
    softNote: ADMIN_LIST_REFRESH_SOFT_NOTE,
    rateLimitNote: ADMIN_LIST_RATE_LIMIT_NOTE,
    listBusy: initialLoading || refreshing || rateLimited,
  };
}

export default useAdminListLoad;
