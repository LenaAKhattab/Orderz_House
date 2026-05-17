const posthogAnalyticsService = require("./posthogAnalyticsService");
const { validatePosthogEnv, logPosthogEnvWarningsOnce } = require("../utils/posthogEnvValidation");

let lastSuccessfulHogqlAt = null;

function getNodeEnv() {
  return String(process.env.NODE_ENV || "development").trim();
}

async function probeHogql(cfg) {
  try {
    await posthogAnalyticsService.scalarWithCfg(
      cfg,
      `SELECT 1`,
    );
    return { reachable: true, error: null };
  } catch (err) {
    return {
      reachable: false,
      error: err?.publicCode || err?.message || "PostHog query failed",
    };
  }
}

async function fetchLastPageviewAt(cfg) {
  try {
    const json = await posthogAnalyticsService.executeHogQLWithCfg(
      cfg,
      `
      SELECT max(timestamp) AS last_at
      FROM events
      WHERE event = '$pageview'
        AND timestamp >= now() - INTERVAL 30 DAY
    `,
    );
    const row = json?.results?.[0];
    const raw = row?.[0];
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * Build health report for Super Admin (no secrets).
 */
async function getAnalyticsHealthReport() {
  logPosthogEnvWarningsOnce();
  const env = validatePosthogEnv();
  const cfg = posthogAnalyticsService.readPosthogCredentialsLoose();
  const queriedAt = new Date().toISOString();

  let hogqlReachable = false;
  let hogqlError = null;
  let lastPageviewAt = null;
  let visitorsLast7Days = null;
  let activeUsersLast7Days = null;
  let snapshotError = null;

  if (cfg) {
    const probe = await probeHogql(cfg);
    hogqlReachable = probe.reachable;
    hogqlError = probe.error;

    if (hogqlReachable) {
      try {
        const snap = await posthogAnalyticsService.getHeroSnapshotNumbers();
        visitorsLast7Days = snap.visitorsLast7Days;
        activeUsersLast7Days = snap.activeUsersLast7Days;
        lastPageviewAt = await fetchLastPageviewAt(cfg);
        lastSuccessfulHogqlAt = queriedAt;
      } catch (err) {
        snapshotError = err?.publicCode || err?.message || "snapshot_failed";
      }
    }
  } else {
    hogqlError = "hogql_not_configured";
  }

  const degraded = !env.hogqlReady || !hogqlReachable || Boolean(snapshotError);

  return {
    environment: getNodeEnv(),
    queriedAt,
    lastSuccessfulHogqlAt,
    posthog: {
      host: env.host,
      hogqlConfigured: env.hogqlReady,
      hogqlReachable,
      hogqlError,
      captureConfigured: env.captureReady,
      projectIdPresent: env.projectIdPresent,
      personalKeyPresent: env.personalKeyPresent,
    },
    snapshot: {
      visitorsLast7Days,
      activeUsersLast7Days,
      lastPageviewAt,
      error: snapshotError,
    },
    degraded,
    warnings: env.warnings,
    errors: env.errors,
    hints: buildHints({ env, hogqlReachable, lastPageviewAt, visitorsLast7Days }),
  };
}

function buildHints({ env, hogqlReachable, lastPageviewAt, visitorsLast7Days }) {
  const hints = [];
  if (!env.hogqlReady) {
    hints.push("أكمل إعداد POSTHOG_PROJECT_ID و POSTHOG_PERSONAL_API_KEY على الخادم.");
  } else if (!hogqlReachable) {
    hints.push("PostHog لا يستجيب للاستعلامات — تحقق من المضيف والمفاتيح.");
  } else if (visitorsLast7Days === 0 && !lastPageviewAt) {
    hints.push("لا توجد أحداث $pageview — فعّل تتبع المتصفح (VITE_POSTHOG_KEY) أو VITE_POSTHOG_ENABLE_IN_DEV محلياً.");
  }
  return hints;
}

/**
 * Metadata for public homepage stats (reason codes, no secrets).
 * @param {{ showVisitorsCount: boolean, showActiveUsersCount: boolean }} opts
 */
async function getPublicHomeAnalyticsMeta(opts) {
  logPosthogEnvWarningsOnce();
  const env = validatePosthogEnv();
  const cfg = posthogAnalyticsService.readPosthogCredentialsLoose();
  const queriedAt = new Date().toISOString();

  /** @type {Record<string, string>} */
  const reasons = {
    visitors: opts.showVisitorsCount ? "pending" : "toggle_off",
    activeUsers: opts.showActiveUsersCount ? "pending" : "toggle_off",
  };

  let lastPageviewAt = null;
  let analyticsDegraded = false;
  let analyticsMisconfigured = !env.hogqlReady;

  if (!opts.showVisitorsCount && !opts.showActiveUsersCount) {
    return {
      queriedAt,
      analyticsDegraded: false,
      analyticsMisconfigured,
      lastPageviewAt: null,
      reasons,
    };
  }

  if (!cfg || !env.hogqlReady) {
    analyticsDegraded = true;
    analyticsMisconfigured = true;
    if (opts.showVisitorsCount) reasons.visitors = "posthog_misconfigured";
    if (opts.showActiveUsersCount) reasons.activeUsers = "posthog_misconfigured";
    return { queriedAt, analyticsDegraded, analyticsMisconfigured, lastPageviewAt, reasons };
  }

  let visitors = null;
  let activeUsers = null;

  try {
    const snap = await posthogAnalyticsService.getHeroSnapshotNumbers();
    lastPageviewAt = await fetchLastPageviewAt(cfg);
    lastSuccessfulHogqlAt = queriedAt;
    if (opts.showVisitorsCount) visitors = snap.visitorsLast7Days;
    if (opts.showActiveUsersCount) activeUsers = snap.activeUsersLast7Days;

    if (opts.showVisitorsCount) {
      if (snap.visitorsLast7Days > 0) reasons.visitors = "ok";
      else if (!lastPageviewAt) reasons.visitors = "waiting_first_pageview";
      else reasons.visitors = "zero_traffic";
    }
    if (opts.showActiveUsersCount) {
      reasons.activeUsers = snap.activeUsersLast7Days > 0 ? "ok" : "zero_traffic";
    }
  } catch {
    analyticsDegraded = true;
    if (opts.showVisitorsCount) reasons.visitors = "posthog_unavailable";
    if (opts.showActiveUsersCount) reasons.activeUsers = "posthog_unavailable";
  }

  return {
    queriedAt,
    analyticsDegraded,
    analyticsMisconfigured,
    lastPageviewAt,
    reasons,
    visitors,
    activeUsers,
  };
}

module.exports = {
  getAnalyticsHealthReport,
  getPublicHomeAnalyticsMeta,
  getLastSuccessfulHogqlAt: () => lastSuccessfulHogqlAt,
};
