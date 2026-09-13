/**
 * Soft-fail helpers for optional public homepage polls when the API returns 429.
 * Avoid retry storms; respect Retry-After when present.
 */

import { getRetryAfterSeconds, isRateLimitedError } from "../utils/apiErrorMessage.js";

const DEFAULT_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * @param {unknown} err
 * @param {number} [nowMs]
 * @returns {number} epoch ms until polling may resume
 */
export function computePublicPollResumeAt(err, nowMs = Date.now()) {
  if (!isRateLimitedError(err)) return nowMs;
  const retrySec = getRetryAfterSeconds(err);
  const waitMs =
    retrySec != null && retrySec > 0
      ? Math.min(Math.max(retrySec, 1) * 1000, MAX_BACKOFF_MS)
      : DEFAULT_BACKOFF_MS;
  return nowMs + waitMs;
}

/**
 * @param {number} resumeAtMs
 * @param {number} [nowMs]
 */
export function shouldSkipPublicPoll(resumeAtMs, nowMs = Date.now()) {
  return Number.isFinite(resumeAtMs) && resumeAtMs > nowMs;
}
