#!/usr/bin/env node
/**
 * Stripe Sandbox recurring-renewal QA readiness gate.
 *
 * Does NOT create Checkout, charge, or mutate Live Stripe objects.
 *
 * Usage (from backend/):
 *   npm run qa:stripe-sandbox-renewal-ready
 *   DOTENV_CONFIG_PATH=./.env.sandbox node scripts/qa/checkStripeSandboxRenewalReadiness.js
 *
 * Exit codes:
 *   0 = READY_FOR_STRIPE_SANDBOX_RENEWAL_QA
 *   2 = TEST_ENVIRONMENT_NOT_SAFE
 *   3 = TEST_DATABASE_NOT_ISOLATED
 */
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const backendRoot = path.join(__dirname, "..", "..");
const sandboxEnv = path.join(backendRoot, ".env.sandbox");
const defaultEnv = path.join(backendRoot, ".env");
const envFile = process.env.DOTENV_CONFIG_PATH
  ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
  : fs.existsSync(sandboxEnv)
    ? sandboxEnv
    : defaultEnv;

require("dotenv").config({ path: envFile });

const {
  getStripeSecretMode,
  getStripePublishableMode,
  classifyDatabaseUrl,
  BLOCKED_SHARED_DB_HOST_MARKERS,
} = require("../../src/utils/stripeModeGuard");

const FAIL = "TEST_ENVIRONMENT_NOT_SAFE";
const FAIL_DB = "TEST_DATABASE_NOT_ISOLATED";
const READY = "READY_FOR_STRIPE_SANDBOX_RENEWAL_QA";

const issues = [];
const notes = [];

function maskHost(url) {
  try {
    const u = new URL(String(url || "").replace(/^postgresql:/i, "postgres:"));
    return u.hostname || "(unparsed)";
  } catch {
    return "(unparsed)";
  }
}

function classify(name, classes) {
  console.log(`- ${name}: ${classes}`);
}

async function probeLocalhost(port = 5173) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode });
    });
    req.on("error", () => resolve({ ok: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

async function main() {
  console.log("=== Orderz House Stripe Sandbox renewal QA readiness ===\n");
  console.log(`Env file: ${envFile}`);

  const nodeEnv = String(process.env.NODE_ENV || "").trim() || "(empty)";
  const clientUrl = String(process.env.CLIENT_URL || "").trim();
  const emailMode = String(process.env.EMAIL_DELIVERY_MODE || "").trim() || "(unset)";
  const secretMode = getStripeSecretMode();
  const pubMode = getStripePublishableMode();
  const whsec = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const dbInfo = classifyDatabaseUrl(process.env.DATABASE_URL);
  const isolatedFlag = String(process.env.ORDERZ_QA_ISOLATED_DB || "").trim() === "1";

  console.log("\n## Environment classification");
  classify("NODE_ENV", nodeEnv === "production" ? "LIVE/PROD" : "LOCAL/DEV");
  classify(
    "CLIENT_URL",
    /localhost|127\.0\.0\.1/i.test(clientUrl) ? "LOCAL" : clientUrl ? "OTHER" : "MISSING",
  );
  classify(
    "STRIPE_SECRET_KEY",
    secretMode === "live" ? "LIVE" : secretMode === "test" ? "TEST" : secretMode === "missing" ? "MISSING" : "UNKNOWN",
  );
  classify(
    "VITE_STRIPE_PUBLISHABLE_KEY|STRIPE_PUBLISHABLE_KEY",
    pubMode === "live" ? "LIVE" : pubMode === "test" ? "TEST" : pubMode === "missing" ? "MISSING" : "UNKNOWN",
  );
  classify("STRIPE_WEBHOOK_SECRET", whsec ? "SET" : "MISSING");
  classify(
    `DATABASE_URL host (${maskHost(process.env.DATABASE_URL)})`,
    dbInfo.blockedShared ? "SHARED (blocked)" : dbInfo.class,
  );
  classify("ORDERZ_QA_ISOLATED_DB", isolatedFlag ? "ATTESTED" : "MISSING");
  classify("EMAIL_DELIVERY_MODE", emailMode || "MISSING");

  console.log("\n## Shared/Live DB markers");
  console.log(`Blocked host markers: ${BLOCKED_SHARED_DB_HOST_MARKERS.join(", ")}`);

  if (secretMode !== "test") issues.push("STRIPE_SECRET_KEY must be sk_test_…");
  if (pubMode !== "test") {
    issues.push("VITE_STRIPE_PUBLISHABLE_KEY or STRIPE_PUBLISHABLE_KEY must be pk_test_…");
  }
  if (!whsec) issues.push("STRIPE_WEBHOOK_SECRET missing (use Stripe CLI whsec_… for local forward)");
  if (nodeEnv === "production") issues.push("NODE_ENV=production is not allowed for Sandbox renewal QA");
  if (!/localhost:5173/i.test(clientUrl)) {
    issues.push("CLIENT_URL should be http://localhost:5173 for local Sandbox QA redirects");
  }

  if (!isolatedFlag || dbInfo.blockedShared || dbInfo.class === "MISSING") {
    console.log(`\n${FAIL_DB}`);
    if (!isolatedFlag) {
      console.log("- Set ORDERZ_QA_ISOLATED_DB=1 only after DATABASE_URL points at an isolated Neon branch/test DB.");
    }
    if (dbInfo.blockedShared) {
      console.log("- DATABASE_URL matches the shared/Live Neon host used with Live subscription recovery.");
    }
    if (dbInfo.class === "MISSING") console.log("- DATABASE_URL is missing.");
    console.log("\nDo NOT run migrations or Stripe QA against the shared/production database.");
    process.exit(3);
  }

  let planOk = false;
  try {
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const plan = await pool.query(
      `SELECT id, name, is_recurring, currency, billing_interval, billing_interval_count,
              stripe_product_id, stripe_price_id
       FROM plans
       WHERE name = 'freelancers_monthly_paid_15' AND deleted_at IS NULL
       LIMIT 1`,
    );
    const row = plan.rows[0];
    if (
      row &&
      (row.is_recurring === true || row.is_recurring === "t") &&
      String(row.billing_interval || "").toLowerCase() === "month" &&
      Number(row.billing_interval_count || 1) === 1
    ) {
      planOk = true;
      notes.push(`Recurring plan freelancers_monthly_paid_15 id=${row.id}`);
      if (row.stripe_price_id || row.stripe_product_id) {
        notes.push(
          "Plan has stored Stripe Product/Price IDs — checkout livemode guard will reject Live IDs under sk_test_; prefer NULL for lazy TEST provisioning.",
        );
      }
    } else {
      issues.push("freelancers_monthly_paid_15 recurring plan missing or not configured (is_recurring/month/1)");
    }

    const liveUser = await pool.query(
      `SELECT id FROM users WHERE id = 3706 LIMIT 1`,
    );
    if (liveUser.rows[0]) {
      issues.push(
        "Isolated DB still contains user 3706. Use a fresh Neon branch without production/shared copies.",
      );
    }
    const liveSub = await pool.query(`SELECT id FROM freelancer_subscriptions WHERE id = 2396 LIMIT 1`);
    if (liveSub.rows[0]) {
      issues.push("Isolated DB contains subscription 2396 — refuse Sandbox QA on DBs that hold Live recovery rows.");
    }
    await pool.end();
  } catch (err) {
    issues.push(`Database probe failed: ${err.message}`);
  }

  const fe = await probeLocalhost(5173);
  if (!fe.ok) issues.push("Frontend http://localhost:5173 is not reachable");
  else notes.push(`Frontend localhost:5173 reachable (HTTP ${fe.status})`);

  const webhookForward =
    String(process.env.STRIPE_CLI_FORWARD || "").trim() === "1" ||
    String(process.env.ORDERZ_QA_WEBHOOK_FORWARD_READY || "").trim() === "1";
  if (!webhookForward) {
    issues.push(
      "Webhook forwarding not attested. Run `stripe listen --forward-to localhost:5000/api/webhooks/stripe` then set STRIPE_CLI_FORWARD=1.",
    );
  } else {
    notes.push("Webhook forward attested (STRIPE_CLI_FORWARD / ORDERZ_QA_WEBHOOK_FORWARD_READY)");
  }

  notes.push("Test Clock helper: src/services/stripeTestClockQaService.js (sk_test_ only)");
  notes.push("Webhook route: POST /api/webhooks/stripe (signature verified)");

  console.log("\n## Checks");
  for (const n of notes) console.log(`OK  ${n}`);
  for (const i of issues) console.log(`NO  ${i}`);

  console.log("\n## Verdict");
  if (issues.length || !planOk) {
    console.log(FAIL);
    console.log("\nPopulate these yourself locally (do not paste secrets into chat):");
    console.log("  1) Create isolated Neon branch / local Postgres");
    console.log("  2) Copy backend/.env.sandbox.example → backend/.env.sandbox");
    console.log("  3) Set in backend/.env.sandbox:");
    console.log("       STRIPE_SECRET_KEY=sk_test_...");
    console.log("       VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...");
    console.log("       STRIPE_PUBLISHABLE_KEY=pk_test_...");
    console.log("       STRIPE_WEBHOOK_SECRET=whsec_...   (from stripe listen)");
    console.log("       DATABASE_URL=<isolated DB URL>");
    console.log("       ORDERZ_QA_ISOLATED_DB=1");
    console.log("       CLIENT_URL=http://localhost:5173");
    console.log("       NODE_ENV=development");
    console.log("  4) Optionally mirror pk_test_ into frontend/.env as VITE_STRIPE_PUBLISHABLE_KEY");
    console.log("  5) Migrate isolated DB: DATABASE_URL=... npm run db:migrate");
    console.log("  6) stripe listen --forward-to localhost:5000/api/webhooks/stripe");
    console.log("  7) STRIPE_CLI_FORWARD=1 npm run qa:stripe-sandbox-renewal-ready");
    process.exit(2);
  }

  console.log(READY);
  console.log("Do not start Checkout until you intentionally begin the renewal QA runbook.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.log(FAIL);
  process.exit(2);
});
