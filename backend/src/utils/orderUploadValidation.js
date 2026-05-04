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

module.exports = {
  validateTotalUploadSize,
  cleanupUploadedFiles,
};
