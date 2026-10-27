/**
 * Canonical private file storage for OrderzHouse.
 *
 * - New private uploads → Cloudflare R2 (when configured); identity = provider + bucket + key.
 * - Reads are dual: R2, legacy Cloudinary, legacy local disk — always streamed through the
 *   backend after the caller has authorized access (no redirects, no stored expiring URLs).
 * - Object keys never contain names, emails, phones or IDs of people; the original filename
 *   lives only in the DB and in Content-Disposition.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { getR2Client, isR2Configured, readR2Config } = require("../config/r2");

const PROVIDERS = Object.freeze({ R2: "r2", CLOUDINARY: "cloudinary", LOCAL: "local" });
const UPLOADS_ROOT = path.resolve(path.join(__dirname, "..", "..", "uploads"));
const LEGACY_FETCH_TIMEOUT_MS = 60000;

function storageError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.exposeToClient = true;
  return err;
}

/** Lower-case extension only when it is a plain short token (".pdf", ".docx"); never the name. */
function safeExtension(originalname) {
  const ext = path.extname(String(originalname || "")).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

function safeSegment(value, fallback) {
  const s = String(value == null ? "" : value).trim();
  return /^[a-z0-9_-]{1,64}$/i.test(s) ? s : fallback;
}

/**
 * Deterministic prefix + random object name.
 * e.g. orders/123/delivery/2026/10/<uuid>.pdf
 */
function buildPrivateObjectKey({ scope, scopeId, purpose = "file", originalname, now = new Date() }) {
  const d = now instanceof Date ? now : new Date(now);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return [
    safeSegment(scope, "files"),
    safeSegment(scopeId, "unscoped"),
    safeSegment(purpose, "file"),
    yyyy,
    mm,
    `${crypto.randomUUID()}${safeExtension(originalname)}`,
  ].join("/");
}

/**
 * Deterministic key for a migrated legacy row, so an interrupted run that re-uploads the same
 * row overwrites one object instead of orphaning copies. Contains only scope/row ids.
 * e.g. orders/123/brief/legacy/of-456.pdf
 */
function buildLegacyMigrationKey({ scope, scopeId, purpose = "file", sourceTag, sourceId, originalname }) {
  return [
    safeSegment(scope, "files"),
    safeSegment(scopeId, "unscoped"),
    safeSegment(purpose, "file"),
    "legacy",
    `${safeSegment(sourceTag, "row")}-${safeSegment(sourceId, "0")}${safeExtension(originalname)}`,
  ].join("/");
}

/** Private uploads go to R2 whenever it is configured. */
function isPrivateR2WriteEnabled() {
  return isR2Configured();
}

async function uploadPrivateFile({ buffer, mimetype, key }) {
  if (!Buffer.isBuffer(buffer)) throw storageError("Invalid upload payload.", 400, "INVALID_UPLOAD");
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const bucket = readR2Config().privateBucket;
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: mimetype || "application/octet-stream",
      Metadata: { sha256 },
    }),
  );
  return { provider: PROVIDERS.R2, bucket, key, size: buffer.length, sha256 };
}

async function headPrivateFile({ bucket, key }) {
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    const out = await getR2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      exists: true,
      size: Number(out.ContentLength || 0),
      contentType: out.ContentType || null,
      sha256: out.Metadata?.sha256 || null,
    };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
      return { exists: false };
    }
    throw err;
  }
}

async function deletePrivateFile({ bucket, key }) {
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Infer provider for legacy rows that predate migration 208's classification. */
function resolveProvider(row) {
  const p = String(row?.storage_provider || row?.storageProvider || "").trim().toLowerCase();
  if (p === PROVIDERS.R2 || p === PROVIDERS.CLOUDINARY || p === PROVIDERS.LOCAL) return p;
  const remote = String(row?.secure_url || row?.file_url || "").trim();
  return /^https?:\/\//i.test(remote) ? PROVIDERS.CLOUDINARY : PROVIDERS.LOCAL;
}

/** Parse resource_type / delivery type / format from a Cloudinary delivery URL. */
function parseCloudinaryUrl(url) {
  const m = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(upload|authenticated|private)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)$/i.exec(
    String(url || ""),
  );
  if (!m) return null;
  const [, resourceType, deliveryType, rest] = m;
  const decoded = decodeURIComponent(rest);
  if (resourceType === "raw") return { resourceType, deliveryType, publicId: decoded, format: "" };
  const dot = decoded.lastIndexOf(".");
  return dot > 0
    ? { resourceType, deliveryType, publicId: decoded.slice(0, dot), format: decoded.slice(dot + 1) }
    : { resourceType, deliveryType, publicId: decoded, format: "" };
}

async function fetchOk(url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(LEGACY_FETCH_TIMEOUT_MS) });
  if (!res.ok || !res.body) {
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status };
  }
  return { ok: true, res };
}

/**
 * Legacy Cloudinary read. Delivery URL first; if the account blocks delivery (PDF/ZIP
 * restriction → 401/403/404), fall back to the signed Admin-API download (never exposed).
 */
async function openCloudinaryStream(row) {
  const deliveryUrl = String(row?.secure_url || row?.file_url || "").trim();
  if (/^https?:\/\//i.test(deliveryUrl)) {
    const direct = await fetchOk(deliveryUrl);
    if (direct.ok) return toStreamResult(direct.res);
  }
  const parsed = parseCloudinaryUrl(deliveryUrl);
  const publicId = parsed?.publicId || String(row?.public_id || "").trim();
  if (!publicId) throw storageError("تعذر الوصول إلى الملف.", 502, "LEGACY_FILE_UNAVAILABLE");
  const { getCloudinary, isCloudinaryConfigured } = require("../config/cloudinary");
  if (!isCloudinaryConfigured()) throw storageError("تعذر الوصول إلى الملف.", 502, "LEGACY_FILE_UNAVAILABLE");
  const cloudinary = getCloudinary();
  const signedUrl = cloudinary.utils.private_download_url(publicId, parsed?.format || "", {
    resource_type: parsed?.resourceType || "image",
    type: parsed?.deliveryType || "upload",
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const viaApi = await fetchOk(signedUrl);
  if (viaApi.ok) return toStreamResult(viaApi.res);
  throw storageError(
    "تعذر الوصول إلى الملف.",
    viaApi.status === 404 ? 404 : 502,
    viaApi.status === 404 ? "FILE_NOT_FOUND" : "LEGACY_FILE_UNAVAILABLE",
  );
}

function toStreamResult(res) {
  const len = Number(res.headers.get("content-length"));
  return {
    stream: Readable.fromWeb(res.body),
    contentLength: Number.isFinite(len) && len > 0 ? len : null,
    contentType: res.headers.get("content-type") || null,
  };
}

async function openR2Stream(row) {
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const bucket = row.storage_bucket || row.storageBucket;
  const key = row.storage_key || row.storageKey;
  if (!bucket || !key) throw storageError("الملف غير موجود.", 404, "FILE_NOT_FOUND");
  // Outside the try: "R2 not configured" (503) is a server configuration state, not a provider failure.
  const client = getR2Client();
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return {
      stream: out.Body,
      contentLength: out.ContentLength != null ? Number(out.ContentLength) : null,
      contentType: out.ContentType || null,
    };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") {
      throw storageError("الملف غير موجود.", 404, "FILE_NOT_FOUND");
    }
    throw storageError("تعذر الوصول إلى الملف.", 502, "STORAGE_UNAVAILABLE");
  }
}

function resolveLocalPath(row) {
  const rel = String(row?.file_path || "").replace(/\\/g, "/").trim();
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
    throw storageError("مسار الملف غير صالح.", 400, "INVALID_FILE_PATH");
  }
  const absPath = path.resolve(UPLOADS_ROOT, rel);
  const relToRoot = path.relative(UPLOADS_ROOT, absPath);
  if (!relToRoot || relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    throw storageError("مسار الملف غير صالح.", 400, "INVALID_FILE_PATH");
  }
  return absPath;
}

async function openLocalStream(row) {
  const absPath = resolveLocalPath(row);
  try {
    const st = await fs.promises.stat(absPath);
    return { stream: fs.createReadStream(absPath), contentLength: st.size, contentType: null };
  } catch {
    throw storageError("الملف غير موجود على الخادم.", 404, "FILE_NOT_FOUND");
  }
}

/**
 * Open a readable stream for an already-authorized file row (order_files / stored order files).
 * @returns {Promise<{ stream: import("stream").Readable, contentLength: number|null, contentType: string|null, provider: string }>}
 */
async function openFileStream(row) {
  if (!row || typeof row !== "object") throw storageError("الملف غير موجود.", 404, "FILE_NOT_FOUND");
  const provider = resolveProvider(row);
  let out;
  if (provider === PROVIDERS.R2) out = await openR2Stream(row);
  else if (provider === PROVIDERS.CLOUDINARY) out = await openCloudinaryStream(row);
  else out = await openLocalStream(row);
  return { ...out, provider };
}

module.exports = {
  PROVIDERS,
  UPLOADS_ROOT,
  safeExtension,
  buildPrivateObjectKey,
  buildLegacyMigrationKey,
  isPrivateR2WriteEnabled,
  uploadPrivateFile,
  headPrivateFile,
  deletePrivateFile,
  resolveProvider,
  parseCloudinaryUrl,
  openFileStream,
};
