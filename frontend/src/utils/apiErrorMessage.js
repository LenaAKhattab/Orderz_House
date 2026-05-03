/** Matches backend `GENERIC_5XX` style responses. */
const DEFAULT_GENERIC_AR = "حدث خطأ غير متوقع، حاول لاحقاً";

/**
 * Returns API `message` when it looks like safe user-facing Arabic (or any non-technical) text.
 * Falls back when the backend might have leaked internal/English vendor text.
 */
export function getSafeApiErrorMessage(err, fallback = DEFAULT_GENERIC_AR) {
  if (err?.message && String(err.message).includes("Network")) {
    return "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.";
  }

  const msg = err?.response?.data?.message;
  if (typeof msg !== "string" || !msg.trim()) {
    return fallback;
  }
  const t = msg.trim();
  if (looksTechnicalOrUnsafe(t)) {
    return fallback;
  }
  return t;
}

function looksTechnicalOrUnsafe(t) {
  const lower = t.toLowerCase();
  if (
    /postgres|error:|severity|syntax|relation |column |violates|deadlock|neon|stripe|resend|sql|ECONNREFUSED|ETIMEDOUT|request failed with status|duplicate key|npm run|\.sql/i.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

export { DEFAULT_GENERIC_AR };
