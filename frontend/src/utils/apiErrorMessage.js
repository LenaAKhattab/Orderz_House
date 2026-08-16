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
  const code = err?.response?.data?.code;
  if (err?.response?.status === 409 && (code === "PRICING_CHANGED" || code === "PRICING_MISMATCH")) {
    const fromApi = err?.response?.data?.message;
    if (typeof fromApi === "string" && fromApi.trim() && !looksTechnicalOrUnsafe(fromApi.trim())) {
      return fromApi.trim();
    }
    return "تغير السعر المعتمد. حدّث الصفحة وراجع المبلغ بالدينار الأردني قبل إعادة الإرسال.";
  }
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
  if (isAxiosCanceledError(err)) return false;
  if (err?.code === "ECONNABORTED") return true;
  const msg = String(err?.message || "");
  return /timeout/i.test(msg) || /exceeded/i.test(msg);
}

/** True when the request was deliberately cancelled (AbortController / navigation). */
export function isAxiosCanceledError(err) {
  if (!err) return false;
  if (err.code === "ERR_CANCELED" || err.name === "CanceledError" || err.name === "AbortError") return true;
  if (typeof err.message === "string" && /canceled|cancelled|aborted/i.test(err.message)) return true;
  return false;
}

/**
 * True transport failure with no usable HTTP response (CORS block, offline, DNS, TLS, refused).
 * Never true when `err.response` exists — HTTP 4xx/5xx must use status-specific UX.
 */
export function isAxiosNetworkError(err) {
  if (!err || err.response != null) return false;
  if (isAxiosCanceledError(err)) return false;
  if (isAxiosTimeoutError(err)) return false;
  if (err.code === "ERR_NETWORK") return true;
  const msg = String(err.message || "");
  return /Network Error/i.test(msg) || /\bNetwork\b/i.test(msg);
}

/** Dev-only technical classification for console / support — never shown to end users. */
export function getAxiosErrorTechnicalKind(err) {
  if (!err) return "unknown";
  if (isAxiosCanceledError(err)) return "canceled";
  if (isAxiosTimeoutError(err)) return "timeout";
  if (err.response?.status != null) return `http_${err.response.status}`;
  if (isAxiosNetworkError(err)) return "network_no_response";
  return "unknown";
}

function logDevApiErrorContext(err) {
  if (!import.meta.env?.DEV) return;
  try {
    // eslint-disable-next-line no-console
    console.warn("[apiError]", {
      kind: getAxiosErrorTechnicalKind(err),
      code: err?.code || null,
      status: err?.response?.status ?? null,
      apiCode: err?.response?.data?.code ?? null,
      message: err?.message || null,
    });
  } catch {
    /* ignore */
  }
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
  logDevApiErrorContext(err);
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
  if (isAxiosNetworkError(err)) {
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

  if (isAxiosNetworkError(err)) {
    return "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.";
  }

  const code = err?.response?.data?.code;
  if (
    code === "WORK_TOKENS_DEPRECATED" ||
    code === "WORK_TOKENS_ENGINE_DEPRECATED" ||
    code === "VERIFICATION_WORK_TOKEN_REWARDS_DEPRECATED" ||
    code === "PRIORITY_BIDDING_ENGINE_DEPRECATED"
  ) {
    return "هذا الإجراء غير متاح.";
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
    /postgres|error:|constraint|syntax|relation |column |violates|deadlock|neon|stripe|resend|sql|ECONNREFUSED|ETIMEDOUT|request failed with status|duplicate key|npm run|\.sql|bad gateway|service unavailable|internal server error|cloudflare/i.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

export { DEFAULT_GENERIC_AR };
