/**
 * Device push tokens + FCM sender contracts (no real Firebase / DB required).
 * Run: node --test test/deviceTokensAndFcmPush.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/device_tokens_fcm_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "sql", "migrations", "110_user_device_tokens.sql");
const routesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "deviceTokensRoutes.js"),
  "utf8",
);
const appSrc = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const notifSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "notificationService.js"),
  "utf8",
);
const envExample = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");

describe("migration 110_user_device_tokens", () => {
  it("creates user_device_tokens with unique token and active index", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS user_device_tokens"));
    assert.ok(sql.includes("uq_user_device_tokens_token"));
    assert.ok(sql.includes("is_active"));
    assert.ok(sql.includes("revoked_at"));
    assert.ok(sql.includes("platform"));
  });
});

describe("device token routes", () => {
  it("requires auth and exposes register + deactivate endpoints", () => {
    assert.ok(routesSrc.includes("requireAuth"));
    assert.ok(routesSrc.includes('"/devices/push-token"'));
    assert.ok(routesSrc.includes("router.post"));
    assert.ok(routesSrc.includes("router.delete"));
    assert.ok(routesSrc.includes("deactivate-all"));
    assert.ok(appSrc.includes("deviceTokensRoutes"));
  });
});

describe("deviceTokensService validation + upsert", () => {
  const servicePath = require.resolve("../src/services/deviceTokensService");

  beforeEach(() => {
    delete require.cache[servicePath];
  });

  afterEach(() => {
    delete require.cache[servicePath];
  });

  it("rejects short tokens and unknown platforms", () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const svc = require("../src/services/deviceTokensService");
    assert.throws(() => svc.normalizeUpsertInput({ token: "short", platform: "android" }), (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, "INVALID_PUSH_TOKEN");
      return true;
    });
    assert.throws(
      () =>
        svc.normalizeUpsertInput({
          token: "a".repeat(40),
          platform: "windows",
        }),
      (err) => {
        assert.equal(err.code, "INVALID_PLATFORM");
        return true;
      },
    );
  });

  it("maskToken never returns the full token", () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const svc = require("../src/services/deviceTokensService");
    const token = "abcdefghijklmnopQRSTUVWXYZ0123456789";
    const masked = svc.maskToken(token);
    assert.ok(!masked.includes(token));
    assert.ok(masked.includes("…") || masked === "[redacted]");
  });

  it("upsert uses ON CONFLICT (token) to update same row", () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const svc = require("../src/services/deviceTokensService");
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return {
          rows: [
            {
              id: 1,
              user_id: 9,
              platform: "android",
              device_id: null,
              app_version: "1.0.0",
              is_active: true,
              last_seen_at: new Date(),
            },
          ],
        };
      },
    };
    return svc.upsertPushToken(9, { token: "t".repeat(40), platform: "android", appVersion: "1.0.0" }, client).then((row) => {
      assert.equal(row.userId, "9");
      assert.ok(calls[0].sql.includes("ON CONFLICT (token)"));
      assert.ok(calls[0].sql.includes("is_active = TRUE"));
      assert.equal(calls[0].params[1], "t".repeat(40));
    });
  });

  it("deactivatePushToken scopes to user_id + token", async () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const svc = require("../src/services/deviceTokensService");
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    };
    const result = await svc.deactivatePushToken(3, "x".repeat(40), client);
    assert.equal(result.deactivated, true);
    assert.ok(calls[0].sql.includes("is_active = FALSE"));
    assert.equal(calls[0].params[0], 3);
  });
});

describe("fcmPushService", () => {
  const fcmPath = require.resolve("../src/services/fcmPushService");
  const tokensPath = require.resolve("../src/services/deviceTokensService");

  beforeEach(() => {
    delete require.cache[fcmPath];
    delete require.cache[tokensPath];
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  });

  afterEach(() => {
    delete require.cache[fcmPath];
    delete require.cache[tokensPath];
  });

  it("buildPushPayload keeps title/body short and omits secrets", () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const fcm = require("../src/services/fcmPushService");
    const payload = fcm.buildPushPayload({
      id: 42,
      title: "A".repeat(200),
      message: "B".repeat(300),
      type: "order_update",
      entityType: "order",
      entityId: 99,
      link: "/dashboard/client/my-orders?orderId=99",
      recipientRole: "client",
      metadata: { cardLast4: "4242", stripePaymentIntentId: "pi_secret" },
    });
    assert.ok(payload.title.length <= 80);
    assert.ok(payload.body.length <= 140);
    assert.equal(payload.data.notificationId, "42");
    assert.equal(payload.data.entityId, "99");
    assert.ok(!JSON.stringify(payload).includes("pi_secret"));
    assert.ok(!JSON.stringify(payload).includes("4242"));
    assert.ok(!JSON.stringify(payload).includes("cardLast4"));
  });

  it("sendPushForNotification skips when FCM is not configured", async () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const fcm = require("../src/services/fcmPushService");
    const result = await fcm.sendPushForNotification({
      id: 1,
      recipientUserId: 5,
      title: "t",
      message: "m",
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "fcm_not_configured");
  });

  it("invalid token errors deactivate device tokens without throwing", async () => {
    const revoked = [];
    require.cache[tokensPath] = {
      id: tokensPath,
      filename: tokensPath,
      loaded: true,
      exports: {
        listActiveTokensForUser: async () => [{ id: 1, token: "bad".padEnd(40, "0"), platform: "android" }],
        deactivateTokensByValues: async (tokens) => {
          revoked.push(...tokens);
          return tokens.length;
        },
      },
    };

    // Force messaging init path with a fake admin.messaging send that fails as invalid.
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      type: "service_account",
      project_id: "demo",
      private_key_id: "x",
      private_key: "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----\n",
      client_email: "demo@demo.iam.gserviceaccount.com",
      client_id: "1",
    });

    // Stub firebase-admin before requiring fcm.
    const adminPath = require.resolve("firebase-admin");
    const previousAdmin = require.cache[adminPath];
    require.cache[adminPath] = {
      id: adminPath,
      filename: adminPath,
      loaded: true,
      exports: {
        apps: [{}],
        credential: { cert: () => ({}) },
        initializeApp: () => ({}),
        messaging: () => ({
          send: async () => {
            const err = new Error("invalid");
            err.code = "messaging/registration-token-not-registered";
            throw err;
          },
        }),
      },
    };

    try {
      delete require.cache[fcmPath];
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const fcm = require("../src/services/fcmPushService");
      const result = await fcm.sendPushForNotification({
        id: 7,
        recipientUserId: 5,
        title: "Hello",
        message: "World",
        type: "test",
      });
      assert.equal(result.sent, 0);
      assert.equal(result.invalid, 1);
      assert.equal(revoked.length, 1);
    } finally {
      if (previousAdmin) require.cache[adminPath] = previousAdmin;
      else delete require.cache[adminPath];
    }
  });
});

describe("notificationService push hook", () => {
  it("queues push after create without awaiting FCM", () => {
    assert.ok(notifSrc.includes('require("./fcmPushService")'));
    assert.ok(notifSrc.includes("queuePushForNotification(mapped)"));
    assert.ok(notifSrc.includes("async function createManyNotifications"));
    // Must not await sendPushForNotification inside create paths.
    const createFn = notifSrc.slice(
      notifSrc.indexOf("async function createNotification"),
      notifSrc.indexOf("async function createManyNotifications"),
    );
    assert.ok(!createFn.includes("await sendPushForNotification"));
    assert.ok(createFn.includes("queuePushForNotification"));
  });
});

describe("env + secrets hygiene", () => {
  it("documents FIREBASE_SERVICE_ACCOUNT env vars", () => {
    assert.ok(envExample.includes("FIREBASE_SERVICE_ACCOUNT_PATH"));
    assert.ok(envExample.includes("FIREBASE_SERVICE_ACCOUNT_JSON"));
  });

  it("fcm source never console.logs token values", () => {
    const fcmSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fcmPushService.js"),
      "utf8",
    );
    assert.ok(!fcmSrc.includes("console.log(device.token"));
    assert.ok(!fcmSrc.includes("console.log(token"));
    assert.ok(!fcmSrc.includes("console.error(device.token"));
  });
});
