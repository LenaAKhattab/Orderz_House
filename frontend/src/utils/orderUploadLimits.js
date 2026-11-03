import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";
import { isNewLocale } from "../i18n/systemContent.js";
import { numberFormatFor } from "./localeFormat.js";

/** Combined size limit for all files in one order-related upload action. */
export const MAX_ORDER_UPLOAD_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_ORDER_UPLOAD_TOTAL_MB = 5;

/** Must match backend `ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR`. */
export const ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR = pt(
  "platformUtils.upload.totalSizeExceeded",
  { mb: MAX_ORDER_UPLOAD_TOTAL_MB },
  "ar",
);

/** Helper copy for inputs (Arabic). */
export const ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR = pt(
  "platformUtils.upload.totalSizeHelper",
  { mb: MAX_ORDER_UPLOAD_TOTAL_MB },
  "ar",
);

/** Total-size limit message in a UI locale (Arabic unless given; follows German / Dutch / Romanian UIs). */
export function orderUploadTotalSizeMessage(locale = localeFromEnFlag(false)) {
  return pt("platformUtils.upload.totalSizeExceeded", { mb: MAX_ORDER_UPLOAD_TOTAL_MB }, locale);
}

/** Input helper copy in a UI locale (Arabic unless given; follows German / Dutch / Romanian UIs). */
export function orderUploadTotalSizeHelper(locale = localeFromEnFlag(false)) {
  return pt("platformUtils.upload.totalSizeHelper", { mb: MAX_ORDER_UPLOAD_TOTAL_MB }, locale);
}

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

/** Fixed decimals: unchanged `toFixed` for Arabic / English, locale separators for German / Dutch / Romanian. */
function fixedSize(value, digits, locale) {
  if (!isNewLocale(locale)) return value.toFixed(digits);
  return numberFormatFor(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/**
 * @param {number} bytes
 * @param {string} [locale] Arabic unless given; follows German / Dutch / Romanian UIs.
 * @returns {string}
 */
export function formatFileSize(bytes, locale = localeFromEnFlag(false)) {
  const n = Number(bytes);
  const size = (key, value) => pt(`platformUtils.upload.fileSize.${key}`, { size: value }, locale);
  if (!Number.isFinite(n) || n < 0) return size("bytes", 0);
  if (n < 1024) return size("bytes", Math.round(n));
  if (n < 1024 * 1024) return size("kilobytes", fixedSize(n / 1024, n < 10 * 1024 ? 2 : 1, locale));
  return size("megabytes", fixedSize(n / (1024 * 1024), n < 10 * 1024 * 1024 ? 2 : 1, locale));
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
