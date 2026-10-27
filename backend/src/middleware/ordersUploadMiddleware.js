const path = require("node:path");
const multer = require("multer");

const { MAX_ORDER_UPLOAD_TOTAL_BYTES, ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR } = require("../constants/orderUploadLimits");
const {
  validateTotalUploadSize,
  cleanupUploadedFiles,
  validateUploadedFileSignatures,
} = require("../utils/orderUploadValidation");

const baseUploadsDir = path.join(__dirname, "..", "..", "uploads", "orders");
const storage = multer.memoryStorage();

const DANGEROUS_FILENAME = /\.(exe|bat|cmd|com|msi|scr|sh|bash|js|mjs|cjs|html|htm|xhtml|php|phtml|jar|dll|vbs|ps1|svg)(\?.*)?$/i;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Browsers without a registered handler (e.g. Office not installed) send DOCX/XLSX/PPTX as
 * application/octet-stream or with no type. Map the extension to its canonical type in that case;
 * the byte-signature check below still verifies the content.
 */
const EXTENSION_MIME = Object.freeze({
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  zip: "application/zip",
});
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-unknown"]);

function unsupportedTypeError() {
  const err = new Error("نوع الملف غير مدعوم.");
  err.statusCode = 415;
  err.code = "UNSUPPORTED_FILE_TYPE";
  return err;
}

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const name = String(file?.originalname || "");
    if (DANGEROUS_FILENAME.test(name) || name.includes("..")) return cb(unsupportedTypeError());
    const mt = String(file?.mimetype || "").toLowerCase();
    if (ALLOWED_MIME_TYPES.has(mt)) return cb(null, true);
    if (GENERIC_MIME_TYPES.has(mt)) {
      const ext = (/\.([a-z0-9]{1,8})$/i.exec(name) || [])[1];
      const inferred = ext ? EXTENSION_MIME[ext.toLowerCase()] : null;
      if (inferred) {
        file.mimetype = inferred;
        return cb(null, true);
      }
    }
    return cb(unsupportedTypeError());
  },
  limits: {
    files: 5,
    /** Single part cap = total budget (combined limit enforced after upload). */
    fileSize: MAX_ORDER_UPLOAD_TOTAL_BYTES,
  },
});

function enforceOrderUploadTotalSize(req, res, next) {
  const files = req.files;
  if (!Array.isArray(files) || files.length === 0) return next();
  const { ok } = validateTotalUploadSize(files);
  if (!ok) {
    cleanupUploadedFiles(files);
    req.files = undefined;
    return res.status(413).json({ success: false, message: ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR });
  }
  if (files.some((f) => !f || !Buffer.isBuffer(f.buffer) || f.buffer.length === 0)) {
    cleanupUploadedFiles(files);
    req.files = undefined;
    return res.status(400).json({ success: false, message: "لا يمكن رفع ملف فارغ.", code: "EMPTY_FILE" });
  }
  if (!validateUploadedFileSignatures(files).ok) {
    cleanupUploadedFiles(files);
    req.files = undefined;
    // Bytes do not match the declared type (e.g. HTML renamed to .png): unsupported media.
    return res.status(415).json({ success: false, message: "محتوى الملف لا يطابق نوعه.", code: "FILE_CONTENT_MISMATCH" });
  }
  return next();
}

module.exports = {
  uploadOrderFiles: upload.array("files", 5),
  enforceOrderUploadTotalSize,
  handleOrderUploadErrors: (err, req, res, next) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR
          : err.code === "LIMIT_FILE_COUNT"
            ? "عدد الملفات أكثر من المسموح (٥ كحد أقصى)."
            : "تعذّر رفع الملف.";
      return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message: msg });
    }
    if (err?.statusCode === 415) {
      return res.status(415).json({ success: false, message: err.message, code: err.code || "UNSUPPORTED_FILE_TYPE" });
    }
    if (err?.statusCode === 400) {
      return res.status(400).json({ success: false, message: err.message || "تعذّر رفع الملف." });
    }
    return next(err);
  },
  baseUploadsDir,
};

