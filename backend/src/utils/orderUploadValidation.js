const fs = require("node:fs");

const { MAX_ORDER_UPLOAD_TOTAL_BYTES } = require("../constants/orderUploadLimits");

/**
 * @param {Array<{ size?: number }> | null | undefined} files - multer `req.files` (memory or disk)
 * @param {number} maxBytes
 * @returns {{ ok: boolean, totalBytes: number, maxBytes: number }}
 */
function validateTotalUploadSize(files, maxBytes = MAX_ORDER_UPLOAD_TOTAL_BYTES) {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: true, totalBytes: 0, maxBytes };
  }
  let totalBytes = 0;
  for (const f of files) {
    let n = 0;
    if (f && Buffer.isBuffer(f.buffer)) n = f.buffer.length;
    else if (f?.size != null) {
      const s = Number(f.size);
      if (Number.isFinite(s) && s > 0) n = s;
    }
    totalBytes += n;
  }
  return { ok: totalBytes <= maxBytes, totalBytes, maxBytes };
}

/**
 * Best-effort cleanup after a rejected upload (multer memoryStorage: drop buffers; disk: unlink).
 * @param {Array<Express.Multer.File> | null | undefined} files
 */
function cleanupUploadedFiles(files) {
  if (!Array.isArray(files)) return;
  for (const f of files) {
    try {
      if (f && Buffer.isBuffer(f.buffer)) {
        f.buffer = undefined;
      }
      const p = f?.path;
      if (p && typeof p === "string" && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Multipart filenames arrive as latin1-decoded UTF-8 bytes. Re-decode only when the string is
 * pure latin1 with high bytes AND forms valid UTF-8 (Arabic, accents, CJK); otherwise keep as-is.
 * Safe to call on already-decoded names (characters above U+00FF short-circuit).
 */
function decodeMultipartFilename(name) {
  const s = String(name ?? "");
  if (!s || !/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  const decoded = Buffer.from(s, "latin1").toString("utf8");
  return decoded.includes("�") ? s : decoded;
}

const MAX_ORIGINAL_NAME_LENGTH = 200;

/** Display name for DB / Content-Disposition only (never used in storage keys or paths). */
function sanitizeOriginalFilename(name, fallback = "file") {
  let s = decodeMultipartFilename(name).normalize("NFC");
  s = s.split(/[\\/]/).pop() || "";
  // Control characters and bidi overrides (spoofed extensions like "fdp.exe" rendered reversed).
  s = s.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "").trim();
  if (s.length > MAX_ORIGINAL_NAME_LENGTH) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 11 ? s.slice(dot) : "";
    s = s.slice(0, MAX_ORIGINAL_NAME_LENGTH - ext.length) + ext;
  }
  return s || fallback;
}

/**
 * Content signatures for types the browser may render inline (images/PDF) and for OOXML/ZIP.
 * Legacy Office / text types are not sniffed (browsers report CSV as application/vnd.ms-excel).
 */
const ZIP_SIGNATURE = (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b;
const FILE_SIGNATURES = {
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP",
  "application/pdf": (b) => {
    const at = b.subarray(0, 1024).indexOf("%PDF-");
    return at >= 0;
  },
  "application/zip": ZIP_SIGNATURE,
  "application/x-zip-compressed": ZIP_SIGNATURE,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ZIP_SIGNATURE,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ZIP_SIGNATURE,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ZIP_SIGNATURE,
};

/**
 * Reject files whose bytes do not match the declared type (e.g. HTML renamed to .png).
 * @returns {{ ok: true } | { ok: false, originalname: string }}
 */
function validateUploadedFileSignatures(files) {
  for (const f of Array.isArray(files) ? files : []) {
    if (!f || !Buffer.isBuffer(f.buffer)) continue;
    const check = FILE_SIGNATURES[String(f.mimetype || "").toLowerCase()];
    if (check && !check(f.buffer)) return { ok: false, originalname: String(f.originalname || "") };
  }
  return { ok: true };
}

module.exports = {
  validateTotalUploadSize,
  cleanupUploadedFiles,
  decodeMultipartFilename,
  sanitizeOriginalFilename,
  validateUploadedFileSignatures,
};
