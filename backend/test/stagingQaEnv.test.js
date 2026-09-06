/**
 * Staging QA env loader / guards — no real DB required for unit cases.
 * Run: node --test test/stagingQaEnv.test.js
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  collectStagingQaWarnings,
  createStagingQaError,
} = require("../src/config/stagingQaEnv");

const PROD_URL =
  "postgresql://u:SECRET@ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const STAGING_URL =
  "postgresql://u:p@ep-solitary-band-ahprgqd4-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

const prev = { ...process.env };

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in prev)) delete process.env[k];
  }
  Object.assign(process.env, prev);
});

function withTempRoot(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oh-staging-qa-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmp, name), body, "utf8");
    }
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe("loadStagingQaEnv", () => {
  it("requires .env.staging", () => {
    withTempRoot({}, (tmp) => {
      assert.throws(
        () => loadStagingQaEnv({ root: tmp, fillFromDefaultEnv: false, env: {} }),
        (e) => e && e.code === "STAGING_ENV_MISSING",
      );
    });
  });

  it("loads staging keys and does not let .env override DATABASE_URL", () => {
    withTempRoot(
      {
        ".env.staging": [
          "APP_ENV=staging",
          `DATABASE_URL=${STAGING_URL}`,
          "CLIENT_URL=http://localhost:5174",
        ].join("\n"),
        ".env": [
          "APP_ENV=local",
          `DATABASE_URL=${PROD_URL}`,
          "JWT_SECRET=dev_jwt_secret_16chars",
          "STRIPE_SECRET_KEY=sk_live_x",
        ].join("\n"),
      },
      (tmp) => {
        const env = {};
        loadStagingQaEnv({ root: tmp, fillFromDefaultEnv: true, env });
        assert.equal(env.APP_ENV, "staging");
        assert.ok(String(env.DATABASE_URL).includes("solitary-band"));
        assert.equal(String(env.DATABASE_URL).includes("wandering-cherry"), false);
        assert.equal(env.JWT_SECRET, "dev_jwt_secret_16chars");
        assert.equal(env.STRIPE_SECRET_KEY, "sk_live_x");
      },
    );
  });
});

describe("assertStagingQaTarget", () => {
  it("accepts APP_ENV=staging with non-production host", () => {
    const env = {
      APP_ENV: "staging",
      DATABASE_URL: STAGING_URL,
      STRIPE_SECRET_KEY: "sk_test_x",
    };
    const target = assertStagingQaTarget(env);
    assert.equal(target.appEnv, "staging");
    assert.equal(target.db.isProduction, false);
    assert.equal(target.maskedTarget.includes("SECRET"), false);
  });

  it("refuses Production host even if APP_ENV=staging", () => {
    const env = {
      APP_ENV: "staging",
      DATABASE_URL: PROD_URL,
    };
    assert.throws(
      () => assertStagingQaTarget(env),
      (e) => e && e.code === "STAGING_PRODUCTION_DB_REFUSED",
    );
  });

  it("refuses non-staging APP_ENV", () => {
    const env = {
      APP_ENV: "local",
      DATABASE_URL: STAGING_URL,
    };
    assert.throws(
      () => assertStagingQaTarget(env),
      (e) => e && e.code === "STAGING_APP_ENV_REQUIRED",
    );
  });
});

describe("collectStagingQaWarnings", () => {
  it("warns on live Stripe and Bildazo publish flag", () => {
    const warnings = collectStagingQaWarnings({
      STRIPE_SECRET_KEY: "sk_live_abc",
      BILDAZO_ARTICLE_PUBLISH_ENABLED: "true",
    });
    assert.ok(warnings.some((w) => /LIVE/i.test(w)));
    assert.ok(warnings.some((w) => /BILDAZO_ARTICLE_PUBLISH/i.test(w)));
  });

  it("createStagingQaError sets code", () => {
    const err = createStagingQaError("X", "msg");
    assert.equal(err.code, "X");
    assert.equal(err.message, "msg");
  });
});

describe("assertDatabaseWritable message", () => {
  it("exports assertDatabaseWritable and uses clear BLOCKED message shape", () => {
    const {
      assertDatabaseWritable,
      assertStagingWriteProbe,
    } = require("../src/config/stagingQaEnv");
    assert.equal(typeof assertDatabaseWritable, "function");
    assert.equal(typeof assertStagingWriteProbe, "function");
    const err = createStagingQaError(
      "STAGING_DATABASE_READ_ONLY",
      "BLOCKED: Staging DATABASE_URL is read-only. Use a writable Staging connection.",
    );
    assert.equal(err.code, "STAGING_DATABASE_READ_ONLY");
    assert.match(err.message, /BLOCKED: Staging DATABASE_URL is read-only/);
  });
});
