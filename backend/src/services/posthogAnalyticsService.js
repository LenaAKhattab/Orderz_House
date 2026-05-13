/**
 * Server-side PostHog analytics via HogQL (personal API key — never expose to browsers).
 */

const RANGE_PRESETS = Object.freeze({
  today: "today",
  "7d": "7d",
  "30d": "30d",
});

function buildPublicError(message, statusCode = 503, publicCode = "PH_UNAVAILABLE", logDetails = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.publicCode = publicCode;
  err.exposeToClient = true;
  if (logDetails) err.logDetails = logDetails;
  return err;
}

function normalizeHost(raw) {
  const s = String(raw || "https://app.posthog.com").trim().replace(/\/+$/, "");
  return s || "https://app.posthog.com";
}

function resolvePosthogConfig() {
  const projectId = String(process.env.POSTHOG_PROJECT_ID || "").trim();
  let apiKey = String(process.env.POSTHOG_PERSONAL_API_KEY || "").trim();
  const host = normalizeHost(process.env.POSTHOG_HOST);

  const wizardProjectKey = String(process.env.POSTHOG_API_KEY || "").trim();
  if (!apiKey && wizardProjectKey.startsWith("phc_")) {
    throw buildPublicError(
      "PostHog server analytics needs a Personal API Key (not the phc_ project key).",
      503,
      "PH_CONFIG_MISSING",
      "Add POSTHOG_PROJECT_ID (numeric, from Project settings) and POSTHOG_PERSONAL_API_KEY (PostHog → Account settings → Personal API Keys). POSTHOG_API_KEY / phc_… is only for the browser.",
    );
  }

  if (!projectId || !apiKey) {
    throw buildPublicError(
      "PostHog analytics is not configured on the server.",
      503,
      "PH_CONFIG_MISSING",
      "POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY is missing.",
    );
  }

  if (apiKey.startsWith("phc_")) {
    throw buildPublicError(
      "POSTHOG_PERSONAL_API_KEY must be a Personal API Key from PostHog, not the phc_ project key.",
      503,
      "PH_CONFIG_INVALID",
      "Create a key under Account settings → Personal API Keys with query access; do not paste VITE_POSTHOG_KEY / POSTHOG_API_KEY here.",
    );
  }

  return { projectId, apiKey, host };
}

function rangeToWhereClause(rangeKey) {
  const key = RANGE_PRESETS[rangeKey] ? rangeKey : "7d";
  if (key === "today") {
    return "timestamp >= toStartOfDay(now()) AND timestamp < now() + INTERVAL 1 DAY";
  }
  if (key === "30d") {
    return "timestamp >= now() - INTERVAL 30 DAY AND timestamp < now() + INTERVAL 1 MINUTE";
  }
  return "timestamp >= now() - INTERVAL 7 DAY AND timestamp < now() + INTERVAL 1 MINUTE";
}

/** Same validation as resolvePosthogConfig but returns null instead of throwing (dashboard graceful fallback). */
function readPosthogCredentialsLoose() {
  const projectId = String(process.env.POSTHOG_PROJECT_ID || "").trim();
  const apiKey = String(process.env.POSTHOG_PERSONAL_API_KEY || "").trim();
  const host = normalizeHost(process.env.POSTHOG_HOST);
  if (!projectId || !apiKey) return null;
  if (apiKey.startsWith("phc_")) return null;
  return { projectId, apiKey, host };
}

async function executeHogQL(cfg, query) {
  const { projectId, apiKey, host } = cfg;
  const url = `${host}/api/projects/${encodeURIComponent(projectId)}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query,
      },
    }),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const hint = typeof text === "string" ? text.slice(0, 800) : "";
    let code = "PH_QUERY_FAILED";
    if (res.status === 401 || res.status === 403) code = "PH_ACCESS_DENIED";
    const status = res.status >= 500 ? 502 : 503;
    throw buildPublicError("PostHog analytics query failed.", status, code, hint || null);
  }

  return json;
}

async function runHogQL(query) {
  return executeHogQL(resolvePosthogConfig(), query);
}

function firstScalar(json) {
  const row = json?.results?.[0];
  if (!row || !row.length) return 0;
  const v = row[0];
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowsObjects(json) {
  const cols = Array.isArray(json?.columns) ? json.columns : [];
  const results = Array.isArray(json?.results) ? json.results : [];
  return results.map((row) => {
    const obj = {};
    cols.forEach((c, i) => {
      obj[String(c)] = row[i];
    });
    return obj;
  });
}

async function scalar(sql) {
  const json = await runHogQL(sql);
  return firstScalar(json);
}

async function scalarWithCfg(cfg, sql) {
  const json = await executeHogQL(cfg, sql);
  return firstScalar(json);
}

const OVERVIEW_EVENT_NAMES = [
  "signup_completed",
  "user_logged_in",
  "client_order_created",
  "fixed_order_taken",
  "bid_submitted",
  "order_completed",
  "subscription_purchased",
  "financial_claim_submitted",
];

function hogqlEventInList() {
  return OVERVIEW_EVENT_NAMES.map((e) => `'${e.replace(/'/g, "\\'")}'`).join(", ");
}

/**
 * PostHog-backed slices for Super Admin overview (KPIs today, 7d trends, ranged event counts, top pages).
 */
async function fetchSuperAdminOverviewPosthog(cfg, { range = "7d", topLimit = 10 } = {}) {
  const whereRange = rangeToWhereClause(range);
  const topN = Math.min(Math.max(Number(topLimit) || 10, 1), 25);
  const todayClause = "timestamp >= toStartOfDay(now()) AND timestamp < now() + INTERVAL 1 DAY";

  const [
    visitorsToday,
    activeUsersToday,
    ordersToday,
    visitorsDailyJson,
    ordersDailyJson,
    eventBreakdownJson,
    topPagesJson,
  ] = await Promise.all([
    scalarWithCfg(
      cfg,
      `
      SELECT uniq(person_id)
      FROM events
      WHERE event = '$pageview'
        AND ${todayClause}
    `,
    ),
    scalarWithCfg(
      cfg,
      `
      SELECT uniq(person_id)
      FROM events
      WHERE event = 'user_logged_in'
        AND ${todayClause}
    `,
    ),
    scalarWithCfg(
      cfg,
      `
      SELECT count()
      FROM events
      WHERE event = 'client_order_created'
        AND ${todayClause}
    `,
    ),
    executeHogQL(
      cfg,
      `
      SELECT toDate(timestamp) AS day, uniq(person_id) AS visitors
      FROM events
      WHERE event = '$pageview'
        AND timestamp >= now() - INTERVAL 7 DAY
        AND timestamp < now() + INTERVAL 1 MINUTE
      GROUP BY day
      ORDER BY day ASC
    `,
    ),
    executeHogQL(
      cfg,
      `
      SELECT toDate(timestamp) AS day, count() AS orders
      FROM events
      WHERE event = 'client_order_created'
        AND timestamp >= now() - INTERVAL 7 DAY
        AND timestamp < now() + INTERVAL 1 MINUTE
      GROUP BY day
      ORDER BY day ASC
    `,
    ),
    executeHogQL(
      cfg,
      `
      SELECT event AS evt, count() AS c
      FROM events
      WHERE ${whereRange}
        AND event IN (${hogqlEventInList()})
      GROUP BY evt
    `,
    ),
    executeHogQL(
      cfg,
      `
      SELECT
        coalesce(nullIf(toString(properties['path']), ''), nullIf(toString(properties['$pathname']), ''), '(unknown)') AS page_path,
        count() AS page_views
      FROM events
      WHERE event = '$pageview'
        AND ${whereRange}
      GROUP BY page_path
      ORDER BY page_views DESC
      LIMIT ${topN}
    `,
    ),
  ]);

  const eventRows = rowsObjects(eventBreakdownJson);
  const eventCounts = {};
  OVERVIEW_EVENT_NAMES.forEach((n) => {
    eventCounts[n] = 0;
  });
  for (const row of eventRows) {
    const name = row.evt != null ? String(row.evt) : "";
    if (name && Object.prototype.hasOwnProperty.call(eventCounts, name)) {
      eventCounts[name] = Math.trunc(Number(row.c) || 0);
    }
  }

  const visitorsByDay = rowsObjects(visitorsDailyJson).map((r) => ({
    date: r.day != null ? String(r.day).slice(0, 10) : "",
    visitors: Math.trunc(Number(r.visitors) || 0),
  }));

  const ordersByDay = rowsObjects(ordersDailyJson).map((r) => ({
    date: r.day != null ? String(r.day).slice(0, 10) : "",
    orders: Math.trunc(Number(r.orders) || 0),
  }));

  const topPageRows = rowsObjects(topPagesJson).map((r) => ({
    pagePath: r.page_path != null ? String(r.page_path) : "",
    pageViews: Math.trunc(Number(r.page_views) || 0),
  }));

  return {
    kpisToday: {
      visitorsToday: Math.trunc(visitorsToday),
      activeUsersToday: Math.trunc(activeUsersToday),
      ordersToday: Math.trunc(ordersToday),
    },
    trends: {
      visitorsByDay,
      ordersByDay,
    },
    eventCounts,
    topPages: topPageRows,
  };
}

async function getHeroSnapshotNumbers() {
  const visitors7d = await scalar(`
    SELECT uniq(person_id)
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL 7 DAY
      AND timestamp < now() + INTERVAL 1 MINUTE
  `);
  /** Weekly actives: distinct persons with any ingested event in the last 7 days (matches hero copy “هذا الأسبوع”). */
  const activeUsers7d = await scalar(`
    SELECT uniq(person_id)
    FROM events
    WHERE timestamp >= now() - INTERVAL 7 DAY
      AND timestamp < now() + INTERVAL 1 MINUTE
  `);
  return {
    visitorsLast7Days: Math.trunc(visitors7d),
    activeUsersLast7Days: Math.trunc(activeUsers7d),
  };
}

module.exports = {
  getHeroSnapshotNumbers,
  RANGE_PRESETS,
  rangeToWhereClause,
  readPosthogCredentialsLoose,
  fetchSuperAdminOverviewPosthog,
};
