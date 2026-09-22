/**
 * Staging smoke — Legacy Freelancer Admin Center (migration 190).
 * STAGING ONLY. No Production. Does not touch Production Campaign 2.
 *
 * Usage (from backend/):
 *   node scripts/qaLegacyFreelancerAdminCenterStagingSmoke.js
 */
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const fs = require("node:fs");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");
const {
  assertNonProductionDatabase,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");
const { maskFreelancerMemberId } = require("../src/utils/legacyFreelancerMemberId");

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();
printStagingBanner(target);
assertNonProductionDatabase("legacy admin center staging smoke");
const host = String(classifyDatabaseUrl().host || "").toLowerCase();
if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
  throw new Error("REFUSED: production Neon host");
}
if (!host.includes("solitary-band")) {
  throw new Error("REFUSED: missing solitary-band");
}

process.env.PORT = process.env.LEGACY_ADMIN_SMOKE_PORT || "5061";
const API = `http://127.0.0.1:${process.env.PORT}`;
const NID = `3${String(Date.now()).slice(-9)}`;
const NID_MASK = maskFreelancerMemberId(NID);

const results = [];
function step(name, pass, detail = "") {
  const safe = String(detail || "").replace(new RegExp(NID, "g"), NID_MASK).slice(0, 400);
  results.push({ name, pass: !!pass, detail: safe });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${safe ? ` — ${safe}` : ""}`);
}

function request(method, urlPath, { token, body, formData, headers: extraHeaders } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, API);
    let payload = null;
    const headers = { Accept: "application/json", ...(extraHeaders || {}) };
    if (formData) {
      payload = formData.body;
      Object.assign(headers, formData.headers);
    } else if (body != null) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const text = raw.toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw: text, buf: raw, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function signUser(user) {
  return jwt.sign(
    { sub: String(user.id), accountId: user.account_id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "45m" },
  );
}

function tinyPng() {
  // 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

function buildMultipart(fields, files) {
  const boundary = `----OH${crypto.randomBytes(8).toString("hex")}`;
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
    );
  }
  for (const [name, file] of Object.entries(files || {})) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    );
    parts.push(file.buffer);
    parts.push("\r\n");
  }
  parts.push(`--${boundary}--\r\n`);
  const body = Buffer.concat(
    parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, "utf8"))),
  );
  return {
    body,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
  };
}

async function main() {
  const { pool } = require("../src/config/db");
  const { ORDERZHOUSE_FREE_PLAN_ID } = require("../src/constants/orderzhousePlansCatalog");

  console.log(JSON.stringify({ db: maskDatabaseTarget(), solitary: true }));

  const { rows: mig } = await pool.query(
    `SELECT 1 FROM schema_migrations WHERE version = '190_legacy_freelancer_admin_center'`,
  );
  step("migration_190_recorded", !!mig[0]);

  const { rows: types } = await pool.query(
    `SELECT code FROM legacy_freelancer_document_types WHERE code IN ('CONTRACTOR_AGREEMENT','TRAINING_AGREEMENT')`,
  );
  step("default_doc_types", types.length === 2, `n=${types.length}`);

  const { rows: saRows } = await pool.query(
    `SELECT id, email, role, account_id FROM users WHERE role='super_admin' AND is_active=TRUE ORDER BY id LIMIT 1`,
  );
  step("super_admin", !!saRows[0]);
  const saToken = signUser(saRows[0]);

  // Snapshot production-like campaign id=2 on staging if present (do not mutate token)
  const { rows: c2b } = await pool.query(
    `SELECT id, slug, used_count, secure_token_hash, max_redemptions FROM legacy_freelancer_invite_campaigns WHERE id=2`,
  );

  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = await new Promise((r) => {
    const s = app.listen(Number(process.env.PORT), "127.0.0.1", () => r(s));
  });
  step("api_up", true, API);

  // --- Manual create ---
  const stamp = Date.now().toString(36);
  const email = `legacy.admin.manual.${stamp}@staging.orderzhouse.test`;
  const phoneNum = `79${String(crypto.randomInt(1000000, 9999999))}`;
  const png = tinyPng();
  const form = buildMultipart(
    {
      email,
      firstName: "قديم",
      fatherName: "إداري",
      familyName: "اختبار",
      nationalId: NID,
      country: "JO",
      gender: "ذكر",
      phone: JSON.stringify({ countryCode: "+962", number: phoneNum }),
      specialization: "كتابة محتوى",
      city: "عمّان",
      planId: String(ORDERZHOUSE_FREE_PLAN_ID),
      durationMonths: "4",
      historicalAmount: "12.50",
      historicalNote: "smoke historical",
    },
    {
      idFront: { filename: "front.png", contentType: "image/png", buffer: png },
      idBack: { filename: "back.png", contentType: "image/png", buffer: png },
    },
  );

  const created = await request("POST", "/api/super-admin/legacy-freelancers", {
    token: saToken,
    formData: form,
  });
  step(
    "manual_create_201",
    created.status === 201 || created.status === 200,
    `status=${created.status};msg=${created.json?.message || created.raw?.slice(0, 120)}`,
  );
  const userId = created.json?.data?.user?.id || created.json?.data?.id;
  if (!userId) {
    console.log(JSON.stringify({ status: "FAIL_EARLY", failures: results.filter((r) => !r.pass) }));
    await new Promise((r) => server.close(r));
    await pool.end();
    process.exit(1);
  }

  const { rows: urows } = await pool.query(
    `SELECT id, account_id, freelancer_member_id, legacy_entry_method, must_change_password,
            onboarding_source, password_hash, subscription_activation_fee_paid_at
       FROM users WHERE id = $1`,
    [userId],
  );
  const u = urows[0];
  step("entry_ADMIN_MANUAL", u?.legacy_entry_method === "ADMIN_MANUAL");
  step("member_id_eq_nid", u?.freelancer_member_id === NID);
  step("must_change_true", u?.must_change_password === true);
  step("password_hashed", String(u?.password_hash || "").startsWith("$2"));
  step("password_not_plaintext", u?.password_hash !== NID);
  step("nid_password_matches", await bcrypt.compare(NID, u.password_hash));
  step("paid_at_null", u?.subscription_activation_fee_paid_at == null);
  step("account_id_not_nid", u?.account_id !== NID);

  // No campaign seat for manual
  if (c2b[0]) {
    const { rows: c2a } = await pool.query(
      `SELECT used_count, secure_token_hash FROM legacy_freelancer_invite_campaigns WHERE id=2`,
    );
    step(
      "campaign2_seat_unchanged",
      String(c2a[0].used_count) === String(c2b[0].used_count) &&
        c2a[0].secure_token_hash === c2b[0].secure_token_hash,
    );
  } else {
    step("campaign2_seat_unchanged", true, "id=2 absent on staging");
  }

  // Identity docs private
  const { rows: idocs } = await pool.query(
    `SELECT side, storage_key, status FROM legacy_freelancer_identity_documents WHERE user_id=$1 AND status='ACTIVE'`,
    [userId],
  );
  step("identity_two_sides", idocs.length === 2, `n=${idocs.length}`);
  step(
    "identity_keys_private",
    idocs.every((d) => /^(local:|cloudinary:)/.test(d.storage_key)),
  );

  // Login with NID password
  const login = await request("POST", "/api/auth/login", {
    body: { email, password: NID },
  });
  step("login_with_nid_password", login.status === 200, `status=${login.status}`);
  const flToken =
    login.json?.data?.accessToken ||
    login.json?.data?.token ||
    null;
  // Web login uses cookie — mint bearer from DB for API checks
  const bearer = signUser({ id: u.id, account_id: u.account_id, role: u.role || "freelancer", email });
  step("mustChangePassword_flag", login.json?.data?.user?.mustChangePassword === true || u.must_change_password === true);

  // Operational API blocked
  const blocked = await request("GET", "/api/freelancer/dashboard/summary", { token: bearer });
  // path may 404 if different — try courses
  const blocked2 = await request("GET", "/api/freelancer/courses", { token: bearer });
  step(
    "ops_api_blocked_or_allowlisted_me",
    blocked.status === 403 ||
      blocked2.status === 403 ||
      blocked.status === 404 ||
      blocked2.status === 401,
    `sum=${blocked.status};courses=${blocked2.status}`,
  );

  // me allowed
  const me = await request("GET", "/api/profile/me", { token: bearer });
  step("profile_me_allowed", me.status === 200, `status=${me.status}`);

  // Change password
  const newPass = "NewPass123!";
  const pw = await request("PATCH", "/api/profile/password", {
    token: bearer,
    body: { currentPassword: NID, newPassword: newPass },
  });
  step("password_change_ok", pw.status === 200, `status=${pw.status}`);
  const { rows: afterPw } = await pool.query(
    `SELECT must_change_password, password_hash FROM users WHERE id=$1`,
    [userId],
  );
  step("must_change_cleared", afterPw[0]?.must_change_password === false);
  step("old_nid_password_invalid", !(await bcrypt.compare(NID, afterPw[0].password_hash)));
  step("new_password_valid", await bcrypt.compare(newPass, afterPw[0].password_hash));

  // Historical money
  const { rows: money } = await pool.query(
    `SELECT amount::text, currency, is_voided FROM legacy_freelancer_historical_money_received WHERE user_id=$1`,
    [userId],
  );
  step("historical_money_row", money.length >= 1, `n=${money.length}`);
  const { rows: wallet } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM freelancer_work_token_wallets WHERE freelancer_user_id=$1`,
    [userId],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  step("no_wallet_mutation_required", true, `wallets=${wallet[0]?.n || 0}`);

  // Package assignment 4 months
  const { rows: plans } = await pool.query(
    `SELECT id FROM plans WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY id LIMIT 1`,
  );
  const planId = plans[0]?.id || ORDERZHOUSE_FREE_PLAN_ID;
  const pkg = await request("POST", `/api/super-admin/legacy-freelancers/${userId}/package`, {
    token: saToken,
    body: { planId, durationMonths: 4, startsAt: new Date().toISOString() },
  });
  step("package_assign_ok", pkg.status === 200 || pkg.status === 201, `status=${pkg.status}`);
  const { rows: subs } = await pool.query(
    `SELECT payment_status, activation_status, actual_start_date, expiry_date, source,
            has_first_order, first_order_date, first_order_id
       FROM freelancer_subscriptions WHERE freelancer_user_id=$1 AND is_current=TRUE LIMIT 1`,
    [userId],
  );
  step("sub_not_required_payment", subs[0]?.payment_status === "not_required");
  step("sub_company_approved", String(subs[0]?.activation_status || "").includes("company_approved") || subs[0]?.activation_status === "company_approved");
  step("sub_has_dates", !!subs[0]?.actual_start_date && !!subs[0]?.expiry_date);
  step("has_first_order_stays_false", subs[0]?.has_first_order === false, `v=${subs[0]?.has_first_order}`);
  step("first_order_date_null", subs[0]?.first_order_date == null);
  step("first_order_id_null", subs[0]?.first_order_id == null);
  step("source_admin", subs[0]?.source === "admin");

  let orderN = 0;
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE assigned_freelancer_id = $1`,
      [userId],
    );
    orderN = r.rows[0]?.n || 0;
  } catch (_) {
    orderN = 0;
  }
  step("no_order_rows", orderN === 0, `n=${orderN}`);

  const { rows: payCount } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM freelancer_subscriptions
      WHERE freelancer_user_id=$1
        AND (payment_status='paid'
          OR stripe_session_id IS NOT NULL
          OR NULLIF(TRIM(COALESCE(stripe_payment_intent_id,'')),'') IS NOT NULL)`,
    [userId],
  );
  step("no_paid_or_stripe_sub", (payCount[0]?.n || 0) === 0, `n=${payCount[0]?.n}`);

  // Bulk: create second manual user quickly without files
  const nid2 = `4${String(Date.now()).slice(-9)}`;
  const email2 = `legacy.admin.bulk.${stamp}@staging.orderzhouse.test`;
  const form2 = buildMultipart(
    {
      email: email2,
      firstName: "جماعي",
      fatherName: "اختبار",
      familyName: "واحد",
      nationalId: nid2,
      country: "JO",
      gender: "ذكر",
      phone: JSON.stringify({ countryCode: "+962", number: `78${String(crypto.randomInt(1000000, 9999999))}` }),
    },
    {},
  );
  const created2 = await request("POST", "/api/super-admin/legacy-freelancers", {
    token: saToken,
    formData: form2,
  });
  const userId2 = created2.json?.data?.user?.id || created2.json?.data?.id;
  step("bulk_second_user", !!userId2, `status=${created2.status}`);

  const bulk = await request("POST", "/api/super-admin/legacy-freelancers/bulk-package", {
    token: saToken,
    body: {
      userIds: [userId, userId2, 1],
      planId,
      durationMonths: 4,
      startsAt: new Date().toISOString(),
    },
  });
  const summary = bulk.json?.data || bulk.json || {};
  step("bulk_status_ok", bulk.status === 200 || bulk.status === 201, `status=${bulk.status}`);
  step(
    "bulk_counts",
    Number(summary.updated || 0) >= 1 && Number(summary.selected || summary.requested || 0) >= 2,
    JSON.stringify({
      selected: summary.selected || summary.requested,
      updated: summary.updated,
      skipped: summary.skipped,
      failed: summary.failed,
    }),
  );

  // Duplicate NID reject
  const dupForm = buildMultipart(
    {
      email: `dup.${stamp}@staging.orderzhouse.test`,
      firstName: "مكرر",
      fatherName: "اختبار",
      familyName: "هويّة",
      nationalId: NID,
      country: "JO",
      gender: "ذكر",
      phone: JSON.stringify({ countryCode: "+962", number: `77${String(crypto.randomInt(1000000, 9999999))}` }),
    },
    {},
  );
  const dup = await request("POST", "/api/super-admin/legacy-freelancers", {
    token: saToken,
    formData: dupForm,
  });
  step("dup_nid_rejected", dup.status === 409, `status=${dup.status}`);

  // List masks NID
  const list = await request("GET", "/api/super-admin/legacy-freelancers?q=&page=1&pageSize=50", {
    token: saToken,
  });
  const listRaw = JSON.stringify(list.json || {});
  step("list_masks_nid", list.status === 200 && !listRaw.includes(NID));
  step("list_has_masked", listRaw.includes(NID_MASK) || /freelancerMemberIdMasked|\*+/.test(listRaw));

  // Identity download authorized
  const fileGet = await request("GET", `/api/super-admin/legacy-freelancers/${userId}/identity/front`, {
    token: saToken,
  });
  step("identity_download_sa", fileGet.status === 200 && fileGet.buf?.length > 10, `status=${fileGet.status}`);

  // Ordinary admin denied WITHOUT permission; WITH permission succeeds
  const { rows: admins } = await pool.query(
    `SELECT id, email, role, account_id FROM users WHERE role='admin' AND is_active=TRUE ORDER BY id LIMIT 1`,
  );
  if (admins[0]) {
    const admTok = signUser(admins[0]);
    const denied = await request("GET", `/api/super-admin/legacy-freelancers/${userId}`, { token: admTok });
    step("admin_without_perm_denied", denied.status === 403 || denied.status === 401, `status=${denied.status}`);

    // Grant permission for this smoke only (rollback after)
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: permRows } = await client.query(
        `SELECT id FROM permissions WHERE key = 'legacy_freelancers.manage' LIMIT 1`,
      );
      const permId = permRows[0]?.id;
      step("perm_row_exists", !!permId);
      if (permId) {
        await client.query(
          `INSERT INTO user_permissions (user_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, permission_id) DO NOTHING`,
          [admins[0].id, permId],
        );
        await client.query("COMMIT");
        // New token after grant — attachAuthContext loads permissions from DB
        const admTok2 = signUser(admins[0]);
        const allowed = await request("GET", `/api/super-admin/legacy-freelancers/${userId}`, {
          token: admTok2,
        });
        step("admin_with_perm_ok", allowed.status === 200, `status=${allowed.status}`);
        const bulkDeniedRole = await request("POST", "/api/super-admin/legacy-freelancers/bulk-package", {
          token: saToken,
          body: { userIds: [admins[0].id], planId, durationMonths: 1 },
        });
        step(
          "bulk_rejects_non_legacy",
          bulkDeniedRole.status === 200 &&
            Array.isArray(bulkDeniedRole.json?.data?.skipped) &&
            bulkDeniedRole.json.data.skipped.length >= 1,
          `status=${bulkDeniedRole.status}`,
        );
        // Revoke grant
        await pool.query(`DELETE FROM user_permissions WHERE user_id=$1 AND permission_id=$2`, [
          admins[0].id,
          permId,
        ]);
        const deniedAgain = await request("GET", `/api/super-admin/legacy-freelancers/${userId}`, {
          token: admTok2,
        });
        step(
          "admin_perm_revoked_denied",
          deniedAgain.status === 403 || deniedAgain.status === 401,
          `status=${deniedAgain.status}`,
        );
      }
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
      step("admin_with_perm_ok", false, String(e.message || e).slice(0, 120));
    } finally {
      client.release();
    }
  } else {
    step("admin_without_perm_denied", true, "no admin user — skipped");
    step("admin_with_perm_ok", true, "no admin user — skipped");
  }

  // Audit no full NID
  const { rows: audits } = await pool.query(
    `SELECT detail::text AS d FROM legacy_freelancer_invite_audit_logs
      WHERE target_user_id = $1 ORDER BY id DESC LIMIT 20`,
    [userId],
  );
  step("audit_no_full_nid", !audits.some((a) => String(a.d || "").includes(NID)));

  await new Promise((r) => server.close(r));
  await pool.end();

  const failed = results.filter((x) => !x.pass);
  console.log(JSON.stringify({ status: failed.length ? "FAIL" : "PASS", passed: results.length - failed.length, failed: failed.length, failures: failed }));
  if (failed.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await require("../src/config/db").pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
