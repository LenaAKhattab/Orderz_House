const { pool } = require("../config/db");
const coursePlanEligibilityService = require("./coursePlanEligibilityService");
const {
  fetchValidatedCoursePdfBuffer,
  buildCoursePdfDownloadFilename,
  isLegacyBrokenCloudinaryPdfUrl,
  COURSE_FILE_LEGACY_MESSAGE,
  COURSE_FILE_OPEN_FAILED_MESSAGE,
} = require("../utils/coursePdfUpload");

function normalizeFileKind(fileKind) {
  const k = String(fileKind || "").toLowerCase();
  if (k === "test" || k === "prompt" || k === "model-answer" || k === "completed-exam") return k;
  const err = new Error("نوع الملف غير صالح.");
  err.statusCode = 400;
  throw err;
}

async function assertAdminOrSuperAdmin(actorUserId, client) {
  const { rows } = await client.query(`SELECT role, is_active FROM users WHERE id = $1 LIMIT 1`, [Number(actorUserId)]);
  const u = rows[0];
  if (!u || !u.is_active || !["admin", "super_admin"].includes(String(u.role || ""))) {
    const err = new Error("غير مسموح بإدارة الدورات.");
    err.statusCode = 403;
    throw err;
  }
}

async function freelancerHasCourseAccess(client, courseId, freelancerUserId) {
  const cid = Number(courseId);
  const uid = Number(freelancerUserId);
  const { rows } = await client.query(
    `SELECT c.is_active, c.is_visible_to_all_freelancers,
            EXISTS(
              SELECT 1 FROM course_assignments a
              WHERE a.course_id = c.id AND a.freelancer_id = $2
            ) AS has_assignment
     FROM courses c
     WHERE c.id = $1
     LIMIT 1`,
    [cid, uid],
  );
  const row = rows[0];
  if (!row || !row.is_active) return false;
  return Boolean(row.is_visible_to_all_freelancers) || Boolean(row.has_assignment);
}

function resolveStoredFileUrl(courseRow, fileKind) {
  const url =
    fileKind === "test"
      ? courseRow.test_file_url
      : fileKind === "prompt"
        ? courseRow.test_prompt_file_url
        : courseRow.test_model_answer_file_url;
  const trimmed = url != null ? String(url).trim() : "";
  if (!trimmed) {
    const err = new Error("الملف غير متوفر لهذه الدورة.");
    err.statusCode = 404;
    throw err;
  }
  return trimmed;
}

function sendPdfResponse(res, { buffer, filename, download }) {
  const safeName = String(filename || "course-file.pdf").replace(/[^\w.\-() ]+/g, "_");
  const disposition = download ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.status(200).send(buffer);
}

async function streamCourseFileForFreelancer({ freelancerUserId, courseId, fileKind, download, res }) {
  const kind = normalizeFileKind(fileKind);
  const cid = Number(courseId);
  const uid = Number(freelancerUserId);
  const client = await pool.connect();
  try {
    const hasAccess = await freelancerHasCourseAccess(client, cid, uid);
    if (!hasAccess) {
      const err = new Error("لا يمكنك الوصول إلى هذه الدورة.");
      err.statusCode = 403;
      throw err;
    }
    const { rows: gateRows } = await client.query(
      `SELECT id, required_tier_code FROM courses WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [cid],
    );
    if (!gateRows[0]) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const planContext = await coursePlanEligibilityService.buildFreelancerCourseAccessContext(uid, { client });
    await coursePlanEligibilityService.assertFreelancerCoursePlanAccess({
      freelancerUserId: uid,
      course: gateRows[0],
      client,
      context: planContext,
    });
    const { rows } = await client.query(
      `SELECT id, is_testing_enabled, test_file_url, test_prompt_file_url, test_model_answer_file_url
       FROM courses
       WHERE id = $1 AND is_active = TRUE
       LIMIT 1`,
      [cid],
    );
    const course = rows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    if (!course.is_testing_enabled) {
      const err = new Error("ملفات الاختبار غير متاحة لهذه الدورة.");
      err.statusCode = 403;
      throw err;
    }

    let sourceUrl;
    if (kind === "completed-exam") {
      const { rows: assignRows } = await client.query(
        `SELECT completed_exam_file_url
         FROM course_assignments
         WHERE course_id = $1 AND freelancer_id = $2
         LIMIT 1`,
        [cid, uid],
      );
      const assignment = assignRows[0];
      if (!assignment) {
        const err = new Error("لا يوجد ملف منجز لهذه الدورة.");
        err.statusCode = 404;
        throw err;
      }
      sourceUrl = String(assignment.completed_exam_file_url || "").trim();
      if (!sourceUrl) {
        const err = new Error("الملف المنجز غير متوفر.");
        err.statusCode = 404;
        throw err;
      }
    } else {
      sourceUrl = resolveStoredFileUrl(course, kind);
    }

    console.info("[courses] stream course file (freelancer)", {
      courseId: cid,
      fileKind: kind,
      download: Boolean(download),
      sourceUrl,
      legacy: isLegacyBrokenCloudinaryPdfUrl(sourceUrl),
    });
    const buffer = await fetchValidatedCoursePdfBuffer(sourceUrl);
    const filename = buildCoursePdfDownloadFilename(kind, sourceUrl);
    sendPdfResponse(res, { buffer, filename, download: Boolean(download) });
  } finally {
    client.release();
  }
}

async function streamCourseFileForAdmin({ actorUserId, courseId, fileKind, download, res }) {
  const kind = normalizeFileKind(fileKind);
  if (kind === "completed-exam") {
    const err = new Error("نوع الملف غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  const cid = Number(courseId);
  const client = await pool.connect();
  try {
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rows } = await client.query(
      `SELECT id, is_testing_enabled, test_file_url, test_prompt_file_url, test_model_answer_file_url
       FROM courses
       WHERE id = $1
       LIMIT 1`,
      [cid],
    );
    const course = rows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const sourceUrl = resolveStoredFileUrl(course, kind);
    console.info("[courses] stream course file (admin)", {
      courseId: cid,
      fileKind: kind,
      download: Boolean(download),
      sourceUrl,
      legacy: isLegacyBrokenCloudinaryPdfUrl(sourceUrl),
    });
    const buffer = await fetchValidatedCoursePdfBuffer(sourceUrl);
    const filename = buildCoursePdfDownloadFilename(kind, sourceUrl);
    sendPdfResponse(res, { buffer, filename, download: Boolean(download) });
  } finally {
    client.release();
  }
}

module.exports = {
  streamCourseFileForFreelancer,
  streamCourseFileForAdmin,
  COURSE_FILE_LEGACY_MESSAGE,
  COURSE_FILE_OPEN_FAILED_MESSAGE,
};
