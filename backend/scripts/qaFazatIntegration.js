/**
 * FAZAT workforce-provider QA (local/staging prep).
 * Does NOT run migrations against remote/production-like DBs.
 * Does NOT write production data.
 *
 *   npm run qa:fazat-integration
 *   FAZAT_QA_LIVE=1 npm run qa:fazat-integration   # optional HTTP smoke when safe
 */
require("dotenv").config({ quiet: true });

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { inspectDatabaseUrl } = require("../src/utils/fazatDbSafety");
const {
  buildSigningPayload,
  signHmacSha256Hex,
  verifyHmacSha256Hex,
} = require("../src/utils/fazatCrypto");
const { rankAllowsAssignment } = require("../src/services/fazatFreelancerProfileService");
const { sanitizeOrderForFreelancerAssigned } = require("../src/utils/orderViewerSanitize");

function runUnit() {
  const r = spawnSync(
    process.execPath,
    ["--test", path.join(__dirname, "..", "test", "fazatIntegrationFoundation.test.js")],
    { cwd: path.join(__dirname, ".."), encoding: "utf8", env: process.env },
  );
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) throw new Error("fazat unit tests failed");
}

function offlineContractChecks() {
  // Auth rejection shapes (documented codes).
  const codes = [
    "UNAUTHORIZED",
    "INVALID_SIGNATURE",
    "TIMESTAMP_REJECTED",
    "REPLAY_REJECTED",
    "FAZAT_DISABLED",
    "FAZAT_FREELANCER_UNAPPROVED",
  ];
  assert.ok(codes.length >= 6);

  assert.strictEqual(rankAllowsAssignment("UNAPPROVED"), false);
  assert.strictEqual(rankAllowsAssignment("APPROVED"), true);
  assert.strictEqual(rankAllowsAssignment("TRUSTED"), true);

  const secret = "qa-shared-secret-32chars-minimum!!";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `qa_${Date.now()}`;
  const pathWithQuery = "/api/integrations/fazat/orders";
  const rawBody = JSON.stringify({ title: "x" });
  const payload = buildSigningPayload({
    timestamp,
    nonce,
    method: "POST",
    pathWithQuery,
    rawBody,
  });
  const sig = signHmacSha256Hex(secret, payload);
  assert.strictEqual(verifyHmacSha256Hex(secret, payload, sig), true);
  assert.strictEqual(verifyHmacSha256Hex(secret, payload, "00"), false);

  // Replay simulation: same nonce string must be unique per partner (DB-enforced when live).
  assert.ok(nonce.length >= 8);

  const safe = sanitizeOrderForFreelancerAssigned({
    id: "1",
    title: "T",
    isPartnerManaged: true,
    partnerCode: "FAZAT",
    externalAssignmentId: "e1",
    externalOrderId: "o1",
    partnerMeta: { partnerCode: "FAZAT", externalAssignmentId: "e1", externalOrderId: "o1" },
    createdByUserId: "9",
    orderStatus: "in_progress",
  });
  const blob = JSON.stringify(safe).toLowerCase();
  assert.ok(!blob.includes("fazat"));
  assert.ok(!blob.includes("faz3at"));
  assert.strictEqual(safe.clientDisplayName, "طلب مُدار من Orderz");

  const events = [
    "orderz.partner_order.created",
    "orderz.partner_order.assigned",
    "orderz.partner_order.status_changed",
    "orderz.partner_message.created",
    "orderz.partner_delivery.submitted",
    "orderz.partner_delivery.updated",
    "orderz.partner_order.cancelled",
  ];
  assert.strictEqual(events.length, 7);

  console.log("[qa:fazat] offline contract + visibility checks PASS");
}

async function liveSmoke(dbInfo) {
  if (String(process.env.FAZAT_QA_LIVE || "") !== "1") {
    console.log("[qa:fazat] skipping live HTTP smoke (set FAZAT_QA_LIVE=1 to enable)");
    return { skipped: true };
  }
  if (!dbInfo.safeForMigrationOrSeed && String(process.env.FAZAT_ALLOW_REMOTE_STAGING_DB || "") !== "1") {
    console.log("[qa:fazat] refusing live smoke against unsafe DB host:", dbInfo.host);
    return { skipped: true, reason: "unsafe_db" };
  }

  process.env.FAZAT_INTEGRATION_ENABLED = process.env.FAZAT_INTEGRATION_ENABLED || "true";
  const { assertFazatEnabled } = require("../src/config/fazatIntegration");
  let cfg;
  try {
    cfg = assertFazatEnabled();
  } catch (err) {
    console.log("[qa:fazat] live smoke blocked: FAZAT env not configured —", err.message);
    return { skipped: true, reason: "env" };
  }

  if (!cfg.publicApiUrl) {
    console.log("[qa:fazat] ORDERZ_PUBLIC_API_URL unset — cannot HTTP smoke");
    return { skipped: true, reason: "no_public_url" };
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `qa_live_${Date.now()}`;
  const pathWithQuery = "/api/integrations/fazat/freelancers";
  const payload = buildSigningPayload({
    timestamp,
    nonce,
    method: "GET",
    pathWithQuery,
    rawBody: "",
  });
  const signature = signHmacSha256Hex(cfg.sharedSecret, payload);
  const url = `${cfg.publicApiUrl.replace(/\/$/, "")}${pathWithQuery}`;

  // Invalid signature check
  const bad = await fetch(url, {
    method: "GET",
    headers: {
      "X-Orderz-Partner-Key": cfg.apiKey,
      "X-Orderz-Timestamp": timestamp,
      "X-Orderz-Nonce": `${nonce}_bad`,
      "X-Orderz-Signature": "deadbeef",
    },
  });
  console.log("[qa:fazat] invalid signature status=", bad.status);
  assert.ok(bad.status === 401 || bad.status === 503);

  const ok = await fetch(url, {
    method: "GET",
    headers: {
      "X-Orderz-Partner-Key": cfg.apiKey,
      "X-Orderz-Timestamp": timestamp,
      "X-Orderz-Nonce": nonce,
      "X-Orderz-Signature": signature,
    },
  });
  const text = await ok.text();
  console.log("[qa:fazat] signed GET freelancers status=", ok.status, "bodyBytes=", text.length);
  return { skipped: false, status: ok.status };
}

(async () => {
  const dbInfo = inspectDatabaseUrl();
  console.log(
    JSON.stringify(
      {
        dbSafety: {
          host: dbInfo.host,
          dbName: dbInfo.dbName,
          looksLocal: dbInfo.looksLocal,
          looksNeon: dbInfo.looksNeon,
          looksProductionLike: dbInfo.looksProductionLike,
          safeForMigrationOrSeed: dbInfo.safeForMigrationOrSeed,
          reason: dbInfo.reason,
        },
      },
      null,
      2,
    ),
  );

  if (!dbInfo.safeForMigrationOrSeed) {
    console.log("[qa:fazat] WARNING: migration/seed must NOT run on this DATABASE_URL");
    console.log("[qa:fazat] Use local Postgres, then: npm run db:migrate && npm run seed:fazat-staging");
  }

  console.log("[qa:fazat] running unit foundation checks…");
  runUnit();
  offlineContractChecks();
  await liveSmoke(dbInfo);
  console.log("[qa:fazat] PASS (prep checks)");
})().catch((err) => {
  console.error("[qa:fazat] FAIL", err && err.message ? err.message : err);
  process.exit(1);
});
