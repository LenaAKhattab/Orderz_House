/**
 * Environment + database safety unit tests.
 * Does NOT connect to a real database.
 * Run: node --test test/databaseEnvironmentSafety.test.js
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyDatabaseUrl,
  resolveAppEnv,
  evaluateMixedEnvironment,
  assertNonProductionMigrationAllowed,
  assertStagingMigrationAllowed,
  assertProductionMigrationAllowed,
  assertQaMutationAllowed,
  maskDatabaseTarget,
  PRODUCTION_MIGRATE_CONFIRM_VALUE,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");
const { loadBackendEnv } = require("../src/config/loadBackendEnv");

const PROD_URL =
  "postgresql://u:SECRET_PASSWORD@ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL_URL = "postgresql://u:p@127.0.0.1:5432/orderz_house_local";
const SANDBOX_URL = "postgresql://u:p@ep-other-branch.neon.tech/orderz_house_stripe_sandbox";
const STAGING_URL =
  "postgresql://u:p@ep-staging-ord20-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

const prev = { ...process.env };

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in prev)) delete process.env[k];
  }
  Object.assign(process.env, prev);
});

describe("production host classification", () => {
  it("classifies known Neon pooler host as PRODUCTION", () => {
    const info = classifyDatabaseUrl(PROD_URL);
    assert.equal(info.isProduction, true);
    assert.equal(info.classification, "PRODUCTION");
    assert.equal(info.database, "neondb");
    assert.ok(KNOWN_PRODUCTION_HOST_MARKERS.some((m) => info.host.includes("wandering-cherry")));
  });

  it("masks DB target without password", () => {
    const masked = maskDatabaseTarget(PROD_URL);
    assert.ok(masked.includes("ep-wandering-cherry"));
    assert.ok(masked.includes("neondb"));
    assert.equal(masked.includes("SECRET_PASSWORD"), false);
    assert.equal(masked.includes("postgresql://"), false);
  });

  it("classifies localhost as LOCAL", () => {
    const info = classifyDatabaseUrl(LOCAL_URL);
    assert.equal(info.classification, "LOCAL");
    assert.equal(info.isProduction, false);
  });
});

describe("mixed environment evaluation", () => {
  it("allows APP_ENV=local + local DB + sk_test", () => {
    const env = {
      APP_ENV: "local",
      NODE_ENV: "development",
      DATABASE_URL: LOCAL_URL,
      STRIPE_SECRET_KEY: "sk_test_x",
      CLIENT_URL: "http://localhost:5173",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, true);
  });

  it("blocks APP_ENV=local + production DB", () => {
    const env = {
      APP_ENV: "local",
      NODE_ENV: "development",
      DATABASE_URL: PROD_URL,
      STRIPE_SECRET_KEY: "sk_test_x",
      CLIENT_URL: "http://localhost:5173",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, false);
    assert.equal(result.code, "UNSAFE_MIXED_ENVIRONMENT");
  });

  it("blocks APP_ENV=sandbox + production DB", () => {
    const env = {
      APP_ENV: "sandbox",
      DATABASE_URL: PROD_URL,
      STRIPE_SECRET_KEY: "sk_test_x",
      CLIENT_URL: "http://localhost:5173",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, false);
  });

  it("blocks APP_ENV=sandbox + sk_live", () => {
    const env = {
      APP_ENV: "sandbox",
      DATABASE_URL: SANDBOX_URL,
      STRIPE_SECRET_KEY: "sk_live_x",
      CLIENT_URL: "http://localhost:5173",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => /Live Stripe/i.test(i)));
  });

  it("allows APP_ENV=production + production DB + sk_live", () => {
    const env = {
      APP_ENV: "production",
      NODE_ENV: "production",
      DATABASE_URL: PROD_URL,
      STRIPE_SECRET_KEY: "sk_live_x",
      CLIENT_URL: "https://orderzhouse.com",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, true);
  });

  it("blocks APP_ENV=production + localhost CLIENT_URL", () => {
    const env = {
      APP_ENV: "production",
      NODE_ENV: "production",
      DATABASE_URL: PROD_URL,
      STRIPE_SECRET_KEY: "sk_live_x",
      CLIENT_URL: "http://localhost:5173",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, false);
  });

  it("blocks APP_ENV=production + sk_test", () => {
    const env = {
      APP_ENV: "production",
      NODE_ENV: "production",
      DATABASE_URL: PROD_URL,
      STRIPE_SECRET_KEY: "sk_test_x",
      CLIENT_URL: "https://orderzhouse.com",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, false);
  });
});

describe("migration guards", () => {
  it("blocks normal db:migrate against production DB", () => {
    const env = { DATABASE_URL: PROD_URL, APP_ENV: "local", NODE_ENV: "development" };
    assert.throws(
      () => assertNonProductionMigrationAllowed("database migration", env),
      (e) => e && e.code === "PRODUCTION_DATABASE_WRITE_BLOCKED",
    );
  });

  it("blocks db:migrate:production without approvals", () => {
    const env = {
      DATABASE_URL: PROD_URL,
      APP_ENV: "production",
      NODE_ENV: "production",
    };
    assert.throws(
      () => assertProductionMigrationAllowed("production database migration", env),
      (e) => e && e.code === "PRODUCTION_MIGRATION_APPROVAL_REQUIRED",
    );
  });

  it("allows db:migrate:production with full approvals", () => {
    const env = {
      DATABASE_URL: PROD_URL,
      APP_ENV: "production",
      NODE_ENV: "production",
      ALLOW_PRODUCTION_DB_MIGRATIONS: "1",
      CONFIRM_PRODUCTION_DATABASE: PRODUCTION_MIGRATE_CONFIRM_VALUE,
      PRODUCTION_BACKUP_CONFIRMED: "1",
    };
    const result = assertProductionMigrationAllowed("production database migration", env);
    assert.equal(result.mode, "production");
  });

  it("allows non-production migrate on local DB", () => {
    const env = { DATABASE_URL: LOCAL_URL, APP_ENV: "local" };
    const result = assertNonProductionMigrationAllowed("database migration", env);
    assert.equal(result.mode, "non_production");
  });

  it("blocks staging migrate without APP_ENV=staging", () => {
    const env = { DATABASE_URL: STAGING_URL, APP_ENV: "local" };
    assert.throws(
      () => assertStagingMigrationAllowed("staging database migration", env),
      (e) => e && e.code === "STAGING_APP_ENV_REQUIRED",
    );
  });

  it("blocks staging migrate when DATABASE_URL is production", () => {
    const env = { DATABASE_URL: PROD_URL, APP_ENV: "staging" };
    assert.throws(
      () => assertStagingMigrationAllowed("staging database migration", env),
      (e) => e && e.code === "STAGING_DATABASE_PRODUCTION_BLOCKED",
    );
  });

  it("allows staging migrate on staging-classified DB with APP_ENV=staging", () => {
    const env = { DATABASE_URL: STAGING_URL, APP_ENV: "staging" };
    const result = assertStagingMigrationAllowed("staging database migration", env);
    assert.equal(result.mode, "staging");
    assert.equal(result.db.isProduction, false);
    assert.equal(result.db.classification, "STAGING_REMOTE");
  });
});

describe("QA seed guards", () => {
  it("blocks QA seed on production DB", () => {
    assert.throws(
      () => assertQaMutationAllowed("seed", { DATABASE_URL: PROD_URL }),
      (e) => e && e.code === "QA_PRODUCTION_DATABASE_BLOCKED",
    );
  });

  it("allows QA seed on isolated/local DB", () => {
    const db = assertQaMutationAllowed("seed", { DATABASE_URL: LOCAL_URL });
    assert.equal(db.isProduction, false);
  });
});

describe("APP_ENV resolution", () => {
  it("defaults NODE_ENV=production to APP_ENV=production", () => {
    assert.equal(resolveAppEnv({ NODE_ENV: "production" }), "production");
  });

  it("defaults development to local", () => {
    assert.equal(resolveAppEnv({ NODE_ENV: "development" }), "local");
  });

  it("honors explicit APP_ENV", () => {
    assert.equal(resolveAppEnv({ APP_ENV: "sandbox", NODE_ENV: "development" }), "sandbox");
  });
});

describe("fail-closed sandbox env loading", () => {
  it("refuses override:true on loadBackendEnv", () => {
    assert.throws(() => loadBackendEnv({ profile: "local", override: true }), (e) => {
      return e && (e.code === "ENV_OVERRIDE_FORBIDDEN" || /override:true/.test(String(e.message)));
    });
  });
});

describe("current dangerous backend/.env classification (read-only parse)", () => {
  it("flags mixed local+production+live pattern (helper only; not used to kill npm run dev)", () => {
    // Mirrors confirmed incident shape without reading secrets from disk in assertions.
    const env = {
      APP_ENV: "local",
      NODE_ENV: "development",
      CLIENT_URL: "http://localhost:5173",
      DATABASE_URL: PROD_URL,
      STRIPE_SECRET_KEY: "sk_live_x",
    };
    const result = evaluateMixedEnvironment(env);
    assert.equal(result.ok, false);
    assert.equal(result.code, "UNSAFE_MIXED_ENVIRONMENT");
    assert.ok(result.issues.length >= 2);
  });

  it("validateEnv / server startup do not call assertRuntimeEnvironmentSafe", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const envSrc = fs.readFileSync(path.join(__dirname, "..", "src", "config", "env.js"), "utf8");
    const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.equal(envSrc.includes("assertRuntimeEnvironmentSafe"), false);
    assert.equal(serverSrc.includes("assertRuntimeEnvironmentSafe"), false);
    assert.ok(serverSrc.includes('path.join(__dirname, ".env")'));
  });
});
