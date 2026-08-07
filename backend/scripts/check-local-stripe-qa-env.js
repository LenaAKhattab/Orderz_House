#!/usr/bin/env node
/**
 * Local QA guard — warns when Stripe keys look like production.
 * Does not modify .env or stop the running server.
 *
 * Usage (from backend/):
 *   node scripts/check-local-stripe-qa-env.js
 *   npm run qa:check-stripe-env
 */
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
const publishable = String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();

let hasIssue = false;

function warn(msg) {
  hasIssue = true;
  console.warn(`[QA Stripe guard] ${msg}`);
}

if (!key) {
  console.log("[QA Stripe guard] STRIPE_SECRET_KEY is not set — fixed-order checkout E2E will fail until configured.");
} else if (key.startsWith("sk_live_")) {
  warn(
    "STRIPE_SECRET_KEY looks like a LIVE key (sk_live_). Use sk_test_ for local mobile QA — never complete test payments with live keys.",
  );
} else if (key.startsWith("sk_test_")) {
  console.log("[QA Stripe guard] STRIPE_SECRET_KEY is test mode (sk_test_) — OK for local QA.");
} else {
  console.log("[QA Stripe guard] STRIPE_SECRET_KEY is set (unrecognized prefix). Verify it is test mode.");
}

if (publishable.startsWith("pk_live_")) {
  warn("STRIPE_PUBLISHABLE_KEY looks like a LIVE key (pk_live_). Use pk_test_ for local QA.");
} else if (publishable.startsWith("pk_test_")) {
  console.log("[QA Stripe guard] STRIPE_PUBLISHABLE_KEY is test mode (pk_test_) — OK for local QA.");
}

console.log("");
console.log("If checkoutUrl starts with https://checkout.stripe.com/.../cs_live_ the environment is NOT safe for QA.");
console.log("Expected for local QA: cs_test_ sessions with sk_test_ / pk_test_ keys.");

process.exit(hasIssue ? 1 : 0);
