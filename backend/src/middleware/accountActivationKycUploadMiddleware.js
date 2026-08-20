const multer = require("multer");
const {
  ACCOUNT_ACTIVATION_KYC_ALLOWED_MIME,
  ACCOUNT_ACTIVATION_KYC_MAX_BYTES,
  ACCOUNT_ACTIVATION_KYC_ERROR_CODES,
} = require("../constants/freelancerAccountActivationKyc");

const storage = multer.memoryStorage();

const uploadAccountActivationKyc = multer({
  storage,
  limits: {
    fileSize: ACCOUNT_ACTIVATION_KYC_MAX_BYTES,
    files: 2,
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || "");
    if (ACCOUNT_ACTIVATION_KYC_ALLOWED_MIME.includes(mime)) {
      return cb(null, true);
    }
    const err = new Error("يُسمح بصور JPEG أو PNG أو WebP فقط لوثيقة الهوية.");
    err.statusCode = 400;
    err.exposeToClient = true;
    err.publicCode = ACCOUNT_ACTIVATION_KYC_ERROR_CODES.INVALID_FILE_TYPE;
    return cb(err);
  },
});

function handleKycUploadErrors(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      err.statusCode = 400;
      err.exposeToClient = true;
      err.publicCode = ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FILE_TOO_LARGE;
      err.message = "حجم ملف الهوية يتجاوز الحد المسموح (5 ميغابايت).";
    }
  }
  return next(err);
}

module.exports = {
  uploadAccountActivationKyc,
  handleKycUploadErrors,
};
