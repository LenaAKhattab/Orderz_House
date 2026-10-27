const { pipeline } = require("node:stream/promises");
const { openFileStream } = require("../services/fileStorageService");

/** Browser-safe inline previews; everything else is served as a download. */
const INLINE_PREVIEW_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

/** Stream errors that mean the stored source itself is gone (not a transient provider failure). */
const SOURCE_MISSING_CODES = new Set(["FILE_NOT_FOUND"]);

/** RFC 5987 attr-char encoding (encodeURIComponent leaves ' ( ) * unescaped). */
function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** RFC 6266: ASCII fallback + UTF-8 original name (Arabic, spaces, parentheses, dots). */
function contentDisposition(type, name) {
  const utf8Name = String(name || "file").replace(/[\r\n"]/g, " ").trim() || "file";
  const asciiFallback = utf8Name.replace(/[^\x20-\x7E]/g, "_").replace(/[\\%]/g, "_") || "file";
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987(utf8Name)}`;
}

/**
 * Remember (or clear) that an order file's stored source is gone, so lists can show
 * «المرفق الأصلي غير متاح» instead of a broken button. Best effort: never fails the response.
 */
async function recordSourceAvailability(file, missing) {
  const id = Number(file?.id);
  if (!Number.isInteger(id) || id < 1) return;
  if (!missing && file.source_missing_at == null) return;
  try {
    const { pool } = require("../config/db");
    if (missing) {
      await pool.query(`UPDATE order_files SET source_missing_at = COALESCE(source_missing_at, NOW()) WHERE id = $1`, [id]);
    } else {
      await pool.query(`UPDATE order_files SET source_missing_at = NULL WHERE id = $1`, [id]);
    }
  } catch {
    /* availability flag is advisory */
  }
}

function sendStorageError(res, req, err, inline) {
  const status = Number(err?.statusCode) >= 400 && Number(err?.statusCode) < 600 ? Number(err.statusCode) : 502;
  // Technical diagnostics in logs only (no URLs / credentials).
  // eslint-disable-next-line no-console
  console.warn("[order-file] stream failed", {
    path: req.originalUrl ? String(req.originalUrl).split("?")[0] : null,
    status,
    code: err?.code || null,
    name: err?.name || null,
  });
  // File headers may already be set (failure before the first byte): never send JSON as the file.
  if (typeof res.removeHeader === "function") {
    for (const h of ["Content-Type", "Content-Disposition", "Content-Length", "X-Content-Type-Options"]) res.removeHeader(h);
  }
  const message =
    status === 404
      ? "الملف غير موجود."
      : inline
        ? "تعذر فتح المرفق. حاول مرة أخرى."
        : "تعذر تنزيل المرفق. حاول مرة أخرى.";
  return res.status(status).json({ success: false, message, code: err?.code || "FILE_STREAM_FAILED" });
}

/**
 * Stream an already-authorized order file (R2, legacy Cloudinary, or legacy disk) to the
 * response. Same-origin streaming: no cross-origin redirects (the old 302 → Cloudinary path
 * surfaced as "Network Error" in the browser).
 * @param {{ file: object, downloadName?: string, mimeType?: string }} out
 */
async function pipeOrderFileToResponse(req, res, next, out) {
  if (!out?.file) return next(new Error("Missing file payload."));
  const requestedInline = String(req.query.disposition || "").toLowerCase() === "inline";
  const mimeType = out.mimeType || "application/octet-stream";
  const inline = requestedInline && INLINE_PREVIEW_MIME.has(String(mimeType).toLowerCase());
  let opened;
  try {
    opened = await openFileStream(out.file);
  } catch (err) {
    if (SOURCE_MISSING_CODES.has(err?.code)) await recordSourceAvailability(out.file, true);
    return sendStorageError(res, req, err, requestedInline);
  }
  void recordSourceAvailability(out.file, false);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", contentDisposition(inline ? "inline" : "attachment", out.downloadName));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (opened.contentLength) res.setHeader("Content-Length", String(opened.contentLength));
  try {
    await pipeline(opened.stream, res);
  } catch (err) {
    if (!res.headersSent) return sendStorageError(res, req, err, requestedInline);
    res.destroy(err);
  }
  return undefined;
}

module.exports = { pipeOrderFileToResponse, contentDisposition, encodeRfc5987, INLINE_PREVIEW_MIME };
