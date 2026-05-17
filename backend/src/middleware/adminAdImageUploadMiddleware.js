const multer = require("multer");

const MAX_AD_IMAGE_BYTES = 2 * 1024 * 1024;

const storage = multer.memoryStorage();

const uploadAdminAdImage = multer({
  storage,
  limits: { fileSize: MAX_AD_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(String(file.mimetype || ""))) {
      return cb(null, true);
    }
    const err = new Error("يُسمح بصور JPEG أو PNG أو WebP فقط (حتى 2 ميجابايت).");
    err.statusCode = 400;
    err.exposeToClient = true;
    err.publicCode = "VALIDATION_ERROR";
    return cb(err);
  },
});

module.exports = { uploadAdminAdImage, MAX_AD_IMAGE_BYTES };
