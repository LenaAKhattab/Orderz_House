/** Combined size limit for all files in one order-related upload action (multipart field `files`). */
const MAX_ORDER_UPLOAD_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_ORDER_UPLOAD_TOTAL_MB = 5;

/** Shared API/client Arabic message (must match frontend). */
const ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR = "حجم الملفات يجب ألا يتجاوز 5 ميجابايت إجمالاً";

module.exports = {
  MAX_ORDER_UPLOAD_TOTAL_BYTES,
  MAX_ORDER_UPLOAD_TOTAL_MB,
  ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR,
};
