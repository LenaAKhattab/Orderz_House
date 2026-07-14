/** Matches backend `GENERIC_5XX` style responses. */
const DEFAULT_GENERIC_AR = "حدث خطأ غير متوقع، حاول لاحقاً";

const RATE_LIMITED_CODE = "RATE_LIMITED";
const EMAIL_ALREADY_REGISTERED_CODE = "EMAIL_ALREADY_REGISTERED";
const FAILED_TO_SEND_OTP_CODE = "FAILED_TO_SEND_OTP";
const EMAIL_SERVICE_UNAVAILABLE_CODE = "EMAIL_SERVICE_UNAVAILABLE";

/** True when the API responded with HTTP 429 or explicit RATE_LIMITED code. */
export function isRateLimitedError(err) {
  if (err?.response?.status === 429) return true;
  return err?.response?.data?.code === RATE_LIMITED_CODE;
}

/** Parse Retry-After seconds from a 429 axios error (header or body). */
export function getRetryAfterSeconds(err) {
  const header = err?.response?.headers?.["retry-after"] ?? err?.response?.headers?.["Retry-After"];
  const n = Number(header);
  if (Number.isFinite(n) && n > 0) return Math.ceil(n);
  return null;
}

/**
 * User-facing message for create-order failures. Prefer API Arabic message; no auto-retry.
 */
export function getOrderCreateErrorMessage(err) {
  if (isRateLimitedError(err)) {
    const fromApi = err?.response?.data?.message;
    if (typeof fromApi === "string" && fromApi.trim() && !looksTechnicalOrUnsafe(fromApi.trim())) {
      const retry = getRetryAfterSeconds(err);
      if (retry != null && retry <= 120) {
        return `${fromApi.trim()} (انتظر حوالي ${retry} ثانية)`;
      }
      return fromApi.trim();
    }
    return "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم حاول مرة أخرى.";
  }
  return getSafeApiErrorMessage(err, "تعذر إنشاء الطلب. حاول مرة أخرى.");
}

/** True when register/login reports the email is already taken (verified account). */
export function isEmailAlreadyRegisteredError(err) {
  if (err?.response?.status !== 409) return false;
  return err?.response?.data?.code === EMAIL_ALREADY_REGISTERED_CODE;
}

/** True when axios aborted the request (client timeout). */
export function isAxiosTimeoutError(err) {
  if (err?.code === "ECONNABORTED") return true;
  const msg = String(err?.message || "");
  return /timeout/i.test(msg) || /exceeded/i.test(msg);
}

/** True when the OTP row exists but the verification email could not be sent. */
export function isOtpEmailSendError(err) {
  if (err?.response?.status !== 503) return false;
  const code = err?.response?.data?.code;
  return code === FAILED_TO_SEND_OTP_CODE || code === EMAIL_SERVICE_UNAVAILABLE_CODE;
}

/**
 * Auth-specific mapper: timeout, network, OTP email failure, then safe API message.
 * @param {unknown} err
 * @param {(key: string) => string} t
 * @param {string} fallbackKey e.g. "auth.login.error"
 */
export function getAuthApiErrorMessage(err, t, fallbackKey) {
  if (isAxiosTimeoutError(err)) {
    return t("auth.errors.requestTimeout");
  }
  if (isOtpEmailSendError(err)) {
    const msg = err?.response?.data?.message;
    if (typeof msg === "string" && msg.trim() && !looksTechnicalOrUnsafe(msg.trim())) {
      return msg.trim();
    }
    return t("auth.errors.otpEmailFailed");
  }
  if (err?.message && String(err.message).includes("Network")) {
    return t("auth.errors.network");
  }
  return getSafeApiErrorMessage(err, t(fallbackKey));
}

/**
 * Returns API `message` when it looks like safe user-facing Arabic (or any non-technical) text.
 * Falls back when the backend might have leaked internal/English vendor text.
 */
export function getSafeApiErrorMessage(err, fallback = DEFAULT_GENERIC_AR) {
  if (isAxiosTimeoutError(err)) {
    return "استغرق الطلب وقتاً طويلاً. تحقق من الاتصال وحاول مجدداً.";
  }

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
