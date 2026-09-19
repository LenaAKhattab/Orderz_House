/**
 * Staging HTTP smoke for Legacy Freelancer Shared Invite.
 * Loads .env.staging, starts local API against staging DB, hits real Express routes.
 * Never touches Production.
 *
 * Usage (from backend/):
 *   node scripts/qaLegacyFreelancerInviteStagingHttpSmoke.js
 */
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

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

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();
printStagingBanner(target);
assertNonProductionDatabase("legacy invite staging HTTP smoke");
const host = String(classifyDatabaseUrl().host || "").toLowerCase();
if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
  throw new Error("REFUSED: production Neon host");
}

process.env.PORT = process.env.LEGACY_HTTP_SMOKE_PORT || "5055";
const API = `http://127.0.0.1:${process.env.PORT}`;

const results = [];
function step(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
}

function request(method, urlPath, { token, body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, API);
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw, headers: res.headers });
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

function signAdmin(user) {
  return jwt.sign(
    { sub: String(user.id), accountId: user.account_id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "30m" },
  );
}

async function main() {
  // Clear false paid_at stamps from earlier staging smoke (no payment rows).
  const { pool } = require("../src/config/db");
  const clear = await pool.query(
    `UPDATE users
        SET subscription_activation_fee_paid_at = NULL
      WHERE onboarding_source = 'LEGACY_INVITE'
        AND subscription_activation_fee_paid_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM subscription_activation_fee_payments p WHERE p.user_id = users.id
        )
      RETURNING id`,
  );
  step("cleared_false_paid_at_stamps", true, `rows=${clear.rowCount}`);

  const { rows: admins } = await pool.query(
    `SELECT id, email, account_id, role FROM users
      WHERE role = 'super_admin' AND COALESCE(is_active, TRUE) = TRUE
      ORDER BY id ASC LIMIT 1`,
  );
  if (!admins[0]) throw new Error("No super_admin on staging");
  const adminToken = signAdmin(admins[0]);

  const { rows: nonSa } = await pool.query(
    `SELECT id, email, account_id, role FROM users
      WHERE role IN ('admin', 'freelancer', 'client') AND COALESCE(is_active, TRUE) = TRUE
      ORDER BY id ASC LIMIT 1`,
  );
  const nonSaToken = nonSa[0] ? signAdmin(nonSa[0]) : null;

  // Boot Express app against staging env
  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = await new Promise((resolve) => {
    const s = app.listen(Number(process.env.PORT), "127.0.0.1", () => resolve(s));
  });
  step("api_listening", true, API);

  try {
    const health = await request("GET", "/api/health");
    step("health", health.status === 200 || health.status === 503, `status=${health.status}`);

    const stamp = `${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const denied = await request("POST", "/api/super-admin/legacy-freelancer-invites", {
      token: nonSaToken,
      body: {
        name: "HTTP smoke denied",
        slug: `http-denied-${stamp}`,
        maxRedemptions: 1,
        expiresAt,
        defaultPlanCode: "orderzhouse_free",
        defaultTrustLevel: "APPROVED",
      },
    });
    step(
      "non_super_admin_rejected",
      !nonSaToken || denied.status === 401 || denied.status === 403,
      `status=${denied.status}`,
    );

    const created = await request("POST", "/api/super-admin/legacy-freelancer-invites", {
      token: adminToken,
      body: {
        name: "Legacy HTTP Staging Smoke",
        slug: `legacy-http-smoke-${stamp}`,
        maxRedemptions: 2,
        expiresAt,
        defaultPlanCode: "orderzhouse_free",
        defaultTrustLevel: "APPROVED",
        notes: "http smoke only",
        isActive: true,
      },
    });
    step("admin_create_campaign", created.status === 201 && created.json?.data?.token, `status=${created.status}`);
    const campaign = created.json?.data;
    const slug = campaign?.slug;
    const token = campaign?.token;
    const campaignId = campaign?.id;

    const previewOk = await request(
      "GET",
      `/api/auth/legacy-freelancer-invite/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`,
    );
    step(
      "http_preview_valid",
      previewOk.status === 200 && previewOk.json?.data?.slug === slug && !previewOk.json?.data?.token,
      `status=${previewOk.status}`,
    );

    const previewBad = await request(
      "GET",
      `/api/auth/legacy-freelancer-invite/${encodeURIComponent(slug)}?token=bad-token-xxxxxxxxxxxxx`,
    );
    step("http_preview_invalid_token", previewBad.status >= 400, `status=${previewBad.status}`);

    const email = `legacy.http.${stamp}@staging.orderzhouse.test`;
    const phone = `+9627${String(730000000 + Math.floor(Math.random() * 9999999)).slice(0, 8)}`;
    const password = `HttpSmoke!${stamp}`;
    const reg = await request("POST", "/api/auth/legacy-freelancer-register", {
      body: {
        campaignSlug: slug,
        token,
        fullName: "فريلانسر HTTP دخان",
        email,
        phone,
        password,
        passwordConfirm: password,
        categories: ["content_writing"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      },
    });
    step(
      "http_register",
      reg.status === 201 && reg.json?.success === true && reg.json?.data?.user?.id,
      `status=${reg.status} msg=${reg.json?.message || ""}`,
    );
    const userId = reg.json?.data?.user?.id;

    const { rows: urows } = await pool.query(
      `SELECT onboarding_source, subscription_activation_fee_paid_at,
              identity_verification_source
         FROM users WHERE id = $1`,
      [userId],
    );
    step("http_user_legacy_flags", urows[0]?.onboarding_source === "LEGACY_INVITE");
    step("http_no_fake_paid_at", urows[0]?.subscription_activation_fee_paid_at == null);
    step("http_offline_identity", urows[0]?.identity_verification_source === "COMPANY_OFFLINE_VERIFIED");

    const { rows: payRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM subscription_activation_fee_payments WHERE user_id = $1`,
      [userId],
    );
    step("http_zero_payment_rows", Number(payRows[0].c) === 0);

    const dupEmail = await request("POST", "/api/auth/legacy-freelancer-register", {
      body: {
        campaignSlug: slug,
        token,
        fullName: "مكرر",
        email,
        phone: `+9627${String(740000000 + Math.floor(Math.random() * 9999999)).slice(0, 8)}`,
        password,
        passwordConfirm: password,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      },
    });
    step(
      "http_dup_email",
      dupEmail.status === 409 && /يوجد حساب مسجل/.test(dupEmail.json?.message || ""),
      `status=${dupEmail.status}`,
    );

    const dupPhone = await request("POST", "/api/auth/legacy-freelancer-register", {
      body: {
        campaignSlug: slug,
        token,
        fullName: "مكرر هاتف",
        email: `legacy.http.dup.${stamp}@staging.orderzhouse.test`,
        phone,
        password,
        passwordConfirm: password,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      },
    });
    step(
      "http_dup_phone",
      dupPhone.status === 409 && /يوجد حساب مسجل/.test(dupPhone.json?.message || ""),
      `status=${dupPhone.status}`,
    );

    // Fill last seat then reject
    const reg2 = await request("POST", "/api/auth/legacy-freelancer-register", {
      body: {
        campaignSlug: slug,
        token,
        fullName: "مقعد ثان",
        email: `legacy.http.2.${stamp}@staging.orderzhouse.test`,
        phone: `+9627${String(750000000 + Math.floor(Math.random() * 9999999)).slice(0, 8)}`,
        password,
        passwordConfirm: password,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      },
    });
    step("http_register_seat_2", reg2.status === 201, `status=${reg2.status}`);

    const full = await request("POST", "/api/auth/legacy-freelancer-register", {
      body: {
        campaignSlug: slug,
        token,
        fullName: "ممتلئ",
        email: `legacy.http.full.${stamp}@staging.orderzhouse.test`,
        phone: `+9627${String(760000000 + Math.floor(Math.random() * 9999999)).slice(0, 8)}`,
        password,
        passwordConfirm: password,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      },
    });
    step(
      "http_full_campaign",
      full.status === 410 && /اكتمل عدد المقاعد/.test(full.json?.message || ""),
      `status=${full.status}`,
    );

    const regen = await request("POST", `/api/super-admin/legacy-freelancer-invites/${campaignId}/regenerate-token`, {
      token: adminToken,
    });
    step("http_regen_token", regen.status === 200 && regen.json?.data?.token && regen.json.data.token !== token);

    const oldPreview = await request(
      "GET",
      `/api/auth/legacy-freelancer-invite/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`,
    );
    step("http_old_token_dead", oldPreview.status >= 400, `status=${oldPreview.status}`);

    const revokeCamp = await request("POST", "/api/super-admin/legacy-freelancer-invites", {
      token: adminToken,
      body: {
        name: "HTTP revoke",
        slug: `legacy-http-revoke-${stamp}`,
        maxRedemptions: 1,
        expiresAt,
        defaultPlanCode: "orderzhouse_free",
        defaultTrustLevel: "APPROVED",
      },
    });
    const revokeId = revokeCamp.json?.data?.id;
    const revokeToken = revokeCamp.json?.data?.token;
    const revoked = await request("POST", `/api/super-admin/legacy-freelancer-invites/${revokeId}/revoke`, {
      token: adminToken,
    });
    step("http_revoke", revoked.status === 200);
    const revokedPreview = await request(
      "GET",
      `/api/auth/legacy-freelancer-invite/${encodeURIComponent(revokeCamp.json.data.slug)}?token=${encodeURIComponent(revokeToken)}`,
    );
    step(
      "http_revoked_preview",
      revokedPreview.status >= 400 && /إيقاف/.test(revokedPreview.json?.message || ""),
      `status=${revokedPreview.status}`,
    );

    // Normal register route still present
    const normal = await request("POST", "/api/auth/register", {
      body: { email: "x@y.com" },
    });
    step("http_normal_register_still_wired", normal.status !== 404, `status=${normal.status}`);
  } finally {
    await new Promise((r) => server.close(r));
    await pool.end();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify({
      pass: results.filter((r) => r.pass).length,
      fail: failed.length,
      maskedTarget: maskDatabaseTarget(),
      productionTouched: false,
      frontendBrowserSmoke: "NOT_RUN — no deployed staging frontend with this build; CLIENT_URL is local Vite only",
    }),
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
