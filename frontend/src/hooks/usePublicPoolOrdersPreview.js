import { useEffect, useMemo, useRef, useState } from "react";
import { listPoolOrdersRequest } from "../services/api";
import { fetchPublicCached } from "../lib/publicRequestCache";
import { computePublicPollResumeAt, shouldSkipPublicPoll } from "../lib/publicPollBackoff";
import { isRateLimitedError } from "../utils/apiErrorMessage";

/** Same query defaults as `OpenOrdersMarketplace` initial pool load (public `/orders`). */
const POOL_PREVIEW_PARAMS = Object.freeze({ page: 1, limit: 6, sort: "newest" });

/** Poll open pool while tab is visible — training rounds are time-sensitive. */
const PUBLIC_POOL_PREVIEW_POLL_MS = Math.min(
  Math.max(Number(import.meta.env.VITE_PUBLIC_POOL_PREVIEW_POLL_MS) || 30_000, 20_000),
  60_000,
);

/**
 * @param {{ limit?: number }} [options]
 * @returns {{ items: unknown[]; loading: boolean; error: boolean; refetching: boolean }}
 */
export default function usePublicPoolOrdersPreview(options = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState(false);
  const rateLimitResumeAtRef = useRef(0);
  const queryParams = useMemo(
    () => ({
      ...POOL_PREVIEW_PARAMS,
      ...(options.limit != null ? { limit: options.limit } : {}),
    }),
    [options.limit],
  );

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    let abortController = null;

    const load = async ({ initial = false } = {}) => {
      if (cancelled || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
        return;
      }
      if (!initial && shouldSkipPublicPoll(rateLimitResumeAtRef.current)) {
        return;
      }

      abortController?.abort();
      abortController = new AbortController();

      if (initial) {
        setLoading(true);
        setError(false);
      } else {
        setRefetching(true);
      }

      try {
        const cacheKey = `GET /orders/pool?page=${queryParams.page}&limit=${queryParams.limit}&sort=${queryParams.sort}`;
        const res = await fetchPublicCached(
          cacheKey,
          () => listPoolOrdersRequest(queryParams, { signal: abortController.signal }),
          { ttlMs: PUBLIC_POOL_PREVIEW_POLL_MS },
        );
        const list = Array.isArray(res?.data?.orders) ? res.data.orders : [];
        if (!cancelled) {
          rateLimitResumeAtRef.current = 0;
          setItems(list);
          setError(false);
        }
      } catch (err) {
        if (cancelled || err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        if (isRateLimitedError(err)) {
          rateLimitResumeAtRef.current = computePublicPollResumeAt(err);
          if (!cancelled && initial) {
            setItems([]);
            setError(true);
          }
          return;
        }
        if (!cancelled && initial) {
          setItems([]);
          setError(true);
        }
      } finally {
        if (!cancelled) {
          if (initial) setLoading(false);
          else setRefetching(false);
        }
      }
    };

    const schedulePoll = () => {
      if (intervalId) window.clearInterval(intervalId);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        intervalId = null;
        return;
      }
      intervalId = window.setInterval(() => void load({ initial: false }), PUBLIC_POOL_PREVIEW_POLL_MS);
    };

    const onVisibilityChange = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        void load({ initial: false });
        schedulePoll();
      } else {
        if (intervalId) window.clearInterval(intervalId);
        intervalId = null;
        abortController?.abort();
      }
    };

    void load({ initial: true });
    schedulePoll();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      abortController?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [queryParams]);

  return { items, loading, error, refetching };
}
