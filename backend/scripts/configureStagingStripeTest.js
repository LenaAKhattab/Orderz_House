#!/usr/bin/env node
/**
 * Interactive wizard: store Stripe TEST-mode credentials for local Staging QA.
 *
 *   node scripts/configureStagingStripeTest.js            # prompt (hidden input) and save
 *   node scripts/configureStagingStripeTest.js --status   # names/modes only, no prompt
 *   node scripts/configureStagingStripeTest.js --from-stripe-cli
 *       # no typing: test key from the Stripe CLI login + `stripe listen --print-secret`
 *       # (that secret only verifies events forwarded by `stripe listen`)
 *
 * Safety:
 * - Writes ONLY backend/.env.staging (git-ignored). Never touches backend/.env,
 *   Production files or the VPS.
 * - Refuses unless .env.staging is APP_ENV=staging on a non-Production database.
 * - Accepts only sk_test_ secret keys; confirms livemode=false with Stripe before saving.
 * - Secrets are typed with echo disabled (TTY only — never pass them as arguments).
 * - Values are never printed; a backup of the previous file goes to
 *   %USERPROFILE%/.orderzhouse-env-backups/ (outside the repository).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  stagingEnvPath,
  resolveBackendRoot,
} = require("../src/config/stagingQaEnv");
const { getStripeMode } = require("../src/utils/databaseEnvironmentSafety");

const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

function fail(message) {
  console.error(`\n[stripe-test-wizard] ${message}`);
  process.exit(1);
}

function mask(value) {
  const v = String(value || "");
  if (!v) return "<missing>";
  const prefix = v.split("_").slice(0, 2).join("_");
  return `${prefix}_… (${v.length} chars)`;
}

function readStagingEnv(root) {
  const env = {};
  loadStagingQaEnv({ root, env, fillFromDefaultEnv: false });
  return env;
}

function status(root) {
  const env = readStagingEnv(root);
  const target = assertStagingQaTarget(env);
  console.log(`Staging DB target : ${target.maskedTarget}`);
  console.log(`Stripe mode       : ${getStripeMode(env)}`);
  for (const k of KEYS) console.log(`${k.padEnd(22)}: ${mask(env[k])}`);
}

function promptHidden(label) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(`${label}: `);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          fail("Cancelled — nothing was written.");
        } else if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        } else if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}

function readFromStripeCli() {
  const { execFileSync } = require("child_process");
  const run = (args) =>
    execFileSync("stripe", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", timeout: 60000 });
  let config;
  try {
    config = run(["config", "--list"]);
  } catch {
    fail("Stripe CLI not available or not logged in. Run `stripe login` first. Nothing was written.");
  }
  const keyMatch = config.match(/^test_mode_api_key\s*=\s*['"]?([A-Za-z0-9_]+)['"]?\s*$/m);
  const expMatch = config.match(/^test_mode_key_expires_at\s*=\s*['"]?([0-9-]+)['"]?\s*$/m);
  if (!keyMatch) fail("Stripe CLI has no test_mode_api_key. Run `stripe login`. Nothing was written.");
  if (expMatch && Date.parse(expMatch[1]) < Date.now()) {
    fail(`Stripe CLI test key expired on ${expMatch[1]}. Run \`stripe login\` again. Nothing was written.`);
  }
  let webhookSecret = "";
  try {
    webhookSecret = run(["listen", "--print-secret"]).trim();
  } catch {
    fail("`stripe listen --print-secret` failed. Nothing was written.");
  }
  return { secretKey: keyMatch[1], webhookSecret };
}

async function confirmTestModeWithStripe(secretKey) {
  const Stripe = require("stripe");
  const stripe = new Stripe(secretKey);
  let balance;
  try {
    balance = await stripe.balance.retrieve();
  } catch (err) {
    fail(`Stripe rejected the key (${err && err.type ? err.type : "error"}). Nothing was written.`);
  }
  if (!balance || balance.livemode !== false) {
    fail("Stripe reports this key is NOT test mode. Nothing was written.");
  }
}

function upsertEnvLines(text, values) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && Object.prototype.hasOwnProperty.call(values, m[1])) {
      seen.add(m[1]);
      return `${m[1]}=${values[m[1]]}`;
    }
    return line;
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  const missing = Object.keys(values).filter((k) => !seen.has(k));
  if (missing.length) {
    out.push("", "# Stripe TEST mode — local Staging QA only (configureStagingStripeTest.js)");
    for (const k of missing) out.push(`${k}=${values[k]}`);
  }
  return out.join(eol) + eol;
}

async function main() {
  const root = resolveBackendRoot();
  const filePath = stagingEnvPath(root);

  if (process.argv.includes("--status")) {
    status(root);
    return;
  }
  if (process.argv.slice(2).some((a) => /^(sk|rk|pk)_|^whsec_/.test(a))) {
    fail("Never pass secrets as command-line arguments (shell history). Run without arguments.");
  }
  const fromCli = process.argv.includes("--from-stripe-cli");
  if (!fromCli && (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function")) {
    fail("Run this in an interactive terminal (PowerShell / Windows Terminal) so input stays hidden.");
  }

  const env = readStagingEnv(root);
  const target = assertStagingQaTarget(env);
  console.log("OrderzHouse — Stripe TEST credentials for local Staging QA");
  console.log(`Target file : ${filePath}`);
  console.log(`Staging DB  : ${target.maskedTarget}`);

  let secretKey;
  let webhookSecret;
  if (fromCli) {
    // Uses the Stripe CLI's own `stripe login` session: its test-mode key and the
    // `stripe listen` signing secret (correct for CLI-forwarded webhook delivery only).
    console.log("Source      : Stripe CLI login (test mode) + `stripe listen --print-secret`\n");
    ({ secretKey, webhookSecret } = readFromStripeCli());
  } else {
    console.log("Input is hidden. Use keys from the Stripe Dashboard in TEST mode only.\n");
    secretKey = await promptHidden("STRIPE_SECRET_KEY (sk_test_…)");
    webhookSecret = await promptHidden("STRIPE_WEBHOOK_SECRET (whsec_… from `stripe listen` or a TEST-mode endpoint)");
  }
  if (/^(sk|rk)_live_/.test(secretKey)) fail("LIVE key refused. Nothing was written.");
  if (!/^sk_test_[A-Za-z0-9]{10,}$/.test(secretKey)) fail("Expected a key starting with sk_test_. Nothing was written.");
  if (!/^whsec_[A-Za-z0-9]{10,}$/.test(webhookSecret)) fail("Expected a value starting with whsec_. Nothing was written.");

  await confirmTestModeWithStripe(secretKey);

  const original = fs.readFileSync(filePath, "utf8");
  const backupDir = path.join(os.homedir(), ".orderzhouse-env-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `.env.staging.${stamp}`);
  fs.writeFileSync(backupPath, original, { mode: 0o600 });

  const updated = upsertEnvLines(original, {
    STRIPE_SECRET_KEY: secretKey,
    STRIPE_WEBHOOK_SECRET: webhookSecret,
  });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, updated, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);

  console.log(`\nSaved (test mode confirmed by Stripe). Previous file backed up to ${backupPath}`);
  status(root);
}

if (require.main === module) {
  main().catch((err) => fail(err && err.code ? `${err.code}: ${err.message}` : String(err)));
}

module.exports = { upsertEnvLines, mask };
