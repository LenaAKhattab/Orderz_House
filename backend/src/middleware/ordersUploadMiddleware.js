const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .trim()
    .slice(0, 120);
}

// We store under backend/uploads/orders/tmp; after DB insert we derive public URL.
// Order id isn't available at upload time, so we store on disk first and persist metadata.
const baseUploadsDir = path.join(__dirname, "..", "..", "uploads", "orders", "tmp");
ensureDirSync(baseUploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, baseUploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safeBase = sanitizeFilename(path.basename(file.originalname || "file", ext));
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    cb(null, `${safeBase}-${unique}${ext}`.slice(0, 180));
  },
});

const upload = multer({
  storage,
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
          ? "File is too large."
          : err.code === "LIMIT_FILE_COUNT"
            ? "Too many files (max 5)."
            : "Invalid file upload.";
      return res.status(400).json({ success: false, message: msg });
    }
    return next(err);
  },
  baseUploadsDir,
};

