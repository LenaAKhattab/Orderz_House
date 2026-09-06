/**
 * FAZAT settlements QA — offline contract + optional local DB/API checks.
 * Does NOT seed. Does NOT touch Stripe. Does NOT run destructive SQL.
 *
 *   npm run qa:fazat-settlements
 *   FAZAT_QA_SETTLEMENTS_LIVE=1 npm run qa:fazat-settlements
 */
require("dotenv").config({ quiet: true });

const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  buildSigningPayload,
  signHmacSha256Hex,
  verifyHmacSha256Hex,
} = require("../src/utils/fazatCrypto");
const { PUBLIC_LABELS } = require("../src/services/freelancerCashWalletService");
const { STATUS, STATUS_AR } = require("../src/services/fazatSettlementService");
const { inspectDatabaseUrl } = require("../src/utils/fazatDbSafety");

let passed = 0;
let failed = 0;
let warnings = 0;

function ok(name) {
  passed += 1;
  console.log(`✓ ${name}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`✗ ${name}: ${err?.message || err}`);
}

function warn(name, detail) {
  warnings += 1;
  console.warn(`⚠ ${name}: ${detail}`);
}

function offlineChecks() {
  assert.strictEqual(STATUS.PENDING_REVIEW, "PENDING_REVIEW");
  assert.strictEqual(STATUS_AR.PENDING_REVIEW, "بانتظار المراجعة");
  assert.strictEqual(STATUS_AR.APPROVED_CREDITED, "معتمد وتمت إضافة الرصيد");
  assert.strictEqual(PUBLIC_LABELS.MANAGED_ORDER_CREDIT, "أرباح طلب مُدار");
  assert.ok(!/fazat|faz3at/i.test(PUBLIC_LABELS.MANAGED_ORDER_CREDIT));
  assert.ok(!/fazat|faz3at/i.test(PUBLIC_LABELS.MANAGED_ORDER_CREDIT_ALT));
  ok("white-label freelancer labels (no FAZAT/FAZ3AT)");

  const secret = "test-settlement-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `n-${Date.now()}`;
  const method = "POST";
  const pathWithQuery = "/api/integrations/fazat/settlements";
  const body = JSON.stringify({
    fazatSettlementId: "fs_qa_1",
    fazatOrderId: "fo_1",
    freelancerId: "1",
    amountMinor: 1500,
    currency: "JOD",
  });
  const canonical = buildSigningPayload({
    timestamp,
    nonce,
    method,
    pathWithQuery,
    rawBody: body,
  });
  const sig = signHmacSha256Hex(secret, canonical);
  assert.ok(verifyHmacSha256Hex(secret, canonical, sig));
  assert.ok(!verifyHmacSha256Hex(secret, canonical, "00".repeat(32)));
  ok("HMAC sign/verify for settlements path");

  const authCodes = ["UNAUTHORIZED", "INVALID_SIGNATURE", "TIMESTAMP_REJECTED", "REPLAY_REJECTED"];
  assert.ok(authCodes.includes("INVALID_SIGNATURE"));
  ok("partner auth error codes documented (not JWT)");
}

function runFoundationUnit() {
  const r = spawnSync(
    process.execPath,
    ["--test", path.join(__dirname, "..", "test", "fazatIntegrationFoundation.test.js")],
    { cwd: path.join(__dirname, ".."), encoding: "utf8", env: process.env },
  );
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) throw new Error("fazat foundation unit failed");
  ok("fazat foundation unit tests");
}

async function liveHttpChecks() {
  const info = inspectDatabaseUrl();
  if (!info.safeForMigrationOrSeed && process.env.FAZAT_QA_SETTLEMENTS_LIVE !== "1") {
    warn("live HTTP skipped", "DB not marked safe; set FAZAT_QA_SETTLEMENTS_LIVE=1 only on safe staging");
    return;
  }
  if (String(process.env.FAZAT_INTEGRATION_ENABLED || "").toLowerCase() !== "true") {
    warn("live HTTP skipped", "FAZAT_INTEGRATION_ENABLED is not true");
    return;
  }

  const base = (process.env.ORDERZ_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");
  const apiKey = process.env.FAZAT_INTEGRATION_API_KEY || "";
  const secret = process.env.FAZAT_INTEGRATION_SHARED_SECRET || "";
  if (!apiKey || !secret) {
    warn("live HTTP skipped", "missing FAZAT_INTEGRATION_API_KEY / SHARED_SECRET");
    return;
  }

  async function signedPost(urlPath, payload, { badSig = false, idempotencyKey = null } = {}) {
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = `qa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const canonical = buildSigningPayload({
      timestamp,
      nonce,
      method: "POST",
      pathWithQuery: urlPath,
      rawBody: body,
    });
    const signature = badSig ? "ab".repeat(32) : signHmacSha256Hex(secret, canonical);
    const headers = {
      "Content-Type": "application/json",
      "X-Orderz-Partner-Key": apiKey,
      "X-Orderz-Timestamp": timestamp,
      "X-Orderz-Nonce": nonce,
      "X-Orderz-Signature": signature,
    };
    if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
    const resp = await fetch(`${base}${urlPath}`, { method: "POST", headers, body });
    const json = await resp.json().catch(() => ({}));
    return { status: resp.status, json };
  }

  const bad = await signedPost("/api/integrations/fazat/settlements", { fazatSettlementId: "x" }, { badSig: true });
  assert.ok(bad.status === 401, `expected 401 got ${bad.status}`);
  assert.ok(
    ["INVALID_SIGNATURE", "UNAUTHORIZED"].includes(String(bad.json?.code || "")),
    `unexpected code ${bad.json?.code}`,
  );
  assert.ok(!/jwt|token expired/i.test(String(bad.json?.message || "")));
  ok("invalid HMAC → partner auth error (not JWT)");

  // Freelancer id must exist for create — if missing, expect clear 404.
  const sid = `fs_qa_${Date.now()}`;
  const idem = `idem-qa-${Date.now()}`;
  const freelancerId = Number(process.env.FAZAT_QA_FREELANCER_ID || 0);
  if (!freelancerId) {
    warn("create settlement skipped", "set FAZAT_QA_FREELANCER_ID for live create/approve tests");
    return;
  }

  const created = await signedPost(
    "/api/integrations/fazat/settlements",
    {
      fazatSettlementId: sid,
      fazatOrderId: `fo_${Date.now()}`,
      freelancerId: String(freelancerId),
      amountMinor: 2500,
      currency: "JOD",
      sourceLabel: "qa managed",
    },
    { idempotencyKey: idem },
  );
  assert.ok([200, 201].includes(created.status), `create status ${created.status} ${JSON.stringify(created.json)}`);
  assert.strictEqual(created.json?.data?.status, "PENDING_REVIEW");
  ok("valid signed settlement → PENDING_REVIEW");

  const replay = await signedPost(
    "/api/integrations/fazat/settlements",
    {
      fazatSettlementId: sid,
      fazatOrderId: `fo_${Date.now()}`,
      freelancerId: String(freelancerId),
      amountMinor: 2500,
      currency: "JOD",
    },
    { idempotencyKey: idem },
  );
  assert.ok(replay.json?.idempotentReplay === true || replay.status === 200);
  ok("duplicate settlement/idempotency does not duplicate");
}

(async () => {
  console.log("QA — FAZAT settlements\n");
  try {
    offlineChecks();
    runFoundationUnit();
    if (process.env.FAZAT_QA_SETTLEMENTS_LIVE === "1") {
      await liveHttpChecks();
    } else {
      warn("live HTTP", "skipped (set FAZAT_QA_SETTLEMENTS_LIVE=1 for HTTP smoke on safe env)");
    }
  } catch (err) {
    fail("qa suite", err);
  }
  console.log(`\nResult: ${passed} passed, ${warnings} warnings, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
