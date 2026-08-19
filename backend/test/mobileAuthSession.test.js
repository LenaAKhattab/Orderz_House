/**
 * Phase 2A — mobile vs web auth session responses.
 * Run: npm test
 *
 * Unit tests always run. Postgres integration tests skip when DATABASE_URL/JWT_SECRET unavailable.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/mobile_auth_session_test_placeholder";

const path = require("node:path");
const http = require("node:http");
const { describe, it } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
if (classifyDatabaseUrl(process.env.DATABASE_URL).isProduction) {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/mobile_auth_session_test_placeholder";
}

if (!process.env.CLIENT_URL || !String(process.env.CLIENT_URL).trim()) {
  process.env.CLIENT_URL = "http://localhost:5173";
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "mobile-auth-test-secret-min-16";
}

const { isMobileClient } = require("../src/utils/clientType");
const {
  getTokenExpiresInSeconds,
  buildWebAuthSessionResponse,
  buildMobileAuthSessionResponse,
} = require("../src/utils/authSessionResponse");
const { AUTH_COOKIE_NAME } = require("../src/utils/authCookie");
const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const integrationEnvOk = isIntegrationEnvConfigured();
const rootDescribe = integrationEnvOk ? describe : describe.skip;

describe("clientType.isMobileClient", () => {
  it("returns false when header is absent", () => {
    assert.strictEqual(isMobileClient({ headers: {} }), false);
  });

  it("returns true only for X-Client-Type: mobile (case-insensitive)", () => {
    assert.strictEqual(isMobileClient({ headers: { "x-client-type": "mobile" } }), true);
    assert.strictEqual(isMobileClient({ headers: { "x-client-type": "Mobile" } }), true);
    assert.strictEqual(isMobileClient({ headers: { "x-client-type": " MOBILE " } }), true);
  });

  it("returns false for web, empty, or other client types", () => {
    assert.strictEqual(isMobileClient({ headers: { "x-client-type": "web" } }), false);
    assert.strictEqual(isMobileClient({ headers: { "x-client-type": "" } }), false);
    assert.strictEqual(isMobileClient({ headers: { "user-agent": "Flutter/3.0" } }), false);
  });
});

describe("authSessionResponse builders", () => {
  it("web payload contains user only", () => {
    const user = { id: "1", email: "a@b.com" };
    const out = buildWebAuthSessionResponse({ message: "ok", user });
    assert.strictEqual(out.success, true);
    assert.deepStrictEqual(out.data, { user });
    assert.strictEqual(out.data.token, undefined);
    assert.strictEqual(out.data.accessToken, undefined);
  });

  it("mobile payload contains accessToken, tokenType, expiresIn", () => {
    const secret = process.env.JWT_SECRET;
    const token = jwt.sign({ sub: "1" }, secret, { expiresIn: 3600 });
    const user = { id: "1", email: "a@b.com" };
    const out = buildMobileAuthSessionResponse({ message: "ok", user, token });
    assert.strictEqual(out.data.accessToken, token);
    assert.strictEqual(out.data.tokenType, "Bearer");
    assert.strictEqual(out.data.token, undefined);
    assert.ok(typeof out.data.expiresIn === "number" && out.data.expiresIn > 0);
    assert.ok(getTokenExpiresInSeconds(token) > 0);
  });
});

/**
 * @param {import("express").Express} app
 */
function listenApp(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

/**
 * @param {import("http").Server} server
 * @param {string} pathname
 * @param {object} [options]
 */
async function httpJson(server, pathname, options = {}) {
  const { method = "POST", body, bearerToken, headers = {} } = options;
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text };
  }
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  return { status: res.status, body: parsed, setCookie };
}

/**
 * @param {import("pg").Pool} pool
 */
async function insertVerifiedTestUser(pool, { email, password, role = "client" }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const accountId = crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, email_verified, is_active
    ) VALUES (
      $1, 'Mob', 'Auth', 'Test', $2, $3, $4,
      'JO', '+962790000201', '+962790000201', 'ذكر', true, true, true
    ) RETURNING id`,
    [accountId, email.toLowerCase(), passwordHash, role],
  );
  return Number(rows[0].id);
}

/**
 * @param {import("pg").Pool} pool
 */
async function insertUnverifiedUserWithOtp(pool, { email, password, otpPlain }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const accountId = crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
  const otpHash = await bcrypt.hash(otpPlain, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const { rows } = await pool.query(
    `INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, email_verified, is_active
    ) VALUES (
      $1, 'Otp', 'Auth', 'Test', $2, $3, 'client',
      'JO', '+962790000202', '+962790000202', 'ذكر', true, false, true
    ) RETURNING id`,
    [accountId, email.toLowerCase(), passwordHash],
  );
  const userId = Number(rows[0].id);
  await pool.query(
    `INSERT INTO auth_otps (
      email, user_id, purpose, otp_hash, expires_at, last_sent_at, created_at, updated_at
    ) VALUES (lower($1::text), $2::bigint, 'register', $3::text, $4::timestamptz, NOW(), NOW(), NOW())`,
    [email.toLowerCase(), userId, otpHash, expiresAt],
  );
  return userId;
}

rootDescribe("mobile auth session (Postgres integration)", () => {
  it("web login sets cookie and omits token from body", { timeout: 60_000 }, async (t) => {
    if (!integrationEnvOk) {
      t.skip();
      return;
    }

    const { pool } = require("../src/config/db");
    const app = require("../src/app");

    try {
      await pool.query("SELECT 1");
    } catch {
      t.skip();
      return;
    }

    const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const email = `weblogin_${suffix}@example.test`;
    const password = "MobileAuthTest1!";
    const userId = await insertVerifiedTestUser(pool, { email, password });
    const server = await listenApp(app);

    try {
      const { status, body, setCookie } = await httpJson(server, "/api/auth/login", {
        body: { email, password },
      });

      assert.strictEqual(status, 200);
      assert.ok(body.success);
      assert.ok(body.data?.user);
      assert.strictEqual(body.data.token, undefined);
      assert.strictEqual(body.data.accessToken, undefined);
      assert.ok(
        setCookie.some((c) => c.includes(AUTH_COOKIE_NAME)),
        "expected Set-Cookie with auth cookie name",
      );
    } finally {
      await new Promise((r) => server.close(r));
      await pool.query("DELETE FROM users WHERE id = $1::bigint", [userId]);
    }
  });

  it("mobile login returns accessToken without Set-Cookie", { timeout: 60_000 }, async (t) => {
    if (!integrationEnvOk) {
      t.skip();
      return;
    }

    const { pool } = require("../src/config/db");
    const app = require("../src/app");

    try {
      await pool.query("SELECT 1");
    } catch {
      t.skip();
      return;
    }

    const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const email = `moblogin_${suffix}@example.test`;
    const password = "MobileAuthTest1!";
    const userId = await insertVerifiedTestUser(pool, { email, password });
    const server = await listenApp(app);

    try {
      const { status, body, setCookie } = await httpJson(server, "/api/auth/login", {
        headers: { "X-Client-Type": "mobile" },
        body: { email, password },
      });

      assert.strictEqual(status, 200);
      assert.ok(body.success);
      assert.ok(body.data?.user);
      assert.ok(typeof body.data.accessToken === "string" && body.data.accessToken.length > 20);
      assert.strictEqual(body.data.tokenType, "Bearer");
      assert.ok(typeof body.data.expiresIn === "number" && body.data.expiresIn > 0);
      assert.strictEqual(body.data.token, undefined);
      assert.ok(
        !setCookie.some((c) => c.includes(AUTH_COOKIE_NAME)),
        "mobile login must not set auth cookie",
      );

      const me = await httpJson(server, "/api/auth/me", {
        method: "GET",
        bearerToken: body.data.accessToken,
      });
      assert.strictEqual(me.status, 200);
      assert.ok(me.body.data?.user);
      assert.strictEqual(String(me.body.data.user.id), String(userId));
    } finally {
      await new Promise((r) => server.close(r));
      await pool.query("DELETE FROM users WHERE id = $1::bigint", [userId]);
    }
  });

  it("verify-register-otp mobile returns accessToken without cookie", { timeout: 60_000 }, async (t) => {
    if (!integrationEnvOk) {
      t.skip();
      return;
    }

    const { pool } = require("../src/config/db");
    const app = require("../src/app");

    try {
      await pool.query("SELECT 1");
    } catch {
      t.skip();
      return;
    }

    const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const email = `mobotp_${suffix}@example.test`;
    const password = "MobileAuthTest1!";
    const otpPlain = "654321";
    const userId = await insertUnverifiedUserWithOtp(pool, { email, password, otpPlain });
    const server = await listenApp(app);

    try {
      const { status, body, setCookie } = await httpJson(server, "/api/auth/verify-register-otp", {
        headers: { "X-Client-Type": "mobile" },
        body: { email, otp: otpPlain },
      });

      assert.strictEqual(status, 200);
      assert.ok(body.success);
      assert.ok(typeof body.data.accessToken === "string");
      assert.strictEqual(body.data.tokenType, "Bearer");
      assert.ok(!setCookie.some((c) => c.includes(AUTH_COOKIE_NAME)));
    } finally {
      await new Promise((r) => server.close(r));
      await pool.query("DELETE FROM auth_otps WHERE user_id = $1::bigint", [userId]);
      await pool.query("DELETE FROM users WHERE id = $1::bigint", [userId]);
    }
  });
});

describe("authController mobile session wiring", () => {
  it("login and verifyRegisterOtp use sendAuthSuccess", () => {
    const fs = require("node:fs");
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "controllers", "authController.js"), "utf8");
    assert.ok(src.includes("sendAuthSuccess"), "authController imports sendAuthSuccess");
    assert.ok(!src.includes("setAuthCookie(res, token)"), "login/otp must not call setAuthCookie directly");
    assert.ok(src.includes('message: "تم تسجيل الدخول بنجاح."'), "login uses sendAuthSuccess");
    assert.ok(src.includes('message: "تم تأكيد البريد الإلكتروني بنجاح."'), "verifyRegisterOtp uses sendAuthSuccess");
  });
});
