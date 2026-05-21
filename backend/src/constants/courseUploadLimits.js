/** Max size for a single course test or audit-response file upload. */
const MAX_COURSE_FILE_BYTES = 5 * 1024 * 1024;

const COURSE_FILE_SIZE_MESSAGE_AR = "حجم الملف يجب ألا يتجاوز 5 ميجابايت.";

const COURSE_FILE_MIME_TYPES = new Set([
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

module.exports = {
  MAX_COURSE_FILE_BYTES,
  COURSE_FILE_SIZE_MESSAGE_AR,
  COURSE_FILE_MIME_TYPES,
};
