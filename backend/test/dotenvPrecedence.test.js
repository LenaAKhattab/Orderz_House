/**
 * Dotenv precedence: process env must win over backend/.env (no override:true).
 * Mirrors server.js load behavior without starting the HTTP server.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const probeTemplate = `
const path = require("node:path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });
process.stdout.write(JSON.stringify({
  NODE_ENV: process.env.NODE_ENV ?? null,
  PORT: process.env.PORT ?? null,
  HOST: process.env.HOST ?? null,
  CLIENT_URL: process.env.CLIENT_URL ?? null,
  TRUST_PROXY: process.env.TRUST_PROXY ?? null,
}));
`;

function runProbe({ envFile, processEnv = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-dotenv-"));
  try {
    fs.writeFileSync(path.join(dir, "probe.js"), probeTemplate, "utf8");
    if (envFile !== null && envFile !== undefined) {
      fs.writeFileSync(path.join(dir, ".env"), envFile, "utf8");
    }
    const result = spawnSync(process.execPath, ["probe.js"], {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        NODE_PATH: path.join(__dirname, "..", "node_modules"),
        DOTENV_CONFIG_QUIET: "true",
        ...processEnv,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const start = result.stdout.indexOf("{");
    assert.ok(start >= 0, `expected JSON in stdout, got: ${result.stdout.slice(0, 200)}`);
    return JSON.parse(result.stdout.slice(start));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("dotenv precedence (no override)", () => {
  it("server.js must not use override:true", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.ok(src.includes("dotenv.config"));
    assert.ok(!/dotenv\.config\(\{[^}]*override:\s*true/.test(src));
  });

  it("process NODE_ENV=production wins over .env development", () => {
    const out = runProbe({
      processEnv: { NODE_ENV: "production" },
      envFile: "NODE_ENV=development\nPORT=5000\n",
    });
    assert.equal(out.NODE_ENV, "production");
  });

  it("process NODE_ENV=production wins when .env omits NODE_ENV", () => {
    const out = runProbe({
      processEnv: { NODE_ENV: "production" },
      envFile: "PORT=5000\n",
    });
    assert.equal(out.NODE_ENV, "production");
  });

  it("missing process NODE_ENV falls back to .env development", () => {
    const out = runProbe({
      processEnv: {},
      envFile: "NODE_ENV=development\n",
    });
    assert.equal(out.NODE_ENV, "development");
  });

  it("missing process and missing .env leaves NODE_ENV unset (project default = development behavior)", () => {
    const out = runProbe({
      processEnv: {},
      envFile: null,
    });
    assert.equal(out.NODE_ENV, null);
  });

  it("PORT / HOST / CLIENT_URL / TRUST_PROXY process env win over .env", () => {
    const out = runProbe({
      processEnv: {
        PORT: "8080",
        HOST: "0.0.0.0",
        CLIENT_URL: "https://orderzhouse.com",
        TRUST_PROXY: "1",
      },
      envFile: [
        "PORT=5000",
        "HOST=127.0.0.1",
        "CLIENT_URL=http://localhost:5173",
        "TRUST_PROXY=0",
      ].join("\n"),
    });
    assert.equal(out.PORT, "8080");
    assert.equal(out.HOST, "0.0.0.0");
    assert.equal(out.CLIENT_URL, "https://orderzhouse.com");
    assert.equal(out.TRUST_PROXY, "1");
  });

  it(".env fills PORT when process env omits it", () => {
    const out = runProbe({
      processEnv: {},
      envFile: "PORT=5123\n",
    });
    assert.equal(out.PORT, "5123");
  });
});
