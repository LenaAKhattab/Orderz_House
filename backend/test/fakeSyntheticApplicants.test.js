/**
 * Fake-order synthetic applicants growth (marketplace display only).
 * Run: node --test test/fakeSyntheticApplicants.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/fake_synthetic_applicants_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  computeSyntheticApplicantsCount,
  computeDisplayedFakeApplicantsCount,
  resolveSyntheticApplicantsProfile,
  pickWeightedTarget,
  hashSeed,
} = require("../src/utils/fakeSyntheticApplicants");
const { FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT } = require("../src/utils/fakeMarketplaceApplicantsSql");

function findIdWithTarget({ publishedAt, visibleUntil, predicate, start = 1, limit = 5000 }) {
  for (let id = start; id < start + limit; id += 1) {
    const profile = resolveSyntheticApplicantsProfile({ fakeOrderId: id, publishedAt, visibleUntil });
    if (predicate(profile)) return { id, profile };
  }
  return null;
}

describe("fake synthetic applicants — newly published", () => {
  it("returns 0 at publish time and during initial delay", () => {
    const publishedAt = new Date("2026-09-10T10:00:00.000Z");
    const visibleUntil = new Date("2026-09-10T22:00:00.000Z");
    const hit = findIdWithTarget({
      publishedAt,
      visibleUntil,
      predicate: (p) => p.syntheticApplicantsTarget >= 3,
    });
    assert.ok(hit, "expected an id with target >= 3");

    assert.strictEqual(
      computeSyntheticApplicantsCount({
        fakeOrderId: hit.id,
        publishedAt,
        visibleUntil,
        now: publishedAt,
      }),
      0,
    );

    const duringDelay = new Date(
      publishedAt.getTime() + Math.max(0, hit.profile.syntheticApplicantsDelayMinutes - 1) * 60000,
    );
    assert.strictEqual(
      computeSyntheticApplicantsCount({
        fakeOrderId: hit.id,
        publishedAt,
        visibleUntil,
        now: duringDelay,
      }),
      0,
    );
  });
});

describe("fake synthetic applicants — weighted / low targets", () => {
  it("allows final targets of 0–2 and does not force every order to >= 4", () => {
    const publishedAt = new Date("2026-09-10T08:00:00.000Z");
    const visibleUntil = new Date("2026-09-11T08:00:00.000Z");

    const low = findIdWithTarget({
      publishedAt,
      visibleUntil,
      predicate: (p) => p.syntheticApplicantsTarget <= 2,
    });
    assert.ok(low, "expected at least one order with target 0–2");

    const end = new Date(visibleUntil.getTime() + 60_000);
    assert.ok(
      computeSyntheticApplicantsCount({
        fakeOrderId: low.id,
        publishedAt,
        visibleUntil,
        now: end,
      }) <= 2,
    );

    const targets = [];
    for (let id = 1; id <= 400; id += 1) {
      targets.push(
        resolveSyntheticApplicantsProfile({ fakeOrderId: id, publishedAt, visibleUntil })
          .syntheticApplicantsTarget,
      );
    }
    assert.ok(targets.some((t) => t <= 2), "distribution should include low targets");
    assert.ok(targets.some((t) => t < 4), "not all targets should be >= 4");
    assert.ok(targets.some((t) => t >= 10), "distribution should still include higher targets");
  });

  it("weighted base buckets vary across many ids", () => {
    const counts = { low: 0, mid: 0, high: 0, elite: 0 };
    for (let id = 1; id <= 1000; id += 1) {
      const t = pickWeightedTarget(hashSeed(id));
      if (t <= 2) counts.low += 1;
      else if (t <= 9) counts.mid += 1;
      else if (t <= 18) counts.high += 1;
      else counts.elite += 1;
    }
    assert.ok(counts.low > 40, `expected meaningful low bucket, got ${counts.low}`);
    assert.ok(counts.mid > 200, `expected mid bucket, got ${counts.mid}`);
    assert.ok(counts.high > 50, `expected high bucket, got ${counts.high}`);
  });

  it("short lifetime reduces target vs long lifetime for same id", () => {
    const publishedAt = new Date("2026-09-10T10:00:00.000Z");
    const shortUntil = new Date(publishedAt.getTime() + 60 * 60000); // 1h
    const longUntil = new Date(publishedAt.getTime() + 24 * 60 * 60000); // 24h

    const hit = findIdWithTarget({
      publishedAt,
      visibleUntil: longUntil,
      predicate: (p) => p.syntheticApplicantsBaseTarget >= 10,
      limit: 8000,
    });
    assert.ok(hit);

    const shortProfile = resolveSyntheticApplicantsProfile({
      fakeOrderId: hit.id,
      publishedAt,
      visibleUntil: shortUntil,
    });
    const longProfile = resolveSyntheticApplicantsProfile({
      fakeOrderId: hit.id,
      publishedAt,
      visibleUntil: longUntil,
    });
    assert.ok(
      shortProfile.syntheticApplicantsTarget <= longProfile.syntheticApplicantsTarget,
      `short=${shortProfile.syntheticApplicantsTarget} long=${longProfile.syntheticApplicantsTarget}`,
    );
    assert.ok(shortProfile.syntheticApplicantsTarget < hit.profile.syntheticApplicantsBaseTarget);
  });
});

describe("fake synthetic applicants — gradual growth", () => {
  it("increases over time then reaches target and freezes", () => {
    const publishedAt = new Date("2026-09-10T08:00:00.000Z");
    const visibleUntil = new Date("2026-09-10T20:00:00.000Z");
    const hit = findIdWithTarget({
      publishedAt,
      visibleUntil,
      predicate: (p) => p.syntheticApplicantsTarget >= 4,
    });
    assert.ok(hit);
    const { id, profile } = hit;

    const samples = [];
    for (let hour = 0; hour <= 12; hour += 1) {
      const now = new Date(publishedAt.getTime() + hour * 3600000);
      samples.push(
        computeSyntheticApplicantsCount({
          fakeOrderId: id,
          publishedAt,
          visibleUntil,
          now,
        }),
      );
    }

    assert.strictEqual(samples[0], 0);
    for (let i = 1; i < samples.length; i += 1) {
      assert.ok(samples[i] >= samples[i - 1], `expected non-decreasing at hour ${i}: ${samples[i - 1]} -> ${samples[i]}`);
    }
    assert.ok(samples.some((n) => n > 0), `expected growth, samples=${JSON.stringify(samples)}`);
    const afterRamp = new Date(
      publishedAt.getTime() +
        (profile.syntheticApplicantsDelayMinutes + profile.syntheticApplicantsRampMinutes + 1) * 60000,
    );
    assert.strictEqual(
      computeSyntheticApplicantsCount({
        fakeOrderId: id,
        publishedAt,
        visibleUntil,
        now: afterRamp,
      }),
      profile.syntheticApplicantsTarget,
    );
  });
});

describe("fake synthetic applicants — diversity", () => {
  it("gives different profiles / mid-life counts for different fake order ids", () => {
    const publishedAt = new Date("2026-09-10T09:00:00.000Z");
    const visibleUntil = new Date("2026-09-11T09:00:00.000Z");
    const mid = new Date("2026-09-10T21:00:00.000Z");

    const a = resolveSyntheticApplicantsProfile({ fakeOrderId: 1001, publishedAt, visibleUntil });
    const b = resolveSyntheticApplicantsProfile({ fakeOrderId: 1002, publishedAt, visibleUntil });

    const profilesEqual =
      a.syntheticApplicantsTarget === b.syntheticApplicantsTarget &&
      a.syntheticApplicantsDelayMinutes === b.syntheticApplicantsDelayMinutes &&
      a.syntheticApplicantsRampMinutes === b.syntheticApplicantsRampMinutes &&
      a.syntheticApplicantsCurveType === b.syntheticApplicantsCurveType;

    assert.strictEqual(profilesEqual, false);

    const countA = computeSyntheticApplicantsCount({
      fakeOrderId: 1001,
      publishedAt,
      visibleUntil,
      now: mid,
    });
    const countB = computeSyntheticApplicantsCount({
      fakeOrderId: 1002,
      publishedAt,
      visibleUntil,
      now: mid,
    });
    const countC = computeSyntheticApplicantsCount({
      fakeOrderId: 77777,
      publishedAt,
      visibleUntil,
      now: mid,
    });

    const unique = new Set([countA, countB, countC]);
    assert.ok(unique.size >= 2, `expected diverse mid counts, got ${[countA, countB, countC]}`);
    assert.strictEqual(
      computeSyntheticApplicantsCount({
        fakeOrderId: 1001,
        publishedAt,
        visibleUntil,
        now: mid,
      }),
      countA,
    );
  });
});

describe("fake synthetic applicants — combine with real", () => {
  it("displayed = real + synthetic", () => {
    const publishedAt = new Date("2026-09-10T10:00:00.000Z");
    const visibleUntil = new Date("2026-09-10T22:00:00.000Z");
    const now = new Date("2026-09-10T16:00:00.000Z");
    const out = computeDisplayedFakeApplicantsCount({
      realApplicantsCount: 3,
      fakeOrderId: 555,
      publishedAt,
      visibleUntil,
      now,
    });
    assert.strictEqual(out.realApplicantsCount, 3);
    assert.strictEqual(out.displayedApplicantsCount, out.realApplicantsCount + out.syntheticApplicantsCount);
    assert.ok(out.syntheticApplicantsCount >= 0);
  });
});

describe("architecture — display-only protections", () => {
  it("marketplace SQL no longer adds baseline_applicants_count", () => {
    assert.doesNotMatch(FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT, /baseline_applicants_count/);
    assert.match(FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT, /appc\.applicants_count/);
  });

  it("synthetic helper is only wired into marketplace list/detail display paths", () => {
    const srcRoot = path.join(__dirname, "..", "src");
    const hits = [];
    function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full);
        else if (name.endsWith(".js")) {
          const text = fs.readFileSync(full, "utf8");
          if (
            text.includes("fakeSyntheticApplicants") ||
            text.includes("computeDisplayedFakeApplicantsCount") ||
            text.includes("computeSyntheticApplicantsCount")
          ) {
            hits.push(path.relative(srcRoot, full).replace(/\\/g, "/"));
          }
        }
      }
    }
    walk(srcRoot);
    const allowed = new Set([
      "utils/fakeSyntheticApplicants.js",
      "utils/fakeMarketplaceApplicantsSql.js", // comment-only reference; no require
      "services/hydrateMergedPool.js",
      "services/fakeOrdersService.js",
    ]);
    for (const hit of hits) {
      assert.ok(allowed.has(hit), `unexpected synthetic import/use in ${hit}`);
    }

    const sqlFile = fs.readFileSync(path.join(srcRoot, "utils", "fakeMarketplaceApplicantsSql.js"), "utf8");
    assert.doesNotMatch(sqlFile, /require\(["'].*fakeSyntheticApplicants/);

    const hydrateFile = fs.readFileSync(path.join(srcRoot, "services", "hydrateMergedPool.js"), "utf8");
    assert.match(hydrateFile, /require\(["']\.\.\/utils\/fakeSyntheticApplicants["']\)/);

    const fakeSvc = fs.readFileSync(path.join(srcRoot, "services", "fakeOrdersService.js"), "utf8");
    assert.match(fakeSvc, /require\(["']\.\.\/utils\/fakeSyntheticApplicants["']\)/);
    assert.match(fakeSvc, /getFakePoolOrderMapped[\s\S]*computeDisplayedFakeApplicantsCount/);

    // Admin applicant summary / admin list mapping must stay real-only
    for (const fn of ["mapFakeOrderApplicantSummary", "mapFakeOrderAdmin"]) {
      const idx = fakeSvc.indexOf(`function ${fn}`);
      assert.ok(idx >= 0, fn);
      const block = fakeSvc.slice(idx, idx + 900);
      assert.doesNotMatch(block, /computeDisplayedFakeApplicantsCount|computeSyntheticApplicantsCount/);
    }

    // Business / payment / assignment files must not reference synthetic helpers
    for (const rel of [
      "services/ordersService.js",
      "services/marketplaceBidCreditsService.js",
      "controllers/ordersController.js",
    ]) {
      const full = path.join(srcRoot, rel);
      if (!fs.existsSync(full)) continue;
      const text = fs.readFileSync(full, "utf8");
      assert.doesNotMatch(text, /fakeSyntheticApplicants|computeDisplayedFakeApplicantsCount/);
    }
  });

  it("hydrate applies synthetic only on fake branch", () => {
    const hydrate = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "hydrateMergedPool.js"),
      "utf8",
    );
    assert.match(hydrate, /source === "fake"/);
    assert.match(hydrate, /applyFakeMarketplaceApplicantsDisplay/);
  });
});
