/**
 * Env loader behavior for normal dev vs sandbox isolation.
 * Run: node --test test/loadBackendEnv.test.js
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const loaderPath = require.resolve("../src/config/loadBackendEnv");

const prev = { ...process.env };

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in prev)) delete process.env[k];
  }
  Object.assign(process.env, prev);
  delete require.cache[loaderPath];
});

function withTempBackendRoot(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oh-loadenv-"));
  const api = require(loaderPath);
  const originalResolve = api.resolveBackendRoot;
  require.cache[loaderPath].exports.resolveBackendRoot = () => tmp;
  try {
    return fn(tmp, require(loaderPath));
  } finally {
    require.cache[loaderPath].exports.resolveBackendRoot = originalResolve;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe("resolveLoadProfile", () => {
  it("maps workstation to default (.env), not mandatory .env.local", () => {
    const { resolveLoadProfile } = require("../src/config/loadBackendEnv");
    assert.equal(resolveLoadProfile({ NODE_ENV: "development" }), "default");
    assert.equal(resolveLoadProfile({}), "default");
    assert.equal(resolveLoadProfile({}, "local"), "default");
  });

  it("uses production / sandbox / test when indicated", () => {
    const { resolveLoadProfile } = require("../src/config/loadBackendEnv");
    assert.equal(resolveLoadProfile({ NODE_ENV: "production" }), "production");
    assert.equal(resolveLoadProfile({ APP_ENV: "sandbox" }), "sandbox");
    assert.equal(resolveLoadProfile({ APP_ENV: "test" }), "test");
  });
});

describe("loadBackendEnv normal development", () => {
  it("loads backend/.env without requiring .env.local", () => {
    withTempBackendRoot((tmp, api) => {
      fs.writeFileSync(
        path.join(tmp, ".env"),
        [
          "NODE_ENV=development",
          "CLIENT_URL=http://localhost:5173",
          "DATABASE_URL=postgresql://u:p@ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech/neondb",
          "STRIPE_SECRET_KEY=sk_live_x",
          "JWT_SECRET=dev_jwt_secret_16chars",
        ].join("\n"),
        "utf8",
      );
      delete process.env.DATABASE_URL;
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.JWT_SECRET;
      delete process.env.CLIENT_URL;
      process.env.NODE_ENV = "development";

      const result = api.loadBackendEnv({ profile: "auto", failClosed: true, quiet: true });
      assert.equal(result.profile, "default");
      assert.deepEqual(result.loaded, [".env"]);
      assert.ok(String(process.env.DATABASE_URL || "").includes("wandering-cherry"));
      assert.equal(process.env.STRIPE_SECRET_KEY, "sk_live_x");
      assert.equal(fs.existsSync(path.join(tmp, ".env.local")), false);
    });
  });

  it("process env overrides backend/.env", () => {
    withTempBackendRoot((tmp, api) => {
      fs.writeFileSync(path.join(tmp, ".env"), "NODE_ENV=development\nCLIENT_URL=http://localhost:5173\n", "utf8");
      process.env.NODE_ENV = "production";
      process.env.CLIENT_URL = "https://orderzhouse.com";
      api.loadBackendEnv({ profile: "production", failClosed: true, quiet: true });
      assert.equal(process.env.NODE_ENV, "production");
      assert.equal(process.env.CLIENT_URL, "https://orderzhouse.com");
    });
  });

  it("refuses override:true", () => {
    const { loadBackendEnv } = require("../src/config/loadBackendEnv");
    assert.throws(
      () => loadBackendEnv({ profile: "default", override: true }),
      (e) => e && e.code === "ENV_OVERRIDE_FORBIDDEN",
    );
  });
});

describe("sandbox fail-closed", () => {
  it("missing .env.sandbox does not fall back to .env", () => {
    withTempBackendRoot((tmp, api) => {
      fs.writeFileSync(
        path.join(tmp, ".env"),
        "DATABASE_URL=postgresql://u:p@ep-wandering-cherry/neondb\nSTRIPE_SECRET_KEY=sk_live_x\n",
        "utf8",
      );
      delete process.env.DATABASE_URL;
      delete process.env.STRIPE_SECRET_KEY;
      assert.throws(
        () => api.loadBackendEnv({ profile: "sandbox", failClosed: true, quiet: true }),
        (e) => e && e.code === "SANDBOX_ENV_NOT_LOADED",
      );
      assert.equal(process.env.DATABASE_URL, undefined);
      assert.equal(process.env.STRIPE_SECRET_KEY, undefined);
    });
  });
});
