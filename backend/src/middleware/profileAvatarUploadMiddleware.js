const multer = require("multer");

const storage = multer.memoryStorage();

const uploadProfileAvatar = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(String(file.mimetype || ""))) {
      return cb(null, true);
    }
    const err = new Error("يُسمح بصور JPEG أو PNG أو WebP فقط.");
    err.statusCode = 400;
    err.exposeToClient = true;
    err.publicCode = "VALIDATION_ERROR";
    return cb(err);
  },
});

module.exports = { uploadProfileAvatar };
