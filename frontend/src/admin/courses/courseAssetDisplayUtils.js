import { extractYoutubePlaylistId, extractYoutubeVideoId } from "./youtubeSourceUtils";

export function fileNameFromUrl(url, t) {
  const raw = String(url || "").trim();
  const fallback = t ? t("courses.assets.attachedFile") : "courses.assets.attachedFile";
  if (!raw) return fallback;
  try {
    const path = decodeURIComponent(new URL(raw).pathname);
    const name = path.split("/").filter(Boolean).pop() || "";
    if (name && name !== "/") return name;
  } catch {
    /* ignore */
  }
  const tail = raw.split("/").pop()?.split("?")[0];
  return tail && tail.length < 120 ? tail : fallback;
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

/** Fixed download names for student-facing course files (never expose storage keys). */
export function getStudentCourseFileDownloadName(fileKind) {
  if (fileKind === "prompt") return "course-prompt.pdf";
  if (fileKind === "model-answer") return "course-model-answer.pdf";
  if (fileKind === "answer") return "course-answer.pdf";
  if (fileKind === "completed-exam") return "completed-exam.pdf";
  return "course-test.pdf";
}

export function resolveStudentCourseFileDisplay({ url, fileKind, updatedAt = null, t, locale = "ar" }) {
  const kind =
    fileKind === "prompt" ? "prompt" : fileKind === "model-answer" ? "model-answer" : "test";
  const titleKey =
    kind === "prompt"
      ? "courses.assets.promptFileTitle"
      : kind === "model-answer"
        ? "courses.assets.modelAnswerTitle"
        : "courses.assets.testFileTitle";
  const title = t ? t(titleKey) : titleKey;
  const rawName = fileNameFromUrl(url, t);
  const dateLabel = formatAssetDate(updatedAt, locale);
  return {
    title,
    typeLabel: "PDF",
    updatedLabel:
      dateLabel && t ? t("courses.assets.lastUpdated", { date: dateLabel }) : dateLabel ? `lastUpdated:${dateLabel}` : null,
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
  /* Playlist-only URLs have no single /vi/{id}/ thumbnail; avoid 404 from using playlist id as video id */
  return null;
}

export function isYoutubeUrl(url) {
  return Boolean(extractYoutubeVideoId(url) || extractYoutubePlaylistId(url));
}

export function formatFileSize(bytes, t) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return null;
  if (!t) {
    if (n < 1024) return `${n}`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}`;
    return `${(n / (1024 * 1024)).toFixed(1)}`;
  }
  if (n < 1024) return t("courses.assets.bytes", { n });
  if (n < 1024 * 1024) return t("courses.assets.kilobytes", { n: (n / 1024).toFixed(1) });
  return t("courses.assets.megabytes", { n: (n / (1024 * 1024)).toFixed(1) });
}

export function formatAssetDate(iso, locale = "ar") {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const loc = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
    return d.toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" });
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
    return { ok: false, messageKey: "courses.assets.noFileSelected" };
  }
  const mt = String(file.type || "").toLowerCase();
  if (mt !== "application/pdf") {
    return {
      ok: false,
      messageKey: "courses.errors.fileUpload",
    };
  }
  if (file.size > COURSE_UPLOAD_MAX_BYTES) {
    return { ok: false, messageKey: "courses.assets.fileTooLarge" };
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
