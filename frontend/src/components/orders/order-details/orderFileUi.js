/**
 * Pure helpers for order file rows (FileList): preview eligibility, type label/icon kind and the
 * mapping of view/download failures to localized message keys.
 */

const PREVIEW_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const PREVIEW_EXT = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function fileExtension(name) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

/** Short uppercase type label from the file name ("PDF", "DOCX"); empty when there is no extension. */
export function fileTypeLabel(name) {
  return fileExtension(name).toUpperCase();
}

/** Images and PDF open in the browser; everything else (DOCX, XLSX, ZIP, …) is download-only. */
export function isPreviewableOrderFile(file) {
  const mime = String(file?.mimeType || "").toLowerCase();
  if (mime) return PREVIEW_MIME.has(mime);
  return PREVIEW_EXT.has(fileExtension(file?.originalName));
}

export function isImageOrderFile(file) {
  const mime = String(file?.mimeType || "").toLowerCase();
  if (mime) return mime.startsWith("image/");
  return IMAGE_EXT.has(fileExtension(file?.originalName));
}

/** Server reports the stored source as gone (missing R2/Cloudinary/disk object). */
export const MISSING_FILE_CODES = new Set(["FILE_NOT_FOUND", "FILE_SOURCE_MISSING"]);

/**
 * @param {any} err axios error (blob response codes are exposed as `fileErrorCode`)
 * @returns {{ key: string, missing: boolean, login: boolean }} i18n key under `ordersAdmin.orderDetails.files.errors`
 */
export function orderFileErrorKey(err) {
  const status = Number(err?.response?.status || 0);
  const code = String(err?.fileErrorCode || "");
  if (status === 401) return { key: "session", missing: false, login: true };
  if (status === 403) return { key: "forbidden", missing: false, login: false };
  if (status === 404 && MISSING_FILE_CODES.has(code)) return { key: "missing", missing: true, login: false };
  if (status === 404) return { key: "notFound", missing: false, login: false };
  if (status === 410) return { key: "missing", missing: true, login: false };
  if (status === 429) return { key: "rateLimited", missing: false, login: false };
  if (status === 502 || status === 503 || status === 504) return { key: "storage", missing: false, login: false };
  if (status >= 500) return { key: "server", missing: false, login: false };
  if (!status) return { key: "network", missing: false, login: false };
  return { key: "generic", missing: false, login: false };
}
