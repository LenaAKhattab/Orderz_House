const multer = require("multer");
const {
  MAX_COURSE_FILE_BYTES,
  COURSE_FILE_SIZE_MESSAGE_AR,
  COURSE_FILE_MIME_TYPES,
} = require("../constants/courseUploadLimits");

const storage = multer.memoryStorage();

function courseFileFilter(req, file, cb) {
  const mt = String(file?.mimetype || "").toLowerCase();
  if (COURSE_FILE_MIME_TYPES.has(mt)) return cb(null, true);
  const err = new Error("نوع الملف غير مدعوم. يُسمح بـ PDF، Word، Excel، PowerPoint، ZIP، صور، أو نص.");
  err.statusCode = 400;
  err.exposeToClient = true;
  err.publicCode = "VALIDATION_ERROR";
  return cb(err);
}

const uploadCourseTestFile = multer({
  storage,
  limits: { fileSize: MAX_COURSE_FILE_BYTES, files: 1 },
  fileFilter: courseFileFilter,
}).single("testFile");

const uploadCoursePromptFile = multer({
  storage,
  limits: { fileSize: MAX_COURSE_FILE_BYTES, files: 1 },
  fileFilter: courseFileFilter,
}).single("promptFile");

const uploadCourseModelAnswerFile = multer({
  storage,
  limits: { fileSize: MAX_COURSE_FILE_BYTES, files: 1 },
  fileFilter: courseFileFilter,
}).single("modelAnswerFile");

const uploadCourseAuditResponseFile = multer({
  storage,
  limits: { fileSize: MAX_COURSE_FILE_BYTES, files: 1 },
  fileFilter: courseFileFilter,
}).single("auditResponseFile");

function completedExamPdfFilter(req, file, cb) {
  const mt = String(file?.mimetype || "").toLowerCase();
  if (mt === "application/pdf") return cb(null, true);
  const err = new Error("تعذر رفع الملف. تأكد أن الملف PDF وحاول مرة أخرى.");
  err.statusCode = 400;
  err.exposeToClient = true;
  err.publicCode = "VALIDATION_ERROR";
  return cb(err);
}

const uploadCompletedExamFile = multer({
  storage,
  limits: { fileSize: MAX_COURSE_FILE_BYTES, files: 1 },
  fileFilter: completedExamPdfFilter,
}).single("completedExamFile");

module.exports = {
  uploadCourseTestFile,
  uploadCoursePromptFile,
  uploadCourseModelAnswerFile,
  uploadCourseAuditResponseFile,
  uploadCompletedExamFile,
  MAX_COURSE_FILE_BYTES,
  COURSE_FILE_SIZE_MESSAGE_AR,
};
