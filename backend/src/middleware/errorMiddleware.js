const {
  GENERIC_5XX_AR,
  SERVICE_UNAVAILABLE_AR,
  BAD_GATEWAY_AR,
  CODE_INTERNAL_ERROR,
  CODE_SERVICE_UNAVAILABLE,
} = require("../constants/publicErrorMessages");
const { defaultCodeForHttpStatus } = require("../constants/apiErrors");
const { shouldExposeErrorDebug } = require("../config/env");
const { captureException } = require("../config/posthog");

/**
 * When true, the error `message` is sent to the client (must already be safe, user-facing text).
 * When false/undefined and status is 5xx, a generic Arabic message and code are sent instead.
 * Set err.exposeToClient = true on intentional validation/business errors you want to show.
 */
function pickSafeClientPayload(err) {
  const statusCode = err.statusCode || 500;
  const expose = err.exposeToClient === true;

  if (expose) {
    return {
      statusCode,
      message: err.message || GENERIC_5XX_AR,
      code: err.publicCode || defaultCodeForHttpStatus(statusCode),
    };
  }

  if (statusCode >= 500) {
    let message = GENERIC_5XX_AR;
    let code = CODE_INTERNAL_ERROR;
    if (statusCode === 503) {
      message = SERVICE_UNAVAILABLE_AR;
      code = CODE_SERVICE_UNAVAILABLE;
    } else if (statusCode === 502) {
      message = BAD_GATEWAY_AR;
      code = CODE_SERVICE_UNAVAILABLE;
    }
    return { statusCode, message, code };
  }

  // 4xx: assume application threw a deliberate message (legacy pattern). Still avoid echoing pg codes.
  const raw = err.message || "طلب غير صالح.";
  const looksInternal =
    typeof raw === "string" &&
    (/^(error:|severity:|column\s|relation\s|syntax\s)/i.test(raw) ||
      /postgres|connection refused|ECONNREFUSED|ETIMEDOUT|timeout/i.test(raw) ||
      /\bStripe\b|\bResend\b|\bNeon\b|\bAWS\b|duplicate key|violates foreign key/i.test(raw));

  if (looksInternal) {
    return {
      statusCode: statusCode >= 400 && statusCode < 500 ? statusCode : 400,
      message: GENERIC_5XX_AR,
      code: CODE_INTERNAL_ERROR,
    };
  }

  return {
    statusCode,
    message: raw,
    code: err.publicCode || defaultCodeForHttpStatus(statusCode),
  };
}

function logRequestContext(req) {
  const uid = req.user?.sub || req.auth?.userId || null;
  return uid ? ` userId=${uid}` : "";
}

const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]${logRequestContext(req)}`, err.message);
    if (err.logDetails) {
      console.error("[details]", err.logDetails);
    }
    if (err.cause) {
      console.error("[cause]", err.cause);
    }
    if (err.stack) {
      console.error(err.stack);
    }
    const distinctId = req.user?.sub || req.auth?.userId;
    captureException(err, distinctId ? String(distinctId) : undefined);
  } else if (statusCode >= 400 && err.exposeToClient !== true) {
    console.warn(`[${req.method} ${req.originalUrl}]${logRequestContext(req)}`, err.message);
  }

  const payload = pickSafeClientPayload(err);
  const exposeDebug = shouldExposeErrorDebug();

  res.status(payload.statusCode).json({
    success: false,
    message: payload.message,
    code: payload.code,
    ...(exposeDebug
      ? {
          debug: {
            message: String(err.message ?? ""),
            ...(err.stack ? { stack: err.stack } : {}),
          },
        }
      : {}),
  });
};

const notFoundMiddleware = (req, res) => {
  res.status(404).json({
    success: false,
    message: "المسار غير موجود.",
    code: "NOT_FOUND",
  });
};

module.exports = {
  errorMiddleware,
  notFoundMiddleware,
};
