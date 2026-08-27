/**
 * Web-Admin-A1 — Staging-only HTTP permission QA (GET matrix).
 *
 * - Loads backend/.env.staging (refuses Production Neon)
 * - Does NOT run migrations / seed / deploy
 * - GET/list only (no PATCH/DELETE mutations)
 * - Mints JWT from existing Staging users (read-only lookup)
 *
 * Run: node scripts/webAdminA1HttpPermissionQa.js
 */
const path = require("path");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
} = require("../src/config/stagingQaEnv");

const PORT = Number(process.env.WEB_ADMIN_A1_QA_PORT || 5017);
const HOST = "127.0.0.1";

const ENDPOINTS = [
  { key: "kyc_list", method: "GET", path: "/api/super-admin/freelancer-activation-requests?limit=5&status=pending_review" },
  { key: "activation_queue", method: "GET", path: "/api/admin/subscriptions/activation-queue?limit=5" },
  { key: "assignable_plans", method: "GET", path: "/api/admin/subscriptions/assignable-plans" },
  { key: "pantry_requests", method: "GET", path: "/api/admin/pantry/requests?limit=5" },
  { key: "articles_list", method: "GET", path: "/api/super-admin/marketplace-articles?limit=5" },
  { key: "feedback_list", method: "GET", path: "/api/super-admin/feedback?limit=5" },
  { key: "notifications_list", method: "GET", path: "/api/notifications?limit=5", ownResource: true },
  { key: "freelancers_search", method: "GET", path: "/api/admin/freelancers?q=a&limit=5" },
  // Exclusions (expect 403 for admin if still SA-only)
  { key: "feedback_topics_create_probe", method: "POST", path: "/api/super-admin/feedback/topics", body: {}, exclusion: true },
  { key: "bildazo_retry_probe", method: "POST", path: "/api/super-admin/marketplace-articles/00000000-0000-0000-0000-000000000001/bildazo-publish/retry", body: {}, exclusion: true },
];

function requestJson({ method, urlPath, token, body }) {
  return new Promise((resolve) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: urlPath,
        method,
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 300),
          });
        });
      },
    );
    req.on("error", (err) => resolve({ status: 0, body: String(err.message || err) }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "timeout" });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function findRoleUser(pool, role) {
  const { rows } = await pool.query(
    `SELECT id, email, role, account_id, is_active
     FROM users
     WHERE LOWER(TRIM(role::text)) = LOWER($1)
       AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY id ASC
     LIMIT 1`,
    [role],
  );
  return rows[0] || null;
}

function mintToken(userRow) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET missing/short after staging env load");
  }
  return jwt.sign(
    {
      sub: String(userRow.id),
      accountId: userRow.account_id,
      role: userRow.role,
      email: userRow.email,
    },
    secret,
    { expiresIn: "15m" },
  );
}

function summarizeRole(label, matrix) {
  const lines = [`### ${label}`];
  for (const row of matrix) {
    lines.push(`- ${row.key}: ${row.status}${row.ok ? " OK" : " FAIL"} (${row.note || ""})`);
  }
  return lines.join("\n");
}

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  const pending = await countPendingMigrations();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        phase: "Web-Admin-A1 HTTP QA",
        appEnv: target.appEnv,
        db: target.maskedTarget,
        classification: target.db.classification,
        pendingMigrations: pending.pendingCount,
        note: "GET/list only; no mutations; no Production DB",
      },
      null,
      2,
    ),
  );

  if (pending.pendingCount && pending.pendingCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[warn] Staging has ${pending.pendingCount} pending migration(s); continuing GET permission matrix only (no migrate). Sample: ${(pending.pendingSample || []).join(", ")}`,
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const rolesNeeded = ["admin", "super_admin", "freelancer", "client"];
  const users = {};
  for (const role of rolesNeeded) {
    users[role] = await findRoleUser(pool, role);
  }
  await pool.end();

  const missing = rolesNeeded.filter((r) => !users[r]);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        {
          status: "BLOCKED",
          reason: "Missing staging users for roles",
          missing,
          hint: "Provide Staging admin/super_admin accounts (no seed in this phase).",
        },
        null,
        2,
      ),
    );
    process.exit(3);
  }

  const tokens = Object.fromEntries(rolesNeeded.map((r) => [r, mintToken(users[r])]));

  // Boot app after env is staging (do not use server.js — avoids Production dotenv override race).
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const app = require(path.join(__dirname, "..", "src", "app"));
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(PORT, HOST, () => resolve(s));
    s.on("error", reject);
  });

  const results = {
    admin: [],
    super_admin: [],
    freelancer: [],
    client: [],
    unauthenticated: [],
  };

  try {
    for (const ep of ENDPOINTS) {
      // unauthenticated
      {
        const res = await requestJson({ method: ep.method, urlPath: ep.path, body: ep.body });
        const expect = 401;
        results.unauthenticated.push({
          key: ep.key,
          status: res.status,
          ok: res.status === expect,
          note: `expect ${expect}`,
        });
      }

      for (const role of ["admin", "super_admin", "freelancer", "client"]) {
        const res = await requestJson({
          method: ep.method,
          urlPath: ep.path,
          token: tokens[role],
          body: ep.body,
        });
        let expect;
        let note;
        if (ep.exclusion) {
          if (role === "super_admin") {
            // May be 400/404 validation — not 401; admin must not be allowed (403)
            expect = null;
            note = `SA probe status=${res.status} (not asserting success)`;
          } else if (role === "admin") {
            expect = 403;
            note = "exclusion must stay forbidden for admin";
          } else {
            expect = 403;
            note = "non-staff forbidden";
          }
        } else if (ep.ownResource) {
          // Authenticated users may list their own notifications.
          if (role === "admin" || role === "super_admin" || role === "freelancer" || role === "client") {
            expect = 200;
            note = "own notifications allowed";
          }
        } else if (role === "admin" || role === "super_admin") {
          expect = 200;
          note = "action endpoint allowed";
        } else {
          expect = 403;
          note = "non-staff forbidden";
        }
        const ok = expect == null ? res.status !== 401 && res.status !== 0 : res.status === expect;
        results[role].push({ key: ep.key, status: res.status, ok, note });
      }
    }
  } finally {
    await new Promise((r) => server.close(() => r()));
  }

  const actionKeys = ENDPOINTS.filter((e) => !e.exclusion).map((e) => e.key);
  const rolePass = (role) =>
    results[role].filter((r) => actionKeys.includes(r.key)).every((r) => r.ok);
  const exclusionAdminOk = results.admin.filter((r) => r.key.includes("probe")).every((r) => r.ok);
  const unauthOk = results.unauthenticated.filter((r) => actionKeys.includes(r.key)).every((r) => r.ok);

  const overall =
    rolePass("admin") &&
    rolePass("super_admin") &&
    rolePass("freelancer") &&
    rolePass("client") &&
    unauthOk &&
    exclusionAdminOk
      ? "PASS"
      : "PARTIAL";

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      `OVERALL_HTTP_MATRIX: ${overall}`,
      summarizeRole("admin", results.admin),
      summarizeRole("super_admin", results.super_admin),
      summarizeRole("freelancer", results.freelancer),
      summarizeRole("client", results.client),
      summarizeRole("unauthenticated", results.unauthenticated),
      "",
      "UPDATE_ACTIONS: manual/staging data needed (GET-only by design)",
      `USERS: admin=${users.admin.email} sa=${users.super_admin.email} fr=${users.freelancer.email} cl=${users.client.email}`,
    ].join("\n"),
  );

  process.exit(overall === "PASS" ? 0 : 2);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("FAILED", err && err.message ? err.message : err);
  process.exit(1);
});
