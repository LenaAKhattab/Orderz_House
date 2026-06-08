const COURSE_PDF_UPLOAD_FAILED_MESSAGE = "تعذر رفع الملف. تأكد أن الملف PDF وحاول مرة أخرى.";
const COURSE_FILE_OPEN_FAILED_MESSAGE = "تعذر فتح الملف. يرجى إبلاغ الإدارة لإعادة رفعه.";
const COURSE_FILE_LEGACY_MESSAGE = "هذا الملف يحتاج إلى إعادة رفع من الإدارة.";

function isLegacyBrokenCloudinaryPdfUrl(url) {
  const u = String(url || "").trim();
  if (!u.includes("res.cloudinary.com")) return false;
  if (u.includes("/image/upload/") && /\.pdf(\?|$)/i.test(u)) return true;
  if (/\/raw\/upload\/[^?]*\.pdf(\?|$)/i.test(u)) return true;
  return false;
}

function logCourseFileUrlDiagnostic(payload) {
  console.info("[courses] course-file-url", payload);
}

function assertCoursePdfUploadFile(file) {
  if (!file?.buffer?.length) {
    const err = new Error("ملف PDF مطلوب.");
    err.statusCode = 400;
    throw err;
  }
  const mimetype = String(file.mimetype || "").toLowerCase();
  if (mimetype !== "application/pdf") {
    const err = new Error(COURSE_PDF_UPLOAD_FAILED_MESSAGE);
    err.statusCode = 400;
    throw err;
  }
  const magic = file.buffer.subarray(0, 5).toString("ascii");
  if (!magic.startsWith("%PDF")) {
    const err = new Error(COURSE_PDF_UPLOAD_FAILED_MESSAGE);
    err.statusCode = 400;
    throw err;
  }
}

async function fetchValidatedCoursePdfBuffer(sourceUrl, { minBytes = 1 } = {}) {
  const url = String(sourceUrl || "").trim();
  if (!url.startsWith("http")) {
    const err = new Error(COURSE_FILE_OPEN_FAILED_MESSAGE);
    err.statusCode = 404;
    throw err;
  }
  if (isLegacyBrokenCloudinaryPdfUrl(url)) {
    const err = new Error(COURSE_FILE_LEGACY_MESSAGE);
    err.statusCode = 404;
    throw err;
  }
  let response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch (fetchErr) {
    console.error("[courses] PDF fetch failed", { url, message: fetchErr?.message || fetchErr });
    const err = new Error(COURSE_FILE_OPEN_FAILED_MESSAGE);
    err.statusCode = 502;
    throw err;
  }
  if (!response.ok) {
    console.error("[courses] PDF fetch HTTP error", {
      url,
      status: response.status,
      contentType: response.headers.get("content-type"),
    });
    const err = new Error(COURSE_FILE_OPEN_FAILED_MESSAGE);
    err.statusCode = 502;
    throw err;
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < minBytes || !body.subarray(0, 5).toString("ascii").startsWith("%PDF")) {
    console.error("[courses] PDF fetch invalid body", {
      url,
      bytes: body.length,
      magic: body.subarray(0, 8).toString("ascii"),
    });
    const err = new Error(COURSE_FILE_OPEN_FAILED_MESSAGE);
    err.statusCode = 502;
    throw err;
  }
  return body;
}

async function verifyCloudinaryPdfDelivery(secureUrl, options = {}) {
  const body = await fetchValidatedCoursePdfBuffer(secureUrl, options);
  return body.length;
}

function buildCoursePdfDownloadFilename(fileKind, sourceUrl) {
  const kind = String(fileKind || "file");
  if (kind === "test") return "course-test.pdf";
  if (kind === "prompt") return "course-prompt.pdf";
  if (kind === "model-answer") return "course-model-answer.pdf";
  if (kind === "completed-exam") return "completed-exam.pdf";
  try {
    const tail = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() || "");
    if (tail && !tail.includes("/")) {
      return /\.pdf$/i.test(tail) ? tail : `${tail}.pdf`;
    }
  } catch {
    /* ignore */
  }
  return "course-file.pdf";
}

module.exports = {
  COURSE_PDF_UPLOAD_FAILED_MESSAGE,
  COURSE_FILE_OPEN_FAILED_MESSAGE,
  COURSE_FILE_LEGACY_MESSAGE,
  assertCoursePdfUploadFile,
  fetchValidatedCoursePdfBuffer,
  verifyCloudinaryPdfDelivery,
  buildCoursePdfDownloadFilename,
  isLegacyBrokenCloudinaryPdfUrl,
  logCourseFileUrlDiagnostic,
};
