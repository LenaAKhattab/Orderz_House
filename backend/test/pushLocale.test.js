// Unit test: no DB connection is made (the pool is lazy); the URL only satisfies db.js at import.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/unit_test_placeholder_no_connect";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const deviceTokens = require("../src/services/deviceTokensService");
const fcm = require("../src/services/fcmPushService");
const { toEnglish } = require("../src/utils/serverTextEn");

const AR = /[؀-ۿ]/;
const TOKEN = "x".repeat(40);

describe("device token locale", () => {
  it("accepts ar/en only; anything else is unknown (null → Arabic)", () => {
    assert.equal(deviceTokens.normalizeUpsertInput({ token: TOKEN, locale: "en" }).locale, "en");
    assert.equal(deviceTokens.normalizeUpsertInput({ token: TOKEN, locale: "AR" }).locale, "ar");
    assert.equal(deviceTokens.normalizeUpsertInput({ token: TOKEN, locale: "de" }).locale, null);
    assert.equal(deviceTokens.normalizeUpsertInput({ token: TOKEN }).locale, null);
  });
});

describe("localized push payload", () => {
  const n = {
    id: 1,
    type: "user.registered",
    title: "تم إنشاء حسابك بنجاح",
    message: "مرحباً بك في منصة أوردرز هاوس.",
    recipientUserId: 5,
  };

  it("Arabic devices keep the server copy (unchanged behaviour)", () => {
    const p = fcm.buildPushPayload(n);
    assert.equal(p.title, n.title);
    assert.equal(p.body, n.message);
    assert.deepEqual(fcm.buildPushPayload(n, "ar"), p);
  });

  it("English devices get the English copy", () => {
    const p = fcm.buildPushPayload(n, "en");
    assert.equal(p.title, toEnglish(n.title));
    assert.equal(p.body, toEnglish(n.message));
    assert.ok(!AR.test(p.title) && !AR.test(p.body));
  });

  it("unknown Arabic text never reaches an English lock screen", () => {
    const p = fcm.buildPushPayload({ ...n, title: "عنوان غير معروف إطلاقاً ٩٩", message: "نص غير معروف ٩٩" }, "en");
    assert.ok(!AR.test(p.title), p.title);
    assert.ok(!AR.test(p.body), p.body);
  });

  it("types with user-written bodies stay generic in both languages", () => {
    const msg = { ...n, type: "order.message.received", message: "رسالة من المستخدم" };
    assert.ok(!fcm.buildPushPayload(msg, "en").body.includes("رسالة"));
    assert.ok(!AR.test(fcm.buildPushPayload(msg, "en").body));
  });
});

describe("serverTextEn", () => {
  it("returns null for unknown Arabic and passes non-Arabic through", () => {
    assert.equal(toEnglish("نص غير معروف إطلاقاً ٩٩"), null);
    assert.equal(toEnglish("Already English"), "Already English");
  });
});
