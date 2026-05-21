/**
 * Logs slow API requests (default threshold 1500ms).
 * Set SLOW_REQUEST_LOG_MS=0 to log all /api requests in development.
 */

function requestTimingMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  const path = req.originalUrl || req.url || "";

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const threshold = Number(process.env.SLOW_REQUEST_LOG_MS ?? 1500);
    const logAll = String(process.env.LOG_ALL_REQUEST_TIMING || "").trim() === "1";
    if (!logAll && ms < threshold) return;

    const uid = req.auth?.userId ?? req.user?.sub ?? null;
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        component: "api_timing",
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(ms),
        userId: uid,
      }),
    );
  });

  next();
}

module.exports = { requestTimingMiddleware };
