/** Combined size limit for all files in one order-related upload action. */
export const MAX_ORDER_UPLOAD_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_ORDER_UPLOAD_TOTAL_MB = 5;

/** Must match backend `ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR`. */
export const ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR = "حجم الملفات يجب ألا يتجاوز 5 ميجابايت إجمالاً";

/** Helper copy for inputs (Arabic). */
export const ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR = "الحد الأقصى لإجمالي الملفات: 5 ميجابايت";

/**
 * @param {ArrayLike<File> | File[] | null | undefined} files
 */
export function getTotalFileSize(files) {
  if (!files || !files.length) return 0;
  let sum = 0;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    sum += file && typeof file.size === "number" ? file.size : 0;
  }
  return sum;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "0 بايت";
  if (n < 1024) return `${Math.round(n)} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 2 : 1)} كيلوبايت`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 2 : 1)} ميجابايت`;
}

/**
 * @param {ArrayLike<File> | File[] | null | undefined} files
 * @returns {{ ok: boolean; totalBytes: number }}
 */
export function validateOrderFilesSize(files) {
  const totalBytes = getTotalFileSize(files);
  return {
    ok: totalBytes <= MAX_ORDER_UPLOAD_TOTAL_BYTES,
    totalBytes,
  };
}

/** Must match backend `ordersUploadMiddleware` allowlist (extension → canonical MIME). */
export const ORDER_UPLOAD_ALLOWED_EXTENSIONS = Object.freeze([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "zip",
]);

/** `accept` attribute for order file inputs. */
export const ORDER_UPLOAD_ACCEPT = ORDER_UPLOAD_ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

/** Human list for hints ("PDF, JPG, …"). */
export const ORDER_UPLOAD_TYPES_LABEL = "PDF, JPG, PNG, WEBP, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, ZIP";

export function orderFileExtension(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

/**
 * Client-side pre-check (the server stays authoritative and also verifies file signatures).
 * @param {File} file
 * @returns {null | "type" | "empty"} rejection reason
 */
export function orderUploadRejectionReason(file) {
  if (!file) return "type";
  if (!ORDER_UPLOAD_ALLOWED_EXTENSIONS.includes(orderFileExtension(file.name))) return "type";
  if (Number(file.size) === 0) return "empty";
  return null;
}
