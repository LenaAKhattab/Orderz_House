#!/usr/bin/env node
/**
 * Seed an isolated Sandbox QA freelancer: stripe-renewal-qa@local.test
 *
 * Refuses to run unless Stripe Sandbox QA gates pass (sk_test_ + isolated DB).
 * Does NOT create Checkout or Stripe subscriptions.
 *
 * Usage (from backend/, with .env.sandbox loaded):
 *   ALLOW_QA_SEED=true node scripts/qa/seedStripeRenewalQaFreelancer.js
 */
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const sandboxEnv = path.join(__dirname, "..", "..", ".env.sandbox");
require("dotenv").config({
  path: process.env.DOTENV_CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
    : fs.existsSync(sandboxEnv)
      ? sandboxEnv
      : path.join(__dirname, "..", "..", ".env"),
});

if (String(process.env.ALLOW_QA_SEED || "").trim() !== "true") {
  console.error("Refusing: set ALLOW_QA_SEED=true");
  process.exit(1);
}

const bcrypt = require("bcrypt");
const { pool } = require("../../src/config/db");
const { ensureUserRole } = require("../../src/services/rbacService");
const {
  assertStripeSandboxQaAllowed,
  assertDatabaseIsolatedForSandboxQa,
} = require("../../src/utils/stripeModeGuard");
const { QA_EMAIL } = require("../../src/services/stripeTestClockQaService");

async function main() {
  assertDatabaseIsolatedForSandboxQa();
  assertStripeSandboxQaAllowed({ requirePublishable: false });

  const email = String(process.env.ORDERZ_QA_FREELANCER_EMAIL || QA_EMAIL).trim().toLowerCase();
  if (email === "lenakattab@gmail.com" || email.includes("3706")) {
    throw new Error("Refusing Live identity email.");
  }

  const password = process.env.ORDERZ_QA_FREELANCER_PASSWORD || "SandboxRenewalQa!234";
  const hash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT id, email, role FROM users WHERE lower(email) = $1 LIMIT 1`, [
      email,
    ]);
    let userId;
    if (existing.rows[0]) {
      userId = Number(existing.rows[0].id);
      console.log("QA user already exists id=", userId, "email=", email);
      // Ensure no Live Stripe customer id leaked into sandbox user
      const cus = await client.query(`SELECT stripe_customer_id FROM users WHERE id = $1`, [userId]);
      const cid = cus.rows[0]?.stripe_customer_id;
      if (cid && String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_")) {
        // leave; mode guard at checkout will validate livemode
      }
    } else {
      const accountId = `QA${crypto.randomBytes(4).toString("hex")}`.slice(0, 12);
      const ins = await client.query(
        `INSERT INTO users (
           email, password_hash, role, first_name, family_name, account_id,
           is_active, email_verified_at, created_at, updated_at
         ) VALUES (
           $1, $2, 'freelancer', 'Stripe', 'RenewalQA', $3,
           TRUE, NOW(), NOW(), NOW()
         )
         RETURNING id`,
        [email, hash, accountId],
      );
      userId = Number(ins.rows[0].id);
      await ensureUserRole(userId, "freelancer", client);
      console.log("Created QA freelancer id=", userId, "email=", email);
    }

    // Ensure monthly plan exists without Live Stripe IDs
    const plan = await client.query(
      `SELECT id, stripe_product_id, stripe_price_id, is_recurring, billing_interval, billing_interval_count
       FROM plans WHERE name = 'freelancers_monthly_paid_15' AND deleted_at IS NULL LIMIT 1`,
    );
    if (!plan.rows[0]) {
      throw new Error(
        "freelancers_monthly_paid_15 missing — run migrations on the isolated DB (npm run db:migrate) first.",
      );
    }
    const p = plan.rows[0];
    if (!(p.is_recurring === true || p.is_recurring === "t") || String(p.billing_interval) !== "month") {
      throw new Error("freelancers_monthly_paid_15 is not configured as monthly recurring.");
    }
    // Clear any accidentally copied Live product/price ids in isolated DB
    if (p.stripe_product_id || p.stripe_price_id) {
      await client.query(
        `UPDATE plans
         SET stripe_product_id = NULL,
             stripe_price_id = NULL,
             stripe_price_amount_minor = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [p.id],
      );
      console.log("Cleared stored Stripe Product/Price IDs on plan", p.id, "(lazy TEST provisioning)");
    }

    await client.query("COMMIT");
    console.log("Password (local only):", password);
    console.log("Next: attach Test Clock customer via stripeTestClockQaService, then use normal Checkout.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
