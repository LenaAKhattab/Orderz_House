import { extractYoutubePlaylistId, extractYoutubeVideoId } from "./youtubeSourceUtils";

export function fileNameFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "ملف مرفق";
  try {
    const path = decodeURIComponent(new URL(raw).pathname);
    const name = path.split("/").filter(Boolean).pop() || "";
    if (name && name !== "/") return name;
  } catch {
    /* ignore */
  }
  const tail = raw.split("/").pop()?.split("?")[0];
  return tail && tail.length < 120 ? tail : "ملف مرفق";
}

/** True when the storage/CDN segment is not meaningful to show students (IDs, timestamps, etc.). */
export function isTechnicalStorageFileName(name) {
  const n = String(name || "").trim();
  if (!n) return true;
  const base = n.replace(/\.[a-z0-9]{1,8}$/i, "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
  if (/^\d{10,}([-_]\d*)*$/i.test(base)) return true;
  if (/^[\d_-]+$/.test(base) && base.replace(/\D/g, "").length >= 10) return true;
  if (/^v\d+$/i.test(base)) return true;
  if (base.length >= 12 && (base.match(/\d/g) || []).length / base.length > 0.7) return true;
  return false;
}

export const COURSE_TEST_FILE_STUDENT_TITLE = "ملف الاختبار";
export const COURSE_PROMPT_FILE_STUDENT_TITLE = "ملف التعليمات";

/** Fixed download names for student-facing course files (never expose storage keys). */
export function getStudentCourseFileDownloadName(fileKind) {
  if (fileKind === "prompt") return "course-prompt.pdf";
  if (fileKind === "answer") return "course-answer.pdf";
  return "course-test.pdf";
}

export function resolveStudentCourseFileDisplay({ url, fileKind, updatedAt = null }) {
  const kind = fileKind === "prompt" ? "prompt" : "test";
  const title = kind === "prompt" ? COURSE_PROMPT_FILE_STUDENT_TITLE : COURSE_TEST_FILE_STUDENT_TITLE;
  const rawName = fileNameFromUrl(url);
  const dateLabel = formatAssetDate(updatedAt);
  return {
    title,
    typeLabel: "PDF",
    updatedLabel: dateLabel ? `آخر تحديث: ${dateLabel}` : null,
    downloadName: getStudentCourseFileDownloadName(kind),
    showRawName: Boolean(url) && !isTechnicalStorageFileName(rawName),
    rawName: isTechnicalStorageFileName(rawName) ? null : rawName,
  };
}

export function isHttpUrl(value) {
  const v = String(value || "").trim();
  return v.startsWith("http://") || v.startsWith("https://");
}

export function isProbablyImageUrl(url) {
  const raw = String(url || "").trim().toLowerCase();
  if (!isHttpUrl(raw)) return false;
  return /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(raw) || raw.includes("res.cloudinary.com");
}

export function getYoutubeThumbnail(url) {
  const raw = String(url || "").trim();
  const videoId = extractYoutubeVideoId(raw);
  if (videoId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
  }
  const playlistId = extractYoutubePlaylistId(raw);
  if (playlistId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(playlistId)}/hqdefault.jpg`;
  }
  return null;
}

export function isYoutubeUrl(url) {
  return Boolean(extractYoutubeVideoId(url) || extractYoutubePlaylistId(url));
}

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
}

export function formatAssetDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

/** Use stored Cloudinary secure_url as-is (no transforms). */
export function normalizeCourseFileDeliveryUrl(url) {
  return String(url || "").trim();
}

/**
 * Legacy uploads stored a .pdf suffix in the delivery path; Cloudinary CDN returns 401.
 */
export function isLegacyBrokenCloudinaryPdfUrl(url) {
  const u = String(url || "").trim();
  if (!u.includes("res.cloudinary.com")) return false;
  if (u.includes("/image/upload/") && /\.pdf(\?|$)/i.test(u)) return true;
  if (/\/raw\/upload\/[^?]*\.pdf(\?|$)/i.test(u)) return true;
  return false;
}

/** Suggested download filename for anchor[download]. */
export function courseFileDownloadName(filename) {
  let safeName = String(filename || "document")
    .replace(/[^\w.\-() ]+/g, "_")
    .trim()
    .slice(0, 80);
  if (!/\.pdf$/i.test(safeName)) safeName = `${safeName}.pdf`;
  return safeName;
}

/** Download uses the same deliverable URL as view (fl_attachment breaks raw PDFs on this account). */
export function buildCourseFileDownloadUrl(url) {
  return normalizeCourseFileDeliveryUrl(url);
}

const COURSE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export function validateCourseUploadFile(file) {
  if (!file) {
    return { ok: false, message: "لم يتم اختيار ملف." };
  }
  const mt = String(file.type || "").toLowerCase();
  if (mt !== "application/pdf") {
    return {
      ok: false,
      message: "تعذر رفع الملف. تأكد أن الملف PDF وحاول مرة أخرى.",
    };
  }
  if (file.size > COURSE_UPLOAD_MAX_BYTES) {
    return { ok: false, message: "حجم الملف يجب ألا يتجاوز 5 ميجابايت." };
  }
  return { ok: true };
}

export async function copyTextToClipboard(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
