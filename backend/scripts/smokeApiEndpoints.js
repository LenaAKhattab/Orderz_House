/**
 * Quick smoke check for HTTP status codes (find unexpected 500s).
 *
 * Usage:
 *   BASE_URL=https://your-api.com node scripts/smokeApiEndpoints.js
 *   BASE_URL=http://localhost:5000 AUTH_TOKEN="<jwt>" node scripts/smokeApiEndpoints.js
 *
 * Without AUTH_TOKEN, protected routes should return 401 — not 500.
 */

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const BASE = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN = (process.env.AUTH_TOKEN || process.env.SMOKE_AUTH_TOKEN || "").trim();

/** [method, path, { needAuth?: boolean }] — extend as needed for your deploy. */
const ENDPOINTS = [
  ["GET", "/api/health", { needAuth: false }],
  ["GET", "/api/categories", { needAuth: false }],
  ["GET", "/api/plans", { needAuth: false }],
  ["GET", "/api/admin/orders", { needAuth: true }],
  ["GET", "/api/auth/me", { needAuth: true }],
];

async function one(method, route, opts) {
  const url = `${BASE}${route}`;
  const headers = { Accept: "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { method, headers });
  const text = await res.text();
  const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  return {
    method,
    route,
    status: res.status,
    needAuth: opts.needAuth,
    bodySnippet: snippet,
    ok: res.status < 400 || res.status === 401 || res.status === 403,
    suspicious500: res.status === 500,
  };
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`BASE_URL=${BASE}${TOKEN ? " (Bearer token set)" : " (no token — admin routes expect 401)"}\n`);

  const rows = [];
  for (const [method, route, opts] of ENDPOINTS) {
    try {
      rows.push(await one(method, route, opts || {}));
    } catch (e) {
      rows.push({
        method,
        route,
        status: "ERR",
        error: e.message,
        suspicious500: true,
      });
    }
  }

  for (const r of rows) {
    const flag = r.suspicious500 ? " <<< 500" : "";
    // eslint-disable-next-line no-console
    console.log(`${r.method} ${r.route} → ${r.status}${flag}`);
    if (r.status === 500 || r.status === "ERR") {
      // eslint-disable-next-line no-console
      console.log(`   ${r.bodySnippet || r.error || ""}`);
    }
  }

  const bad = rows.filter((r) => r.suspicious500 || r.status === "ERR");
  process.exitCode = bad.length ? 1 : 0;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
