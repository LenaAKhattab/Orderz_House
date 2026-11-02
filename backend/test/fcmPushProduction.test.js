/**
 * FCM production push (R2): bounded batching, invalid/temporary failures, per-device dedupe, account switch,
 * lock-screen payload safety, R1A summary and delivery pushes, FCM-down safety.
 * Run: node --test test/fcmPushProduction.test.js
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/fcm_push_production_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fcmPath = require.resolve("../src/services/fcmPushService");
const tokensPath = require.resolve("../src/services/deviceTokensService");
const adminPath = require.resolve("firebase-admin");
const dbPath = require.resolve("../src/config/db");

const FAKE_SA = JSON.stringify({ type: "service_account", project_id: "demo", private_key: "k", client_email: "demo@demo.iam.gserviceaccount.com" });

let previousAdmin;
function stubAdmin(sendEach) {
  previousAdmin = require.cache[adminPath];
  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: { apps: [{}], credential: { cert: () => ({}) }, initializeApp: () => ({}), messaging: () => ({ sendEach }) },
  };
}
function stubTokens(impl) {
  require.cache[tokensPath] = { id: tokensPath, filename: tokensPath, loaded: true, exports: impl };
}
function loadFcm() {
  delete require.cache[fcmPath];
  // eslint-disable-next-line global-require
  return require("../src/services/fcmPushService");
}
const tok = (n) => `tok${n}:`.padEnd(142, "x");

beforeEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  delete require.cache[fcmPath];
  delete require.cache[tokensPath];
});
afterEach(() => {
  if (previousAdmin) require.cache[adminPath] = previousAdmin;
  else delete require.cache[adminPath];
  previousAdmin = undefined;
  delete require.cache[fcmPath];
  delete require.cache[tokensPath];
});

describe("configuration", () => {
  it("unconfigured: push skipped, nothing thrown, notifications unaffected", async () => {
    stubTokens({ listActiveTokensForUsers: async () => { throw new Error("must not query tokens"); } });
    const fcm = loadFcm();
    assert.equal(fcm.isPushConfigured(), false);
    const r = await fcm.sendPushBatch([{ id: 1, recipientUserId: 5, type: "order.created", title: "t", message: "m" }]);
    assert.equal(r.skipped, true);
    assert.equal(r.reason, "fcm_not_configured");
  });

  it("configured from FIREBASE_SERVICE_ACCOUNT_PATH (mounted file)", () => {
    const os = require("node:os");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fcm-")), "sa.json");
    fs.writeFileSync(file, FAKE_SA);
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = file;
    stubAdmin(async () => ({ responses: [] }));
    const fcm = loadFcm();
    assert.equal(fcm.isPushConfigured(), true);
  });
});

describe("sending", () => {
  function setup({ devices, sendEach }) {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = FAKE_SA;
    const calls = { lookups: [], sends: [], deactivated: [] };
    stubTokens({
      listActiveTokensForUsers: async (ids) => {
        calls.lookups.push(ids);
        return devices.filter((d) => ids.includes(d.userId));
      },
      deactivateTokensByValues: async (tokens) => {
        calls.deactivated.push(...tokens);
        return tokens.length;
      },
    });
    stubAdmin(async (messages) => {
      calls.sends.push(messages);
      return sendEach(messages);
    });
    return { fcm: loadFcm(), calls };
  }

  it("one message per device; FCM-accepted counted", async () => {
    const { fcm, calls } = setup({
      devices: [{ userId: 1, token: tok(1), platform: "android" }, { userId: 1, token: tok(2), platform: "android" }, { userId: 2, token: tok(3), platform: "android" }],
      sendEach: async (msgs) => ({ responses: msgs.map(() => ({ success: true })) }),
    });
    const r = await fcm.sendPushBatch([
      { id: 10, recipientUserId: 1, type: "order.delivery.submitted", title: "تم إرسال تسليم جديد", message: "أُرسل تسليم جديد لهذا الطلب — يرجى المراجعة." },
      { id: 11, recipientUserId: 2, type: "order.delivery.submitted", title: "تم إرسال تسليم جديد", message: "أُرسل تسليم جديد لهذا الطلب — يرجى المراجعة." },
      { id: 12, recipientUserId: 3, type: "order.delivery.submitted", title: "x", message: "y" },
    ]);
    assert.equal(calls.lookups.length, 1, "one token lookup per batch");
    assert.equal(calls.sends.length, 1);
    assert.equal(r.messages, 3);
    assert.equal(r.accepted, 3);
    assert.equal(r.noDevice, 1);
  });

  it("permanent invalid token → deactivated; temporary error → kept; sender mismatch never mass-deactivates", async () => {
    const { fcm, calls } = setup({
      devices: [1, 2, 3, 4].map((n) => ({ userId: n, token: tok(n), platform: "android" })),
      sendEach: async () => ({
        responses: [
          { success: false, error: { code: "messaging/registration-token-not-registered" } },
          { success: false, error: { code: "messaging/invalid-registration-token" } },
          { success: false, error: { code: "messaging/unavailable" } },
          { success: false, error: { code: "messaging/mismatched-credential" } },
        ],
      }),
    });
    const r = await fcm.sendPushBatch([1, 2, 3, 4].map((n) => ({ id: n, recipientUserId: n, type: "order.created", title: "t", message: "m" })));
    assert.deepEqual(calls.deactivated.sort(), [tok(1), tok(2)].sort());
    assert.equal(r.invalidRemoved, 2);
    assert.equal(r.temporary, 2);
    assert.equal(r.failed, 4);
    assert.deepEqual(r.errorCodes, {
      "messaging/registration-token-not-registered": 1,
      "messaging/invalid-registration-token": 1,
      "messaging/unavailable": 1,
      "messaging/mismatched-credential": 1,
    });
  });

  it("FCM down (whole call fails) → counted as temporary, never throws, no retry loop", async () => {
    let attempts = 0;
    const { fcm, calls } = setup({
      devices: [{ userId: 1, token: tok(1), platform: "android" }],
      sendEach: async () => {
        attempts += 1;
        const err = new Error("ECONNRESET");
        err.code = "app/network-error";
        throw err;
      },
    });
    const r = await fcm.sendPushBatch([{ id: 1, recipientUserId: 1, type: "order.created", title: "t", message: "m" }]);
    assert.equal(attempts, 1);
    assert.equal(r.temporary, 1);
    assert.equal(calls.deactivated.length, 0);
  });

  it("token lookup failing (DB down) → batch reported, never throws", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = FAKE_SA;
    stubTokens({ listActiveTokensForUsers: async () => { throw new Error("db down"); } });
    stubAdmin(async () => ({ responses: [] }));
    const fcm = loadFcm();
    const r = await fcm.sendPushBatch([{ id: 1, recipientUserId: 1, type: "order.created", title: "t", message: "m" }]);
    assert.equal(r.skipped, true);
    assert.equal(r.reason, "error");
  });

  it("sendEach is chunked at ≤ 500 messages", async () => {
    const devices = Array.from({ length: 1200 }, (_, i) => ({ userId: i + 1, token: tok(i + 1), platform: "android" }));
    const { fcm, calls } = setup({ devices, sendEach: async (msgs) => ({ responses: msgs.map(() => ({ success: true })) }) });
    const r = await fcm.sendPushBatch(devices.map((d) => ({ id: d.userId, recipientUserId: d.userId, type: "order.pool.summary", title: "t", message: "m" })));
    assert.deepEqual(calls.sends.map((s) => s.length), [500, 500, 200]);
    assert.equal(r.accepted, 1200);
  });
});

describe("queue — bounded fan-out for R1A summaries", () => {
  it("5,900 summaries drain in batches of 200 (sequential), one push per recipient", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = FAKE_SA;
    const lookups = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const devices = Array.from({ length: 300 }, (_, i) => ({ userId: i + 1, token: tok(i + 1), platform: "android" }));
    stubTokens({
      listActiveTokensForUsers: async (ids) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        lookups.push(ids.length);
        await new Promise((r) => setImmediate(r));
        inFlight -= 1;
        return devices.filter((d) => ids.includes(d.userId));
      },
      deactivateTokensByValues: async () => 0,
    });
    const sent = [];
    stubAdmin(async (msgs) => {
      sent.push(...msgs);
      return { responses: msgs.map(() => ({ success: true })) };
    });
    const fcm = loadFcm();
    const summary = { type: "order.pool.summary", title: "تمت إضافة مجموعة جديدة من الطلبات", message: "يتوفر الآن 13 طلبًا جديدًا مناسبًا لك." };
    for (let uid = 1; uid <= 5900; uid += 1) fcm.queuePushForNotification({ id: uid, recipientUserId: uid, ...summary });
    for (let i = 0; i < 400 && fcm.getPushStats().queueLength + (inFlight ? 1 : 0) > 0; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(lookups.length, Math.ceil(5900 / 200));
    assert.ok(lookups.every((n) => n <= 200));
    assert.equal(maxInFlight, 1, "one batch at a time");
    assert.equal(sent.length, 300, "one push per recipient with a device — not one per order");
    assert.equal(new Set(sent.map((m) => m.token)).size, 300);
    assert.equal(sent[0].notification.body, summary.message);
    const s = fcm.getPushStats();
    assert.equal(s.accepted, 300);
    assert.equal(s.noDevice, 5600);
  });
});

describe("payload — lock-screen safety, language, navigation", () => {
  const fcm = () => loadFcm();

  it("delivery push: static Arabic copy + canonical deep link (orderId, openReview) as data", () => {
    const p = fcm().buildPushPayload({
      id: 9,
      type: "order.delivery.submitted",
      title: "تم إرسال تسليم جديد",
      message: "أُرسل تسليم جديد لهذا الطلب — يرجى المراجعة.",
      entityType: "order",
      entityId: "321",
      link: "/dashboard/client/my-orders?orderId=321&openReview=1",
      recipientRole: "client",
      metadata: { submissionId: "77", projectName: "سري", actorName: "اسم" },
    });
    assert.equal(p.title, "تم إرسال تسليم جديد");
    assert.equal(p.body, "أُرسل تسليم جديد لهذا الطلب — يرجى المراجعة.");
    assert.equal(p.data.actionUrl, "/dashboard/client/my-orders?orderId=321&openReview=1");
    assert.equal(p.data.orderId, "321");
    assert.equal(p.data.type, "order.delivery.submitted");
    assert.doesNotMatch(JSON.stringify(p), /سري|اسم|submissionId/);
  });

  it("chat messages and revision notes never reach the lock screen", () => {
    const chat = fcm().buildPushPayload({ type: "order.message.received", title: "رسالة جديدة على الطلب", message: "رقم حسابي البنكي 123" });
    assert.equal(chat.title, "رسالة جديدة على الطلب");
    assert.doesNotMatch(chat.body, /123|حسابي/);
    const rev = fcm().buildPushPayload({ type: "order.revision.requested", title: "تم طلب تعديلات", message: "غيّر الشعار في ملف client_logo_final.psd" });
    assert.doesNotMatch(rev.body, /psd|الشعار/);
  });

  it("unlisted or templated types are fully generic (no titles of orders/courses/requests)", () => {
    for (const n of [
      { type: "freelancer.review.received", title: "تقييم جديد", message: "حصلت على تقييم 5 نجوم لطلب «مشروع سري»." },
      { type: "pantry.request.bid", title: "عرض", message: "تم تقديم عرض على: طلب خاص" },
      { type: "some.future.type", title: "${x}", message: "secret" },
    ]) {
      const p = fcm().buildPushPayload(n);
      assert.equal(p.title, "Orderz House");
      assert.doesNotMatch(`${p.title} ${p.body}`, /سري|خاص|secret/);
    }
  });

  it("no internal enum/type in visible text; Arabic stays intact (RTL text not mangled)", () => {
    const f = fcm();
    for (const type of f.STATIC_TEXT_TYPES) {
      const p = f.buildPushPayload({ type, title: "تم الدفع بنجاح", message: "تم استلام الدفع وفتح الطلب للمستقلين." });
      assert.doesNotMatch(`${p.title} ${p.body}`, /[a-z]+\.[a-z_]+|payment_|order\./);
    }
    const summary = f.buildPushPayload({ type: "order.pool.summary", title: "تمت إضافة مجموعة جديدة من الطلبات", message: "يتوفر الآن 1234 طلبًا جديدًا مناسبًا لك." });
    assert.equal(summary.body, "يتوفر الآن 1234 طلبًا جديدًا مناسبًا لك.");
  });

  it("every allowlisted type uses static copy in its producer (no templated user content)", () => {
    const f = fcm();
    const srcDir = path.join(__dirname, "..", "src");
    const files = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d)) {
        const p = path.join(d, e);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) files.push(p);
      }
    })(srcDir);
    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        const m = line.match(/\btype:\s*"([^"]+)"/);
        if (!m || !f.STATIC_TEXT_TYPES.has(m[1]) || m[1] === "order.pool.summary") return;
        const win = lines.slice(Math.max(0, i - 2), i + 9).join("\n");
        assert.doesNotMatch(win, /(title|message):\s*`[^`]*\$\{/, `${path.basename(file)}:${i + 1} ${m[1]} uses templated text`);
      });
    }
  });
});

describe("tokens — ownership, dedupe, account switch (SQL contract)", () => {
  function loadTokensWithClient(results = []) {
    delete require.cache[tokensPath];
    const queries = [];
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { query: async () => ({ rows: [] }) } } };
    // eslint-disable-next-line global-require
    const svc = require("../src/services/deviceTokensService");
    const client = {
      async query(sql, params) {
        queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
        return results.shift() || { rows: [{ id: 1, user_id: params?.[0], platform: "android", is_active: true }], rowCount: 1 };
      },
    };
    return { svc, client, queries };
  }
  afterEach(() => {
    delete require.cache[dbPath];
    delete require.cache[tokensPath];
  });

  it("registration uses the authenticated user id; a userId in the body is ignored", async () => {
    const { svc, client, queries } = loadTokensWithClient();
    await svc.upsertPushToken(7, { token: tok(1), platform: "android", deviceId: "dev-A", userId: 999 }, client);
    assert.equal(queries[0].params[0], 7);
    assert.ok(!queries[0].params.includes(999));
    const ctrl = fs.readFileSync(path.join(__dirname, "..", "src", "controllers", "deviceTokensController.js"), "utf8");
    assert.match(ctrl, /upsertPushToken\(req\.auth\.userId, req\.body/);
    assert.match(ctrl, /deactivatePushToken\(req\.auth\.userId,/);
  });

  it("same install re-registering (rotation or another account) supersedes every other token of that install", async () => {
    const { svc, client, queries } = loadTokensWithClient();
    await svc.upsertPushToken(8, { token: tok(2), platform: "android", deviceId: "dev-A" }, client);
    assert.match(queries[0].sql, /ON CONFLICT \(token\) DO UPDATE SET user_id = EXCLUDED\.user_id/);
    assert.match(queries[1].sql, /UPDATE user_device_tokens SET is_active = FALSE, revoked_at = NOW\(\), updated_at = NOW\(\) WHERE device_id = \$1 AND token <> \$2 AND is_active = TRUE/);
    assert.deepEqual(queries[1].params, ["dev-A", tok(2)]);
    assert.doesNotMatch(queries[1].sql, /user_id/, "not scoped to the user: the previous account on this install is cut off too");
  });

  it("no deviceId → no install-wide supersede", async () => {
    const { svc, client, queries } = loadTokensWithClient();
    await svc.upsertPushToken(8, { token: tok(3), platform: "android" }, client);
    assert.equal(queries.length, 1);
  });

  it("send-time lookup returns one token per install (newest)", async () => {
    const { svc, client, queries } = loadTokensWithClient([{ rows: [] }]);
    await svc.listActiveTokensForUsers([1, 2, 2, "x"], client);
    assert.match(queries[0].sql, /SELECT DISTINCT ON \(user_id, COALESCE\(device_id, token\)\)/);
    assert.match(queries[0].sql, /ORDER BY user_id, COALESCE\(device_id, token\), last_seen_at DESC, id DESC/);
    assert.deepEqual(queries[0].params, [[1, 2]]);
  });
});

describe("compose + secrets", () => {
  it("production compose mounts the credential read-only; nothing secret in the repo", () => {
    const compose = fs.readFileSync(path.join(__dirname, "..", "..", "docker-compose.production.yml"), "utf8");
    assert.match(compose, /- \/etc\/orderzhouse\/firebase-service-account\.json:\/etc\/orderzhouse\/firebase-service-account\.json:ro/);
    assert.doesNotMatch(compose, /private_key|BEGIN PRIVATE KEY|FIREBASE_SERVICE_ACCOUNT_JSON=/);
    const src = fs.readFileSync(fcmPath, "utf8");
    assert.doesNotMatch(src, /console\.(log|error)\([^)]*token/i);
  });
});
