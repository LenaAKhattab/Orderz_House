const posthogAnalyticsService = require("./posthogAnalyticsService");
const publicPageViewService = require("./publicPageViewService");
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
      { timeoutMs: 6000 },
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
  let pageViewsAllTime = null;
  let activeUsersLast7Days = null;
  let localPageViewsTotal = null;
  let localLastPageviewAt = null;
  let localActiveUsersLast7Days = null;
  let snapshotError = null;

  try {
    [localPageViewsTotal, localLastPageviewAt, localActiveUsersLast7Days] = await Promise.all([
      publicPageViewService.getTotalPageViewCount(),
      publicPageViewService.getLastPageViewAt(),
      publicPageViewService.getActiveUsersLast7Days(),
    ]);
  } catch {
    localPageViewsTotal = null;
    localLastPageviewAt = null;
    localActiveUsersLast7Days = null;
  }

  if (cfg) {
    const probe = await probeHogql(cfg);
    hogqlReachable = probe.reachable;
    hogqlError = probe.error;

    if (hogqlReachable) {
      try {
        const snap = await posthogAnalyticsService.getHeroSnapshotNumbers();
        pageViewsAllTime = snap.pageViewsAllTime;
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
      pageViewsAllTime,
      activeUsersLast7Days,
      lastPageviewAt,
      localPageViewsTotal,
      localLastPageviewAt,
      localActiveUsersLast7Days,
      error: snapshotError,
    },
    degraded,
    warnings: env.warnings,
    errors: env.errors,
    hints: buildHints({
      env,
      hogqlReachable,
      lastPageviewAt,
      pageViewsAllTime,
      localPageViewsTotal,
      localLastPageviewAt,
      localActiveUsersLast7Days,
    }),
  };
}

function buildHints({
  env,
  hogqlReachable,
  lastPageviewAt,
  pageViewsAllTime,
  localPageViewsTotal,
  localLastPageviewAt,
  localActiveUsersLast7Days,
}) {
  const hints = [];
  if (!env.hogqlReady) {
    hints.push("أكمل إعداد POSTHOG_PROJECT_ID و POSTHOG_PERSONAL_API_KEY على الخادم.");
  } else if (!hogqlReachable) {
    hints.push("PostHog لا يستجيب للاستعلامات — تحقق من المضيف والمفاتيح.");
  } else if (pageViewsAllTime === 0 && !lastPageviewAt && localPageViewsTotal === 0) {
    hints.push("لا توجد مشاهدات مسجّلة — تأكد من تشغيل migration 072 وتفعيل تتبع الصفحة المحلي.");
  } else if (localPageViewsTotal === 0 && !localLastPageviewAt) {
    hints.push("عداد المشاهدات المحلي فارغ — سجّل زيارة من المتصفح أو تحقق من migration 072.");
  } else if (localActiveUsersLast7Days === 0 && localPageViewsTotal > 0) {
    hints.push("المشاهدات المحلية موجودة لكن «النشطون» صفر — قد يكون كل الزوار خارج نافذة 7 أيام أو بدون client_session_id.");
  }
  return hints;
}

/**
 * Public homepage hero stats — local DB only (no PostHog HogQL).
 * @param {{ showVisitorsCount: boolean, showActiveUsersCount: boolean }} opts
 */
async function getPublicHomeAnalyticsMeta(opts) {
  const queriedAt = new Date().toISOString();

  /** @type {Record<string, string>} */
  const reasons = {
    visitors: opts.showVisitorsCount ? "pending" : "toggle_off",
    activeUsers: opts.showActiveUsersCount ? "pending" : "toggle_off",
  };

  let lastPageviewAt = null;
  let analyticsDegraded = false;

  if (!opts.showVisitorsCount && !opts.showActiveUsersCount) {
    return {
      queriedAt,
      analyticsDegraded: false,
      analyticsMisconfigured: false,
      lastPageviewAt: null,
      reasons,
    };
  }

  let visitors = null;
  let activeUsers = null;

  const needVisitors = opts.showVisitorsCount;
  const needActive = opts.showActiveUsersCount;

  try {
    const tasks = [];
    if (needVisitors) {
      tasks.push(publicPageViewService.getTotalPageViewCount());
      tasks.push(publicPageViewService.getLastPageViewAt());
    }
    if (needActive) {
      tasks.push(publicPageViewService.getActiveUsersLast7Days());
    }

    const results = await Promise.all(tasks);
    let idx = 0;

    if (needVisitors) {
      visitors = results[idx++];
      lastPageviewAt = results[idx++];
      reasons.visitors = visitors > 0 ? "ok" : "zero_traffic";
    }

    if (needActive) {
      activeUsers = results[idx++];
      reasons.activeUsers = activeUsers > 0 ? "ok" : "zero_traffic";
    }
  } catch {
    analyticsDegraded = true;
    if (needVisitors) reasons.visitors = "db_unavailable";
    if (needActive) reasons.activeUsers = "db_unavailable";
  }

  return {
    queriedAt,
    analyticsDegraded,
    analyticsMisconfigured: false,
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
