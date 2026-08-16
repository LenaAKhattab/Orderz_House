const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  parseStored,
  normalizePackage,
  listPublicTrainingPackages,
  listAdminTrainingPackages,
  upsertTrainingPackage,
  createTrainingPackage,
} = require("../src/services/trainingPackagesService");
const { cloneDefaultTrainingPackages } = require("../src/constants/trainingPackagesCatalog");

function memorySettings(initial = null) {
  let value = initial;
  return {
    async getSetting() {
      return value;
    },
    async setSetting(_key, next) {
      value = next;
      return next;
    },
  };
}

describe("training packages catalog", () => {
  it("returns seeded defaults when unset", async () => {
    const settings = memorySettings(null);
    const pub = await listPublicTrainingPackages(settings);
    assert.equal(pub.length, 3);
    assert.deepEqual(
      pub.map((p) => p.code),
      ["basic", "professional", "premium"],
    );
    assert.deepEqual(
      pub.map((p) => p.priceJod),
      [49, 249, 349],
    );
    assert.equal(pub[1].featured, true);
  });

  it("hides packages from the public list", async () => {
    const defaults = cloneDefaultTrainingPackages();
    defaults[0].isVisible = false;
    const settings = memorySettings(JSON.stringify({ packages: defaults }));
    const pub = await listPublicTrainingPackages(settings);
    const admin = await listAdminTrainingPackages(settings);
    assert.equal(pub.length, 2);
    assert.ok(!pub.some((p) => p.code === "basic"));
    assert.equal(admin.length, 3);
    assert.equal(admin.find((p) => p.code === "basic").isVisible, false);
  });

  it("updates name and price without Stripe fields", async () => {
    const settings = memorySettings(null);
    const updated = await upsertTrainingPackage(
      "basic",
      { nameAr: "باقة الدخول", priceJod: 59 },
      {},
      settings,
    );
    assert.equal(updated.nameAr, "باقة الدخول");
    assert.equal(updated.priceJod, 59);
    const pub = await listPublicTrainingPackages(settings);
    assert.equal(pub.find((p) => p.code === "basic").priceJod, 59);
  });

  it("create can set code", async () => {
    const settings = memorySettings(null);
    const created = await createTrainingPackage(
      { code: "workshop", nameAr: "باقة الورشة", priceJod: 99 },
      {},
      settings,
    );
    assert.equal(created.code, "workshop");
  });

  it("edit cannot change code", async () => {
    const settings = memorySettings(null);
    await assert.rejects(
      () => upsertTrainingPackage("basic", { code: "renamed", nameAr: "باقة الدخول" }, {}, settings),
      (err) =>
        err.statusCode === 400 &&
        err.publicCode === "TRAINING_PACKAGE_CODE_IMMUTABLE" &&
        String(err.message).includes("رمز الباقة"),
    );
    const admin = await listAdminTrainingPackages(settings);
    assert.ok(admin.some((p) => p.code === "basic"));
    assert.ok(!admin.some((p) => p.code === "renamed"));
  });

  it("edit still updates name, price, and features when code is omitted or unchanged", async () => {
    const settings = memorySettings(null);
    const updated = await upsertTrainingPackage(
      "basic",
      {
        code: "basic",
        nameAr: "باقة الدخول",
        nameEn: "Entry",
        priceJod: 59,
        featuresAr: ["ميزة جديدة"],
        whatsappMessageAr: "مرحبًا، أرغب بالاستفسار عن باقة الدخول بسعر 59 د.أ.",
      },
      {},
      settings,
    );
    assert.equal(updated.code, "basic");
    assert.equal(updated.nameAr, "باقة الدخول");
    assert.equal(updated.nameEn, "Entry");
    assert.equal(updated.priceJod, 59);
    assert.deepEqual(updated.featuresAr, ["ميزة جديدة"]);
  });

  it("creates an extra visible package", async () => {
    const settings = memorySettings(null);
    const created = await createTrainingPackage(
      {
        code: "workshop",
        nameAr: "باقة الورشة",
        priceJod: 99,
        featuresAr: ["ورشة مباشرة"],
      },
      {},
      settings,
    );
    assert.equal(created.code, "workshop");
    const pub = await listPublicTrainingPackages(settings);
    assert.equal(pub.length, 4);
  });

  it("rejects invalid price", () => {
    assert.throws(
      () => normalizePackage({ code: "basic", nameAr: "س", priceJod: -1 }),
      (err) => err.statusCode === 400,
    );
  });

  it("parseStored falls back when JSON is empty", () => {
    const list = parseStored("{}");
    assert.equal(list.length, 3);
  });
});

describe("training packages isolation", () => {
  it("does not import Stripe or ordersService", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/trainingPackagesService.js"), "utf8");
    assert.doesNotMatch(src, /stripe|ordersService/i);
  });
});
