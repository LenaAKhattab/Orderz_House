/**
 * PROD-429-FIX-1 — architecture: auth skipped from global; order create dedicated; safe 429 logs.
 * Run: node --test test/prod429RateLimitArchitecture.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/prod429_ratelimit_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { shouldSkipGeneralApiRateLimit } = require("../src/middleware/apiRateLimiter");
const { getApiRateLimitMax, DEFAULT_MAX } = require("../src/config/apiRateLimit");
const { userOrIpKey, RATE_LIMITED_CODE, rateLimitJsonHandler } = require("../src/middleware/rateLimitHelpers");
const { maskIp } = require("../src/utils/rateLimitLog");
const {
  createOrderConcurrencyGuard,
  _resetCreateOrderConcurrencyForTests,
} = require("../src/middleware/orderCreateConcurrency");

describe("global_api skip list (auth + order writes)", () => {
  it("skips health, stripe, and entire /auth/*", () => {
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/health", method: "GET" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/webhooks/stripe", method: "POST" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/auth/login", method: "POST" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/auth/logout", method: "POST" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/auth/me", method: "GET" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/auth/register", method: "POST" }), true);
  });

  it("skips dedicated order-create and bid/take POSTs so they do not fill global IP bucket", () => {
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/client/orders", method: "POST" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/admin/orders", method: "POST" }), true);
    assert.strictEqual(
      shouldSkipGeneralApiRateLimit({ path: "/admin/training-orders/fake-orders", method: "POST" }),
      true,
    );
    assert.strictEqual(
      shouldSkipGeneralApiRateLimit({ path: "/admin/training-orders/force-generate", method: "POST" }),
      true,
    );
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/orders/pool/9/bids", method: "POST" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/orders/pool/9/take", method: "POST" }), true);
  });

  it("does not skip ordinary reads or nested client order actions", () => {
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/notifications/unread-count", method: "GET" }), false);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/public/popup-ads", method: "GET" }), false);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/client/orders/1/pay-checkout", method: "POST" }), false);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/admin/orders/1/accept", method: "PATCH" }), false);
  });

  it("default general max is at least 300 (SPA read budget)", () => {
    const prev = process.env.API_RATE_LIMIT_MAX;
    delete process.env.API_RATE_LIMIT_MAX;
    assert.ok(DEFAULT_MAX >= 300);
    assert.ok(getApiRateLimitMax() >= 300);
    if (prev === undefined) delete process.env.API_RATE_LIMIT_MAX;
    else process.env.API_RATE_LIMIT_MAX = prev;
  });
});

describe("userOrIpKey for authenticated write limiters", () => {
  it("prefers userId over IP when auth is present", () => {
    const withUser = userOrIpKey("order_create", { auth: { userId: "42" }, ip: "10.0.0.1" });
    const otherUser = userOrIpKey("order_create", { auth: { userId: "99" }, ip: "10.0.0.1" });
    assert.strictEqual(withUser, "order_create:user:42");
    assert.notStrictEqual(withUser, otherUser);
  });

  it("falls back to IP for guests", () => {
    const key = userOrIpKey("order_create", { ip: "203.0.113.9", socket: {} });
    assert.ok(key.startsWith("order_create:ip:"));
    assert.ok(key.includes("203.0.113.9"));
  });
});

describe("safe 429 logging", () => {
  it("masks IPv4 last octet", () => {
    assert.strictEqual(maskIp("203.0.113.55"), "203.0.113.***");
  });

  it("rateLimitJsonHandler logs limiterName and omits secrets", () => {
    const lines = [];
    const prevWarn = console.warn;
    console.warn = (msg) => lines.push(String(msg));
    try {
      const handler = rateLimitJsonHandler("order_create", "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم حاول مرة أخرى.");
      const headers = {};
      const res = {
        set(k, v) {
          headers[k] = v;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
        },
      };
      const req = {
        method: "POST",
        originalUrl: "/api/client/orders",
        ip: "198.51.100.20",
        auth: { userId: "7" },
        headers: {
          authorization: "Bearer SECRET_TOKEN_DO_NOT_LOG",
          cookie: "session=SECRET",
        },
      };
      handler(req, res, () => {}, { windowMs: 60_000, resetTime: new Date(Date.now() + 30_000) });
      assert.strictEqual(res.statusCode, 429);
      assert.strictEqual(res.body.code, RATE_LIMITED_CODE);
      assert.strictEqual(res.body.limiter, "order_create");
      assert.ok(headers["Retry-After"]);
      assert.ok(lines.length >= 1);
      const payload = JSON.parse(lines[0]);
      assert.strictEqual(payload.event, "rate_limit_exceeded");
      assert.strictEqual(payload.limiterName, "order_create");
      assert.strictEqual(payload.userId, "7");
      assert.ok(!JSON.stringify(payload).includes("SECRET"));
      assert.ok(!JSON.stringify(payload).includes("Bearer"));
      assert.ok(!JSON.stringify(payload).includes("cookie"));
    } finally {
      console.warn = prevWarn;
    }
  });
});

describe("create order concurrency guard", () => {
  beforeEach(() => _resetCreateOrderConcurrencyForTests());
  afterEach(() => _resetCreateOrderConcurrencyForTests());

  it("blocks second concurrent create for same user", () => {
    const guard = createOrderConcurrencyGuard({ maxConcurrent: 1 });
    const req = { auth: { userId: "55" }, method: "POST", originalUrl: "/api/client/orders", ip: "1.2.3.4" };
    const listeners = {};
    const res1 = {
      on(ev, fn) {
        listeners[ev] = fn;
      },
      set() {},
      status() {
        return this;
      },
      json() {},
    };
    let next1 = false;
    guard(req, res1, () => {
      next1 = true;
    });
    assert.strictEqual(next1, true);

    let status2 = null;
    let body2 = null;
    const res2 = {
      on() {},
      set() {},
      status(code) {
        status2 = code;
        return this;
      },
      json(b) {
        body2 = b;
      },
    };
    let next2 = false;
    guard(req, res2, () => {
      next2 = true;
    });
    assert.strictEqual(next2, false);
    assert.strictEqual(status2, 429);
    assert.strictEqual(body2.code, RATE_LIMITED_CODE);
    listeners.finish?.();
  });
});

describe("route wiring source contracts", () => {
  it("client create order mounts burst + hourly + concurrency after auth", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "ordersRoutes.js"), "utf8");
    const block = src.slice(src.indexOf('"/client/orders"'), src.indexOf("clientOrdersController.createClientOrder"));
    assert.ok(block.includes("requireAuth"));
    assert.ok(block.includes("clientOrderCreateBurstLimiter"));
    assert.ok(block.includes("clientOrderCreateHourlyLimiter"));
    assert.ok(block.includes("clientOrderCreateConcurrency"));
    assert.ok(block.indexOf("requireAuth") < block.indexOf("clientOrderCreateBurstLimiter"));
  });

  it("admin create order mounts adminOrderCreateLimiter", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "adminOrdersRoutes.js"), "utf8");
    assert.ok(src.includes("adminOrderCreateLimiter"));
    assert.ok(src.includes("adminOrderCreateConcurrency"));
  });

  it("login limiter remains wired on auth routes", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "authRoutes.js"), "utf8");
    assert.ok(src.includes("loginLimiter"));
    assert.ok(src.includes("registerLimiter"));
    assert.ok(src.includes("resetPasswordLimiter"));
  });
});
