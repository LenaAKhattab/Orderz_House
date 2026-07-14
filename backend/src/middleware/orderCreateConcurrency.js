/**
 * In-memory concurrency guard for heavy create-order paths (AI double-fire / parallel tabs).
 * Max concurrent create requests per authenticated user.
 */

const { RATE_LIMITED_CODE } = require("./rateLimitHelpers");
const { logRateLimitExceeded } = require("../utils/rateLimitLog");

const inflightByUser = new Map();

/**
 * @param {{ maxConcurrent?: number, limiterName?: string }} [opts]
 */
function createOrderConcurrencyGuard(opts = {}) {
  const maxConcurrent = Math.max(1, Number(opts.maxConcurrent) || 1);
  const limiterName = opts.limiterName || "order_create_concurrency";

  return function orderCreateConcurrencyMiddleware(req, res, next) {
    const uid = req?.auth?.userId != null ? String(req.auth.userId).trim() : "";
    if (!uid) return next();

    const current = inflightByUser.get(uid) || 0;
    if (current >= maxConcurrent) {
      const retryAfterSec = 3;
      res.set("Retry-After", String(retryAfterSec));
      try {
        logRateLimitExceeded({ limiterName, req, retryAfterSec });
      } catch {
        /* ignore */
      }
      return res.status(429).json({
        success: false,
        message: "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم حاول مرة أخرى.",
        code: RATE_LIMITED_CODE,
        limiter: limiterName,
      });
    }

    inflightByUser.set(uid, current + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const n = inflightByUser.get(uid) || 1;
      if (n <= 1) inflightByUser.delete(uid);
      else inflightByUser.set(uid, n - 1);
    };

    res.on("finish", release);
    res.on("close", release);
    return next();
  };
}

/** Test helper */
function _resetCreateOrderConcurrencyForTests() {
  inflightByUser.clear();
}

module.exports = {
  createOrderConcurrencyGuard,
  _resetCreateOrderConcurrencyForTests,
};
