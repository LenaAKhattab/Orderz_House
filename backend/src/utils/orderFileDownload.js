const path = require("node:path");
const fsp = require("node:fs/promises");

const UPLOADS_ROOT = path.resolve(path.join(__dirname, "..", "..", "uploads"));

/**
 * Resolve where an order_files row lives: HTTPS asset (e.g. Cloudinary) or disk under uploads/.
 * Does not perform auth — callers must authorize first.
 * @param {object} f DB row: file_path, file_url, secure_url
 * @returns {Promise<{ redirectUrl: string }|{ absPath: string }>}
 */
async function resolveOrderFileLocation(f) {
  if (!f || typeof f !== "object") {
    const err = new Error("الملف غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  const remoteUrl = String(f.secure_url || f.file_url || "").trim();
  if (/^https?:\/\//i.test(remoteUrl)) {
    return { redirectUrl: remoteUrl };
  }
  const rel = String(f.file_path || "").replace(/\\/g, "/").trim();
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
    const err = new Error("مسار الملف غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  const absPath = path.resolve(UPLOADS_ROOT, rel);
  const relToRoot = path.relative(UPLOADS_ROOT, absPath);
  if (!relToRoot || relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    const err = new Error("مسار الملف غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  try {
    await fsp.access(absPath);
  } catch {
    const err = new Error("الملف غير موجود على الخادم.");
    err.statusCode = 404;
    throw err;
  }
  return { absPath };
}

module.exports = {
  UPLOADS_ROOT,
  resolveOrderFileLocation,
};
