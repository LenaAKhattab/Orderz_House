/**
 * Origin guard — production CSRF-style browser origin checks.
 * Native mobile must not be blocked solely for missing Origin.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/origin_guard_test_placeholder";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const {
  originGuardMiddleware,
  shouldSkipOriginGuard,
} = require("../src/middleware/originGuardMiddleware");

function runGuard(req) {
  let status = null;
  let body = null;
  let nextCalled = false;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  originGuardMiddleware(req, res, () => {
    nextCalled = true;
  });
  return { status, body, nextCalled };
}

describe("originGuardMiddleware production behavior", () => {
  let prevNodeEnv;
  let prevClientUrl;
  let prevCorsOrigins;

  before(() => {
    prevNodeEnv = process.env.NODE_ENV;
    prevClientUrl = process.env.CLIENT_URL;
    prevCorsOrigins = process.env.CORS_ORIGINS;
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "https://orderzhouse.com";
    delete process.env.CORS_ORIGINS;
  });

  after(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = prevClientUrl;
    if (prevCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prevCorsOrigins;
  });

  it("allows mobile login without browser Origin", () => {
    const result = runGuard({
      method: "POST",
      path: "/auth/login",
      headers: {},
    });
    assert.strictEqual(result.nextCalled, true);
    assert.strictEqual(result.status, null);
  });

  it("allows mobile login with X-Client-Type: mobile and no Origin", () => {
    const result = runGuard({
      method: "POST",
      path: "/auth/register",
      headers: { "x-client-type": "mobile" },
    });
    assert.strictEqual(result.nextCalled, true);
  });

  it("allows allowed web Origin", () => {
    const result = runGuard({
      method: "POST",
      path: "/auth/login",
      headers: { origin: "https://orderzhouse.com" },
    });
    assert.strictEqual(result.nextCalled, true);
  });

  it("rejects unknown browser Origin", () => {
    const result = runGuard({
      method: "POST",
      path: "/auth/login",
      headers: { origin: "https://evil.example" },
    });
    assert.strictEqual(result.nextCalled, false);
    assert.strictEqual(result.status, 403);
    assert.strictEqual(result.body.code, "FORBIDDEN_ORIGIN");
    assert.match(result.body.message, /طلب غير مصرح من هذا المصدر/);
  });

  it("rejects unknown Origin even when X-Client-Type: mobile is spoofed", () => {
    const result = runGuard({
      method: "POST",
      path: "/auth/login",
      headers: {
        origin: "https://evil.example",
        "x-client-type": "mobile",
      },
    });
    assert.strictEqual(result.nextCalled, false);
    assert.strictEqual(result.status, 403);
    assert.strictEqual(result.body.code, "FORBIDDEN_ORIGIN");
  });

  it("allows allowed Referer when Origin is absent", () => {
    const result = runGuard({
      method: "POST",
      path: "/auth/login",
      headers: { referer: "https://orderzhouse.com/login" },
    });
    assert.strictEqual(result.nextCalled, true);
  });

  it("rejects disallowed Referer when Origin is absent", () => {
    const result = runGuard({
      method: "POST",
      path: "/auth/login",
      headers: { referer: "https://evil.example/x" },
    });
    assert.strictEqual(result.nextCalled, false);
    assert.strictEqual(result.status, 403);
  });

  it("skips partner FAZAT integration paths", () => {
    assert.strictEqual(shouldSkipOriginGuard({ path: "/integrations/fazat/orders" }), true);
    const result = runGuard({
      method: "POST",
      path: "/integrations/fazat/orders",
      headers: { origin: "https://evil.example" },
    });
    assert.strictEqual(result.nextCalled, true);
  });

  it("does not block GET even with unknown Origin", () => {
    const result = runGuard({
      method: "GET",
      path: "/auth/me",
      headers: { origin: "https://evil.example" },
    });
    assert.strictEqual(result.nextCalled, true);
  });
});
