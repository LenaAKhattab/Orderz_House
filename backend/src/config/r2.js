/**
 * Cloudflare R2 (S3-compatible) configuration for OrderzHouse private files.
 *
 * Canonical env:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_PRIVATE
 *   R2_ENDPOINT (optional; default https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com)
 *   R2_REGION   (optional; R2 uses "auto")
 * Never logs credentials.
 */

let client = null;

function readR2Config(env = process.env) {
  const accountId = String(env.R2_ACCOUNT_ID || "").trim();
  const endpoint =
    String(env.R2_ENDPOINT || "").trim() || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  return {
    accountId,
    accessKeyId: String(env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.R2_SECRET_ACCESS_KEY || "").trim(),
    privateBucket: String(env.R2_BUCKET_PRIVATE || "").trim(),
    endpoint,
    region: String(env.R2_REGION || "").trim() || "auto",
  };
}

function isR2Configured(env = process.env) {
  const c = readR2Config(env);
  return Boolean(c.endpoint && c.accessKeyId && c.secretAccessKey && c.privateBucket);
}

/** Names of missing variables (no values) — used by startup validation. */
function missingR2Variables(env = process.env) {
  const c = readR2Config(env);
  const missing = [];
  if (!c.accountId && !String(env.R2_ENDPOINT || "").trim()) missing.push("R2_ACCOUNT_ID (or R2_ENDPOINT)");
  if (!c.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!c.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!c.privateBucket) missing.push("R2_BUCKET_PRIVATE");
  return missing;
}

const PRODUCTION_PRIVATE_BUCKET = "orderzhouse-private-prod";
const STAGING_PRIVATE_BUCKET = "orderzhouse-private-staging";

function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Startup storage check (names only, never values).
 * - errors: production using a non-production bucket, or non-production using the production
 *   bucket; REQUIRE_R2_STORAGE=1 with R2 incomplete.
 * - warnings: production without R2 (new uploads fall back to legacy Cloudinary).
 * @param {"local"|"test"|"sandbox"|"staging"|"production"} appEnv
 */
function evaluateStorageEnvironment(appEnv, env = process.env) {
  const errors = [];
  const warnings = [];
  const c = readR2Config(env);
  const configured = isR2Configured(env);
  const missing = missingR2Variables(env);

  if (c.privateBucket) {
    if (appEnv === "production" && c.privateBucket !== PRODUCTION_PRIVATE_BUCKET) {
      errors.push(`APP_ENV=production must use R2_BUCKET_PRIVATE=${PRODUCTION_PRIVATE_BUCKET}.`);
    }
    if (appEnv !== "production" && c.privateBucket === PRODUCTION_PRIVATE_BUCKET) {
      errors.push(`APP_ENV=${appEnv} must not use the production bucket (${PRODUCTION_PRIVATE_BUCKET}).`);
    }
  }
  if (truthy(env.REQUIRE_R2_STORAGE) && !configured) {
    errors.push(`REQUIRE_R2_STORAGE=1 but R2 is incomplete: ${missing.join(", ")}.`);
  }
  if (!configured && missing.length < 4) {
    warnings.push(`R2 partially configured; missing: ${missing.join(", ")}. Private uploads use legacy Cloudinary.`);
  } else if (!configured && appEnv === "production") {
    warnings.push("R2 not configured; private uploads use legacy Cloudinary.");
  }
  return { ok: errors.length === 0, errors, warnings, configured, bucket: c.privateBucket || null };
}

function getR2Client() {
  if (!isR2Configured()) {
    const err = new Error("Cloudflare R2 storage is not configured.");
    err.statusCode = 503;
    err.code = "R2_NOT_CONFIGURED";
    throw err;
  }
  if (!client) {
    const { S3Client } = require("@aws-sdk/client-s3");
    const c = readR2Config();
    client = new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      // R2 does not support CRC32 trailing checksums on every path; keep payloads plain.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

/** Test helper. */
function setR2ClientForTests(fake) {
  client = fake;
}

module.exports = {
  readR2Config,
  isR2Configured,
  missingR2Variables,
  evaluateStorageEnvironment,
  PRODUCTION_PRIVATE_BUCKET,
  STAGING_PRIVATE_BUCKET,
  getR2Client,
  setR2ClientForTests,
};
