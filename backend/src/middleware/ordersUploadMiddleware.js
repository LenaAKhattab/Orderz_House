const path = require("node:path");
const multer = require("multer");

const baseUploadsDir = path.join(__dirname, "..", "..", "uploads", "orders");
const storage = multer.memoryStorage();

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

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const mt = String(file?.mimetype || "").toLowerCase();
    if (ALLOWED_MIME_TYPES.has(mt)) return cb(null, true);
    const err = new Error("نوع الملف غير مدعوم.");
    err.statusCode = 400;
    return cb(err);
  },
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024, // 10MB/file
  },
});

module.exports = {
  uploadOrderFiles: upload.array("files", 5),
  handleOrderUploadErrors: (err, req, res, next) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "حجم الملف كبير جداً."
          : err.code === "LIMIT_FILE_COUNT"
            ? "عدد الملفات أكثر من المسموح (٥ كحد أقصى)."
            : "تعذّر رفع الملف.";
      return res.status(400).json({ success: false, message: msg });
    }
    if (err?.statusCode === 400) {
      return res.status(400).json({ success: false, message: err.message || "تعذّر رفع الملف." });
    }
    return next(err);
  },
  baseUploadsDir,
};

