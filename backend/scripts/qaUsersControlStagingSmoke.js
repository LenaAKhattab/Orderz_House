/**
 * Staging-only smoke for Super Admin Users Control Center.
 * Loads .env.staging, refuses Production Neon, no payments/Stripe/wallet mutations.
 *
 * Usage (from backend/):
 *   node scripts/qaUsersControlStagingSmoke.js
 */
const path = require("node:path");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
} = require("../src/config/stagingQaEnv");
const { KNOWN_PRODUCTION_HOST_MARKERS } = require("../src/utils/databaseEnvironmentSafety");

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();

const results = [];
function step(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 240) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
}

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      accountId: user.account_id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" },
  );
}

function hasSecrets(obj, depth = 0) {
  if (obj == null || depth > 8) return false;
  if (typeof obj !== "object") return false;
  for (const [k, v] of Object.entries(obj)) {
    if (/password_hash|passwordHash|reset_token|refresh_token|jwt|stripe_customer_id|sk_live|sk_test/i.test(k)) {
      return true;
    }
    if (typeof v === "string" && /sk_live_|sk_test_|password_hash/i.test(v)) return true;
    if (hasSecrets(v, depth + 1)) return true;
  }
  return false;
}

async function main() {
  console.log("=== Users Control Staging Smoke ===");
  console.log(
    JSON.stringify({
      appEnv: target.appEnv,
      maskedTarget: target.maskedTarget,
      classification: target.db.classification,
    }),
  );

  const host = String(target.db.host || "").toLowerCase();
  step(
    "env not production host",
    !KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase())),
    target.maskedTarget,
  );
  step("APP_ENV staging", target.appEnv === "staging");

  const pending = await countPendingMigrations();
  step("pending migrations 0", pending.pendingCount === 0, `pending=${pending.pendingCount}`);

  const { pool } = require("../src/config/db");
  const service = require("../src/services/superAdminUsersControlService");

  const table = await pool.query(
    `SELECT to_regclass('public.super_admin_user_control_audit_logs') IS NOT NULL AS ok`,
  );
  step("audit table exists", table.rows[0]?.ok === true);

  const { rows: saRows } = await pool.query(
    `SELECT id, email, role, account_id, is_active
       FROM users WHERE role = 'super_admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  const superAdmin = saRows[0];
  step("super_admin exists", !!superAdmin, superAdmin ? `id=${superAdmin.id}` : "");

  const { rows: adminRows } = await pool.query(
    `SELECT id, email, role, account_id, is_active
       FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  const admin = adminRows[0] || null;
  step("admin exists (for deny check)", !!admin, admin ? `id=${admin.id}` : "none");

  const { rows: freelancers } = await pool.query(
    `SELECT id, email, role, account_id, first_name, family_name
       FROM users
      WHERE role = 'freelancer' AND is_active = TRUE
        AND (
          email ILIKE '%qa%' OR email ILIKE '%test%' OR email ILIKE '%example.com%'
          OR first_name ILIKE '%qa%' OR family_name ILIKE '%qa%'
        )
      ORDER BY id ASC
      LIMIT 5`,
  );
  let qaUsers = freelancers;
  if (qaUsers.length < 2) {
    const fallback = await pool.query(
      `SELECT id, email, role, account_id, first_name, family_name
         FROM users WHERE role = 'freelancer' AND is_active = TRUE ORDER BY id DESC LIMIT 2`,
    );
    qaUsers = fallback.rows;
    step("QA freelancers preferred; fallback used", qaUsers.length >= 1, `count=${qaUsers.length}`);
  } else {
    step("QA freelancers found", true, `count=${qaUsers.length}`);
  }

  if (!superAdmin || !qaUsers[0]) {
    console.log("Cannot continue without super_admin + freelancer.");
    await pool.end();
    process.exit(1);
  }

  // --- Service-level list/detail ---
  const stats = await service.getStats();
  step("getStats", Number(stats.totals) >= 1, `totals=${stats.totals}`);

  const listed = await service.listUsers({ q: String(qaUsers[0].id), limit: 5, page: 1 });
  step("listUsers by id", Array.isArray(listed.items) && listed.items.length >= 1, `n=${listed.items?.length || 0}`);
  step("listUsers no secrets", !hasSecrets(listed));

  const detail = await service.getUserDetail(qaUsers[0].id);
  step("getUserDetail", !!detail?.profile?.id, `id=${detail?.profile?.id}`);
  step("detail no secrets", !hasSecrets(detail));
  const kycDocsRaw = detail?.identity?.documents || detail?.identity?.latest?.documents || [];
  const kycDocs = Array.isArray(kycDocsRaw)
    ? kycDocsRaw
    : [kycDocsRaw?.front, kycDocsRaw?.back].filter(Boolean);
  const badPublic = kycDocs.some((d) => /cloudinary\.com|^https?:/i.test(String(d.protectedPath || "")));
  step(
    "KYC protectedPath only",
    kycDocs.every((d) => !d.protectedPath || String(d.protectedPath).startsWith("/api/super-admin/")) && !badPublic,
    `docs=${kycDocs.length}`,
  );

  // reason required
  let reasonBlocked = false;
  try {
    await service.patchAccount({
      actorAdminId: superAdmin.id,
      userId: qaUsers[0].id,
      patch: { phone: qaUsers[0].phone || null },
      reason: "x",
    });
  } catch (err) {
    reasonBlocked = err?.publicCode === "REASON_REQUIRED" || /سبب|REASON/i.test(String(err?.message || ""));
  }
  step("short reason rejected", reasonBlocked);

  // Safe mutating action via service (avoid null whatsapp NOT NULL)
  const reason = `staging users-control smoke ${new Date().toISOString()}`;
  const beforeAudit = await pool.query(
    `SELECT COUNT(*)::int AS c FROM super_admin_user_control_audit_logs WHERE target_user_id = $1`,
    [qaUsers[0].id],
  );

  let actionOk = false;
  let actionName = "account_touch";
  try {
    const { rows: kyc } = await pool.query(
      `SELECT id, status FROM freelancer_account_activation_requests
        WHERE freelancer_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [qaUsers[0].id],
    );
    if (kyc[0]?.status === "pending_review") {
      actionName = "request_resubmission";
      await service.patchIdentity({
        actorAdminId: superAdmin.id,
        userId: qaUsers[0].id,
        action: "request_resubmission",
        reason,
        adminNote: "staging smoke — request resubmission",
      });
      actionOk = true;
    } else if (kyc[0]?.status === "draft" || kyc[0]?.status === "rejected" || kyc[0]?.status === "cancelled") {
      actionName = "mark_pending_review";
      await service.patchIdentity({
        actorAdminId: superAdmin.id,
        userId: qaUsers[0].id,
        action: "mark_pending_review",
        reason,
        adminNote: "staging smoke — mark pending",
      });
      actionOk = true;
    } else {
      actionName = "account_update_firstName_same";
      const currentName = String(qaUsers[0].first_name || "QA").trim() || "QA";
      await service.patchAccount({
        actorAdminId: superAdmin.id,
        userId: qaUsers[0].id,
        patch: { firstName: currentName },
        reason,
      });
      actionOk = true;
    }
  } catch (err) {
    step("safe mutation", false, err?.message || String(err));
  }
  if (actionOk) step("safe mutation", true, actionName);

  const afterAudit = await pool.query(
    `SELECT id, action, reason,
            before_snapshot IS NOT NULL AS has_before,
            after_snapshot IS NOT NULL AS has_after
       FROM super_admin_user_control_audit_logs
      WHERE target_user_id = $1
      ORDER BY id DESC LIMIT 1`,
    [qaUsers[0].id],
  );
  const countAfter = await pool.query(
    `SELECT COUNT(*)::int AS c FROM super_admin_user_control_audit_logs WHERE target_user_id = $1`,
    [qaUsers[0].id],
  );
  step(
    "audit log written",
    Number(countAfter.rows[0].c) > Number(beforeAudit.rows[0].c),
    `before=${beforeAudit.rows[0].c} after=${countAfter.rows[0].c} action=${afterAudit.rows[0]?.action || "n/a"}`,
  );
  step(
    "audit has reason + snapshots",
    Boolean(afterAudit.rows[0]?.reason) &&
      (afterAudit.rows[0]?.has_before === true || afterAudit.rows[0]?.has_after === true),
    afterAudit.rows[0]?.action || "",
  );

  // Bulk export CSV (safe, non-destructive)
  if (qaUsers.length >= 1) {
    const bulk = await service.bulkActions({
      actorAdminId: superAdmin.id,
      userIds: qaUsers.slice(0, Math.min(2, qaUsers.length)).map((u) => u.id),
      action: "export_selected_users_csv",
      reason: `${reason} bulk export`,
    });
    const csvOk =
      Number(bulk.succeeded || bulk.count || 0) >= 1 ||
      (typeof bulk.csv === "string" && /id,/i.test(bulk.csv));
    step(
      "bulk export csv",
      csvOk && typeof bulk.csv === "string",
      `succeeded=${bulk.succeeded} csvLen=${bulk.csv ? bulk.csv.length : 0}`,
    );
  }

  // Wallet/payment untouched probe (counts only)
  const payProbe = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM client_order_payments WHERE created_at > NOW() - interval '2 minutes') AS payments_2m,
       (SELECT COUNT(*)::int FROM financial_claims WHERE created_at > NOW() - interval '2 minutes') AS claims_2m`,
  ).catch(() => ({ rows: [{ payments_2m: null, claims_2m: null }] }));
  step(
    "no fresh payment/claim mutation from smoke",
    Number(payProbe.rows[0]?.payments_2m || 0) === 0 && Number(payProbe.rows[0]?.claims_2m || 0) === 0,
    JSON.stringify(payProbe.rows[0]),
  );

  // --- HTTP permission matrix on ephemeral server ---
  const app = require("../src/app");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  function api(method, urlPath, token, body) {
    return new Promise((resolve) => {
      const payload = body == null ? null : JSON.stringify(body);
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: urlPath,
          method,
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(payload
              ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
              : {}),
          },
          timeout: 25000,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            let data = null;
            const raw = Buffer.concat(chunks).toString("utf8");
            try {
              data = raw ? JSON.parse(raw) : null;
            } catch {
              data = { raw: raw.slice(0, 200) };
            }
            resolve({ status: res.statusCode || 0, data });
          });
        },
      );
      req.on("error", (err) => resolve({ status: 0, data: { message: String(err.message || err) } }));
      if (payload) req.write(payload);
      req.end();
    });
  }

  const saToken = signToken(superAdmin);
  const adminToken = admin ? signToken(admin) : null;
  const freelToken = signToken(qaUsers[0]);

  const unauth = await api("GET", "/api/super-admin/users?limit=5");
  step("unauthenticated blocked", unauth.status === 401 || unauth.status === 403, `status=${unauth.status}`);

  const saList = await api("GET", "/api/super-admin/users?limit=5", saToken);
  step("super_admin list 200", saList.status === 200 && saList.data?.success, `status=${saList.status}`);
  step("HTTP list no secrets", !hasSecrets(saList.data));

  const saDetail = await api("GET", `/api/super-admin/users/${qaUsers[0].id}`, saToken);
  step("super_admin detail 200", saDetail.status === 200 && saDetail.data?.success, `status=${saDetail.status}`);
  step("HTTP detail no secrets", !hasSecrets(saDetail.data));

  if (adminToken) {
    const adminList = await api("GET", "/api/super-admin/users?limit=5", adminToken);
    step("normal admin blocked", adminList.status === 403, `status=${adminList.status}`);
  } else {
    step("normal admin blocked", true, "skipped — no admin user");
  }

  const freelList = await api("GET", "/api/super-admin/users?limit=5", freelToken);
  step("freelancer blocked", freelList.status === 403, `status=${freelList.status}`);

  const noReason = await api("PATCH", `/api/super-admin/users/${qaUsers[0].id}/account`, saToken, {
    firstName: qaUsers[0].first_name || "QA",
  });
  step(
    "HTTP account without reason rejected",
    noReason.status === 400 || noReason.status === 422,
    `status=${noReason.status}`,
  );

  await new Promise((resolve) => server.close(resolve));
  await pool.end();

  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify({
      summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
      failed: failed.map((f) => f.name),
    }),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err && err.message ? err.message : err);
  try {
    const { pool } = require("../src/config/db");
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
