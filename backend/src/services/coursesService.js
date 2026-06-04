const { pool } = require("../config/db");
const { importYoutubeSource } = require("../utils/youtubeImport");
const { assessCoursePublishReadiness } = require("../utils/coursePublishReadiness");
const {
  normalizeQuestionCount,
  validateAndComputeExamMarks,
  mapAssignmentGrading,
} = require("../utils/courseExamGrading");
const notificationEventsService = require("./notificationEventsService");
const { uploadCourseDocumentBuffer, destroyByPublicId } = require("./cloudinaryUploadService");
const {
  assertCoursePdfUploadFile,
  verifyCloudinaryPdfDelivery,
  isLegacyBrokenCloudinaryPdfUrl,
  logCourseFileUrlDiagnostic,
} = require("../utils/coursePdfUpload");

const MAX_AUDIT_RESPONSE_TEXT = 50000;

const GLOBAL_SEND_BLOCKED_MESSAGE = "هذا الكورس متاح لجميع المستقلين ولا يحتاج إلى إرسال يدوي.";
const COURSE_FILE_UPLOAD_FAILED_MESSAGE = "تعذر رفع الملف. تأكد أن الملف PDF وحاول مرة أخرى.";

function assertCloudinaryCourseFileUpload(uploaded, { courseId, purpose }) {
  const url = String(uploaded?.secureUrl || "").trim();
  if (!url.startsWith("http")) {
    const err = new Error(COURSE_FILE_UPLOAD_FAILED_MESSAGE);
    err.statusCode = 400;
    throw err;
  }
  if (!uploaded?.publicId) {
    console.error("[courses] Cloudinary upload missing publicId", { courseId, purpose, uploaded });
  }
  return url;
}

function wrapCourseFileUploadError(err, label) {
  if (err?.statusCode) return err;
  console.error(`[courses] ${label} failed`, err?.message || err);
  const wrapped = new Error(COURSE_FILE_UPLOAD_FAILED_MESSAGE);
  wrapped.statusCode = 400;
  return wrapped;
}

function hasAuditResponse(auditResponseText, auditResponseFileUrl) {
  const text = auditResponseText != null ? String(auditResponseText).trim() : "";
  const url = auditResponseFileUrl != null ? String(auditResponseFileUrl).trim() : "";
  return text.length > 0 || url.length > 0;
}

function applyTestingVisibilityToCourse(mapped, testingEnabled) {
  if (!testingEnabled) {
    mapped.testFileUrl = null;
    mapped.testPromptFileUrl = null;
    mapped.testModelAnswerFileUrl = null;
    mapped.testQuestionCount = null;
  }
  return mapped;
}

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

/** Hide auto-generated YouTube playlist import boilerplate from freelancers. */
function isYoutubeImportBoilerplateDescription(description) {
  const d = String(description || "").trim();
  if (!d) return false;
  return (
    /^دورة تدريبية مستوردة من قائمة تشغيل يوتيوب/i.test(d) ||
    (/قائمة تشغيل يوتيوب/i.test(d) && /\(جميع الدروس\)/i.test(d))
  );
}

function mapCourse(row, { forFreelancer = false } = {}) {
  if (!row) return null;
  let description = row.description || null;
  if (forFreelancer && isYoutubeImportBoilerplateDescription(description)) {
    description = null;
  }
  return {
    id: String(row.id),
    title: row.title,
    description,
    coverImage: row.cover_image || null,
    youtubeSourceUrl: row.youtube_source_url,
    isActive: Boolean(row.is_active),
    isVisibleToAllFreelancers: Boolean(row.is_visible_to_all_freelancers),
    isTestingEnabled: Boolean(row.is_testing_enabled),
    testFileUrl: row.test_file_url || null,
    testPromptFileUrl: row.test_prompt_file_url || null,
    testModelAnswerFileUrl: row.test_model_answer_file_url || null,
    testQuestionCount: row.test_question_count != null ? Number(row.test_question_count) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLesson(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    title: row.title,
    description: row.description || null,
    youtubeVideoId: row.youtube_video_id,
    youtubeUrl: row.youtube_url,
    sortOrder: Number(row.sort_order),
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isCourseGloballyVisible(courseRow) {
  return Boolean(courseRow?.is_visible_to_all_freelancers);
}

function assertCourseNotGloballyVisibleForManualSend(courseRow) {
  if (isCourseGloballyVisible(courseRow)) {
    const err = new Error(GLOBAL_SEND_BLOCKED_MESSAGE);
    err.statusCode = 400;
    err.code = "COURSE_GLOBALLY_VISIBLE";
    throw err;
  }
}

/** Freelancer may access when published and global, or has an assignment row. */
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

/**
 * Lazy engagement row for globally visible courses (one row per engaging freelancer, not bulk).
 * @returns {Promise<boolean>} true if row exists or was created
 */
async function ensureFreelancerCourseEngagement(client, { courseId, freelancerId, assignedBy = null }) {
  const cid = Number(courseId);
  const fid = Number(freelancerId);
  const { rows: courseRows } = await client.query(
    `SELECT id, is_active, is_visible_to_all_freelancers FROM courses WHERE id = $1 LIMIT 1`,
    [cid],
  );
  const course = courseRows[0];
  if (!course || !course.is_active || !course.is_visible_to_all_freelancers) {
    return false;
  }
  const { rows: existing } = await client.query(
    `SELECT 1 FROM course_assignments WHERE course_id = $1 AND freelancer_id = $2 LIMIT 1`,
    [cid, fid],
  );
  if (existing.length) return true;

  const { rows: inserted } = await client.query(
    `INSERT INTO course_assignments (course_id, freelancer_id, assigned_by, assigned_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (course_id, freelancer_id) DO NOTHING
     RETURNING id`,
    [cid, fid, assignedBy != null ? Number(assignedBy) : null],
  );
  return inserted.length > 0;
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

async function listFreelancerIds({ query = "", limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 300);
  const q = String(query || "").trim();
  const params = [];
  const where = [`u.role = 'freelancer'`, `u.is_active = TRUE`];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.account_id ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.father_name ILIKE $${params.length} OR u.family_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  params.push(lim);
  const { rows } = await pool.query(
    `SELECT u.id, u.account_id, u.first_name, u.father_name, u.family_name, u.email
     FROM users u
     WHERE ${where.join(" AND ")}
     ORDER BY u.id DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: String(r.id),
    accountId: r.account_id,
    firstName: r.first_name,
    fatherName: r.father_name,
    familyName: r.family_name,
    email: r.email,
  }));
}

async function createCourse({ actorUserId, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const sourceUrl = String(payload.youtubeSourceUrl || "").trim();
    const imported = await importYoutubeSource(sourceUrl);
    const { rows } = await client.query(
      `INSERT INTO courses (title, description, cover_image, youtube_source_url, is_active, is_visible_to_all_freelancers, is_testing_enabled, test_file_url, test_prompt_file_url, test_model_answer_file_url, test_question_count, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
       RETURNING *`,
      [
        String(payload.title || "").trim() || "دورة جديدة",
        payload.description ? String(payload.description).trim() : null,
        payload.coverImage ? String(payload.coverImage).trim() : null,
        sourceUrl,
        payload.isActive !== undefined ? Boolean(payload.isActive) : true,
        payload.isVisibleToAllFreelancers !== undefined ? Boolean(payload.isVisibleToAllFreelancers) : false,
        payload.isTestingEnabled !== undefined ? Boolean(payload.isTestingEnabled) : false,
        payload.testFileUrl ? String(payload.testFileUrl).trim() : null,
        payload.testPromptFileUrl ? String(payload.testPromptFileUrl).trim() : null,
        payload.testModelAnswerFileUrl ? String(payload.testModelAnswerFileUrl).trim() : null,
        normalizeQuestionCount(payload.testQuestionCount),
        Number(actorUserId),
      ],
    );
    const course = rows[0];
    for (const lesson of imported.lessons) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO course_lessons (course_id, title, youtube_video_id, youtube_url, sort_order, duration_seconds, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),NOW())
         ON CONFLICT (course_id, youtube_video_id) DO NOTHING`,
        [Number(course.id), lesson.title, lesson.youtubeVideoId, lesson.youtubeUrl, Number(lesson.sortOrder), lesson.durationSeconds],
      );
    }
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: course.id });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function importCourseLessons({ actorUserId, courseId, youtubeSourceUrl, replaceExisting = false }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rows } = await client.query(`SELECT * FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [Number(courseId)]);
    const course = rows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const imported = await importYoutubeSource(String(youtubeSourceUrl || course.youtube_source_url || "").trim());
    if (replaceExisting) {
      await client.query(`DELETE FROM course_lessons WHERE course_id = $1`, [Number(courseId)]);
    }
    const { rows: countRows } = await client.query(`SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM course_lessons WHERE course_id = $1`, [
      Number(courseId),
    ]);
    let sortBase = Number(countRows[0]?.max_order || 0);
    let inserted = 0;
    for (const lesson of imported.lessons) {
      sortBase += 1;
      // eslint-disable-next-line no-await-in-loop
      const ins = await client.query(
        `INSERT INTO course_lessons (course_id, title, youtube_video_id, youtube_url, sort_order, duration_seconds, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),NOW())
         ON CONFLICT (course_id, youtube_video_id) DO NOTHING
         RETURNING id`,
        [Number(courseId), lesson.title, lesson.youtubeVideoId, lesson.youtubeUrl, Number(sortBase), lesson.durationSeconds],
      );
      if (ins.rowCount > 0) inserted += 1;
    }
    await client.query(`UPDATE courses SET youtube_source_url = $2, updated_at = NOW() WHERE id = $1`, [Number(courseId), String(youtubeSourceUrl || course.youtube_source_url).trim()]);
    if (inserted > 0) {
      const { rows: assignedRows } = await client.query(`SELECT freelancer_id FROM course_assignments WHERE course_id = $1`, [Number(courseId)]);
      await safeNotify(() =>
        notificationEventsService.notifyUsers(
          {
            userIds: assignedRows.map((r) => Number(r.freelancer_id)),
            recipientRole: "freelancer",
            actorUserId: Number(actorUserId),
            type: "course.lesson.added",
            title: "تمت إضافة دروس جديدة",
            message: `تمت إضافة ${inserted} درس جديد إلى دورة "${course.title}".`,
            entityType: "course",
            entityId: Number(courseId),
            link: `/dashboard/freelancer/courses/${encodeURIComponent(String(courseId))}`,
            priority: "medium",
            metadata: { courseId: String(courseId), insertedCount: inserted },
            dedupeKey: `course_lessons_added_${courseId}_${Date.now()}`,
          },
          client,
        ),
      );
    }
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: Number(courseId) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateCourse({ actorUserId, courseId, patch }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const fields = [];
    const vals = [];
    let i = 1;
    const set = (col, val) => {
      fields.push(`${col} = $${i}`);
      vals.push(val);
      i += 1;
    };
    if (patch.title !== undefined) set("title", String(patch.title || "").trim());
    if (patch.description !== undefined) set("description", patch.description ? String(patch.description).trim() : null);
    if (patch.coverImage !== undefined) set("cover_image", patch.coverImage ? String(patch.coverImage).trim() : null);
    if (patch.youtubeSourceUrl !== undefined) set("youtube_source_url", String(patch.youtubeSourceUrl || "").trim());
    if (patch.isActive !== undefined) set("is_active", Boolean(patch.isActive));
    if (patch.isVisibleToAllFreelancers !== undefined) {
      set("is_visible_to_all_freelancers", Boolean(patch.isVisibleToAllFreelancers));
    }
    if (patch.isTestingEnabled !== undefined) set("is_testing_enabled", Boolean(patch.isTestingEnabled));
    if (patch.testQuestionCount !== undefined) {
      set("test_question_count", normalizeQuestionCount(patch.testQuestionCount));
    }

    const cid = Number(courseId);
    const { rows: beforeRows } = await client.query(
      `SELECT test_file_url, test_prompt_file_url, test_model_answer_file_url FROM courses WHERE id = $1 LIMIT 1`,
      [cid],
    );
    const before = beforeRows[0] || {};

    if (patch.testFileUrl !== undefined) {
      const url = patch.testFileUrl ? String(patch.testFileUrl).trim() : null;
      if (url && isLegacyBrokenCloudinaryPdfUrl(url)) {
        const err = new Error("رابط ملف الاختبار قديم وغير صالح. أعد رفع الملف.");
        err.statusCode = 400;
        throw err;
      }
      set("test_file_url", url);
    }
    if (patch.testPromptFileUrl !== undefined) {
      const url = patch.testPromptFileUrl ? String(patch.testPromptFileUrl).trim() : null;
      if (url && isLegacyBrokenCloudinaryPdfUrl(url)) {
        const err = new Error("رابط ملف المطالبة قديم وغير صالح. أعد رفع الملف.");
        err.statusCode = 400;
        throw err;
      }
      set("test_prompt_file_url", url);
    }
    if (patch.testModelAnswerFileUrl !== undefined) {
      const url = patch.testModelAnswerFileUrl ? String(patch.testModelAnswerFileUrl).trim() : null;
      if (url && isLegacyBrokenCloudinaryPdfUrl(url)) {
        const err = new Error("رابط ملف الإجابة النموذجية قديم وغير صالح. أعد رفع الملف.");
        err.statusCode = 400;
        throw err;
      }
      set("test_model_answer_file_url", url);
    }

    set("updated_at", new Date());
    vals.push(cid);
    const { rows } = await client.query(
      `UPDATE courses
       SET ${fields.join(", ")}
       WHERE id = $${i}
       RETURNING *`,
      vals,
    );
    if (!rows[0]) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }

    if (
      patch.testFileUrl !== undefined ||
      patch.testPromptFileUrl !== undefined ||
      patch.testModelAnswerFileUrl !== undefined
    ) {
      logCourseFileUrlDiagnostic({
        courseId: cid,
        action: "patch",
        previousTestFileUrl: before.test_file_url || null,
        previousPromptFileUrl: before.test_prompt_file_url || null,
        previousModelAnswerFileUrl: before.test_model_answer_file_url || null,
        patchTestFileUrl: patch.testFileUrl !== undefined ? patch.testFileUrl : undefined,
        patchPromptFileUrl: patch.testPromptFileUrl !== undefined ? patch.testPromptFileUrl : undefined,
        patchModelAnswerFileUrl: patch.testModelAnswerFileUrl !== undefined ? patch.testModelAnswerFileUrl : undefined,
        storedTestFileUrl: rows[0].test_file_url || null,
        storedPromptFileUrl: rows[0].test_prompt_file_url || null,
        storedModelAnswerFileUrl: rows[0].test_model_answer_file_url || null,
      });
    }

    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: cid });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateCourseLessons({ actorUserId, courseId, lessons }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rowCount: exists } = await client.query(`SELECT 1 FROM courses WHERE id = $1 LIMIT 1`, [Number(courseId)]);
    if (!exists) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    for (const lesson of Array.isArray(lessons) ? lessons : []) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `UPDATE course_lessons
         SET title = COALESCE($3, title),
             description = CASE WHEN $6::boolean THEN $7 ELSE description END,
             sort_order = COALESCE($4, sort_order),
             is_active = COALESCE($5, is_active),
             updated_at = NOW()
         WHERE id = $1
           AND course_id = $2`,
        [
          Number(lesson.id),
          Number(courseId),
          lesson.title !== undefined ? String(lesson.title || "").trim() : null,
          lesson.sortOrder !== undefined ? Number(lesson.sortOrder) : null,
          lesson.isActive !== undefined ? Boolean(lesson.isActive) : null,
          lesson.description !== undefined,
          lesson.description !== undefined
            ? lesson.description
              ? String(lesson.description).trim().slice(0, 8000)
              : null
            : null,
        ],
      );
    }
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: Number(courseId) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function publishCourse({ actorUserId, courseId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rows } = await client.query(`SELECT * FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [Number(courseId)]);
    const course = rows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const { rows: lessonRows } = await client.query(
      `SELECT * FROM course_lessons WHERE course_id = $1 ORDER BY sort_order ASC, id ASC`,
      [Number(courseId)],
    );
    const readiness = assessCoursePublishReadiness(course, lessonRows);
    if (!readiness.ok) {
      const err = new Error("لا يمكن نشر الكورس قبل اكتمال البيانات.");
      err.statusCode = 400;
      err.code = "COURSE_PUBLISH_INCOMPLETE";
      err.missing = readiness.missing;
      err.missingLabels = readiness.missingLabels;
      throw err;
    }
    await client.query(`UPDATE courses SET is_active = TRUE, updated_at = NOW() WHERE id = $1`, [Number(courseId)]);
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: Number(courseId) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function archiveCourse({ actorUserId, courseId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rows } = await client.query(`SELECT id FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [Number(courseId)]);
    if (!rows[0]) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    await client.query(`UPDATE courses SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [Number(courseId)]);
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: Number(courseId) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function deleteCourse({ actorUserId, courseId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rows } = await client.query(`SELECT id, title FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [Number(courseId)]);
    const course = rows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    await client.query(`DELETE FROM courses WHERE id = $1`, [Number(courseId)]);
    await client.query("COMMIT");
    return { deleted: true, id: String(course.id), title: course.title };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Only `true` or `1` enables "assign to every freelancer". Strings like "false" are truthy in JS — never use those.
 */
function coalesceAssignAllFlag(assignAll) {
  return assignAll === true || assignAll === 1;
}

/**
 * Add a single freelancer to a course without removing existing assignments (for "إرسال الدورة" one-by-one).
 */
async function addCourseFreelancer({ actorUserId, courseId, freelancerUserId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const fid = Number(freelancerUserId);
    if (!Number.isInteger(fid) || fid < 1) {
      const err = new Error("معرف المستقل مطلوب وغير صالح.");
      err.statusCode = 400;
      throw err;
    }
    const { rows: courseRows } = await client.query(`SELECT * FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [Number(courseId)]);
    const course = courseRows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    assertCourseNotGloballyVisibleForManualSend(course);
    const { rows: uRows } = await client.query(`SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1`, [fid]);
    const user = uRows[0];
    if (!user || String(user.role) !== "freelancer" || !user.is_active) {
      const err = new Error("المستخدم ليس مستقلاً نشطاً.");
      err.statusCode = 400;
      throw err;
    }
    const { rows: inserted } = await client.query(
      `INSERT INTO course_assignments (course_id, freelancer_id, assigned_by, assigned_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (course_id, freelancer_id) DO NOTHING
       RETURNING id`,
      [Number(courseId), fid, Number(actorUserId)],
    );
    if (!inserted.length) {
      const err = new Error("الدورة مسندة لهذا المستقل مسبقاً.");
      err.statusCode = 409;
      throw err;
    }
    await safeNotify(() =>
      notificationEventsService.notifyUsers(
        {
          userIds: [fid],
          recipientRole: "freelancer",
          actorUserId: Number(actorUserId),
          type: "course.assigned",
          title: "تم إسناد دورة تدريبية لك",
          message: `تم إسناد دورة "${course.title}" إلى حسابك.`,
          entityType: "course",
          entityId: Number(courseId),
          link: `/dashboard/freelancer/courses/${encodeURIComponent(String(courseId))}`,
          priority: "high",
          metadata: { courseId: String(courseId), courseTitle: course.title },
          dedupeKey: `course_assigned_${courseId}_${fid}_${Date.now()}`,
        },
        client,
      ),
    );
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: Number(courseId) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Remove one freelancer from a course (admin "unsend"): delete lesson progress then assignment row.
 */
async function removeCourseFreelancer({ actorUserId, courseId, freelancerUserId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const cid = Number(courseId);
    const fid = Number(freelancerUserId);
    if (!Number.isInteger(fid) || fid < 1) {
      const err = new Error("معرف المستقل مطلوب وغير صالح.");
      err.statusCode = 400;
      throw err;
    }
    const { rows: courseRows } = await client.query(`SELECT id FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [cid]);
    if (!courseRows.length) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const { rows: exists } = await client.query(
      `SELECT 1 FROM course_assignments WHERE course_id = $1 AND freelancer_id = $2 LIMIT 1`,
      [cid, fid],
    );
    if (!exists.length) {
      const err = new Error("لا يوجد إسناد لهذا المستقل على هذه الدورة.");
      err.statusCode = 404;
      throw err;
    }
    await client.query(`DELETE FROM course_lesson_progress WHERE course_id = $1 AND freelancer_id = $2`, [cid, fid]);
    await client.query(`DELETE FROM course_assignments WHERE course_id = $1 AND freelancer_id = $2`, [cid, fid]);
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: cid });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function assignCourseFreelancers({ actorUserId, courseId, freelancerIds = [], assignAll = false }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const wantsEveryFreelancer = coalesceAssignAllFlag(assignAll);
    const { rows: courseRows } = await client.query(`SELECT * FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [Number(courseId)]);
    const course = courseRows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    assertCourseNotGloballyVisibleForManualSend(course);
    let targetIds = [];
    if (wantsEveryFreelancer) {
      const { rows } = await client.query(`SELECT id FROM users WHERE role = 'freelancer' AND is_active = TRUE`);
      targetIds = rows.map((r) => Number(r.id));
    } else {
      targetIds = [...new Set((Array.isArray(freelancerIds) ? freelancerIds : []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
    }
    const { rows: prevRows } = await client.query(`SELECT freelancer_id FROM course_assignments WHERE course_id = $1`, [Number(courseId)]);
    const prev = new Set(prevRows.map((r) => Number(r.freelancer_id)));

    await client.query(`DELETE FROM course_assignments WHERE course_id = $1`, [Number(courseId)]);
    for (const fid of targetIds) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO course_assignments (course_id, freelancer_id, assigned_by, assigned_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (course_id, freelancer_id) DO NOTHING`,
        [Number(courseId), Number(fid), Number(actorUserId)],
      );
    }
    const newlyAssigned = targetIds.filter((id) => !prev.has(id));
    if (newlyAssigned.length) {
      await safeNotify(() =>
        notificationEventsService.notifyUsers(
          {
            userIds: newlyAssigned,
            recipientRole: "freelancer",
            actorUserId: Number(actorUserId),
            type: "course.assigned",
            title: "تم إسناد دورة تدريبية لك",
            message: `تم إسناد دورة "${course.title}" إلى حسابك.`,
            entityType: "course",
            entityId: Number(courseId),
            link: `/dashboard/freelancer/courses/${encodeURIComponent(String(courseId))}`,
            priority: "high",
            metadata: { courseId: String(courseId), courseTitle: course.title },
            // Keep this unique per assignment operation so re-assignment can notify again.
            dedupeKey: `course_assigned_${courseId}_${Date.now()}`,
          },
          client,
        ),
      );
    }
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: Number(courseId) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listCoursesForAdmin({ actorUserId, q = "", isActive = null } = {}) {
  const client = await pool.connect();
  try {
    await assertAdminOrSuperAdmin(actorUserId, client);
    const where = ["1=1"];
    const vals = [];
    if (String(q || "").trim()) {
      vals.push(`%${String(q).trim()}%`);
      where.push(`(c.title ILIKE $${vals.length} OR c.description ILIKE $${vals.length})`);
    }
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      vals.push(Boolean(isActive));
      where.push(`c.is_active = $${vals.length}`);
    }
    const { rows } = await client.query(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = c.id AND l.is_active = TRUE) AS lessons_count,
              CASE
                WHEN c.is_visible_to_all_freelancers THEN (
                  SELECT COUNT(*)::int FROM users u WHERE u.role = 'freelancer' AND u.is_active = TRUE
                )
                ELSE (
                  SELECT COUNT(*)::int FROM course_assignments a WHERE a.course_id = c.id
                )
              END AS assigned_count
       FROM courses c
       WHERE ${where.join(" AND ")}
       ORDER BY c.id DESC`,
      vals,
    );
    return rows.map((r) => ({
      ...mapCourse(r),
      lessonsCount: Number(r.lessons_count || 0),
      assignedCount: Number(r.assigned_count || 0),
    }));
  } finally {
    client.release();
  }
}

async function getCourseDetailsForAdmin({ actorUserId, courseId }) {
  const client = await pool.connect();
  try {
    await assertAdminOrSuperAdmin(actorUserId, client);
    const { rows } = await client.query(`SELECT * FROM courses WHERE id = $1 LIMIT 1`, [Number(courseId)]);
    const course = rows[0];
    if (!course) return null;
    const [lessonRes, assignRes, progressRes] = await Promise.all([
      client.query(`SELECT * FROM course_lessons WHERE course_id = $1 ORDER BY sort_order ASC, id ASC`, [Number(courseId)]),
      client.query(
        `SELECT a.freelancer_id, a.exam_question_marks, a.exam_final_grade, a.audit_submitted_at, a.completed_at,
                u.account_id, u.first_name, u.father_name, u.family_name, u.email
         FROM course_assignments a
         JOIN users u ON u.id = a.freelancer_id
         WHERE a.course_id = $1
         ORDER BY a.assigned_at DESC`,
        [Number(courseId)],
      ),
      client.query(
        `SELECT p.freelancer_id,
                COUNT(*)::int AS completed_lessons
         FROM course_lesson_progress p
         WHERE p.course_id = $1
         GROUP BY p.freelancer_id`,
        [Number(courseId)],
      ),
    ]);
    const totalLessons = lessonRes.rows.filter((x) => x.is_active).length;
    const progressByFreelancer = new Map(progressRes.rows.map((r) => [String(r.freelancer_id), Number(r.completed_lessons || 0)]));
    const publishReadiness = assessCoursePublishReadiness(course, lessonRes.rows);
    return {
      course: mapCourse(course),
      publishReadiness,
      lessons: lessonRes.rows.map(mapLesson),
      assignments: assignRes.rows.map((r) => {
        const completed = progressByFreelancer.get(String(r.freelancer_id)) || 0;
        const grading = mapAssignmentGrading(r);
        return {
          freelancerId: String(r.freelancer_id),
          accountId: r.account_id,
          firstName: r.first_name,
          fatherName: r.father_name,
          familyName: r.family_name,
          email: r.email,
          progress: {
            totalLessons,
            completedLessons: completed,
            percentage: totalLessons > 0 ? Math.min(100, Math.round((completed / totalLessons) * 100)) : 0,
          },
          examQuestionMarks: grading.examQuestionMarks,
          examFinalGrade: grading.examFinalGrade,
          examSubmittedAt: r.audit_submitted_at || r.completed_at || null,
        };
      }),
    };
  } finally {
    client.release();
  }
}

/** Lighter course rows for dashboard aggregate (max 50 assignments). */
async function listAssignedCoursesForFreelancerDashboard({ freelancerUserId }) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (c.id) c.id, c.title, c.is_testing_enabled,
            a.completed_at AS assignment_completed_at,
            COALESCE(lc.total_lessons, 0)::int AS total_lessons,
            COALESCE(lp.completed_lessons, 0)::int AS completed_lessons
     FROM courses c
     LEFT JOIN course_assignments a ON a.course_id = c.id AND a.freelancer_id = $1
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS total_lessons
       FROM course_lessons l
       WHERE l.course_id = c.id AND l.is_active = TRUE
     ) lc ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS completed_lessons
       FROM course_lesson_progress p
       WHERE p.course_id = c.id AND p.freelancer_id = $1
     ) lp ON TRUE
     WHERE c.is_active = TRUE
       AND (c.is_visible_to_all_freelancers = TRUE OR a.freelancer_id IS NOT NULL)
     ORDER BY c.id DESC
     LIMIT 50`,
    [uid],
  );
  return rows.map((r) => {
    const total = Number(r.total_lessons || 0);
    const completed = Number(r.completed_lessons || 0);
    return {
      id: String(r.id),
      title: r.title,
      isTestingEnabled: Boolean(r.is_testing_enabled),
      courseCompletedAt: r.assignment_completed_at || null,
      progress: {
        totalLessons: total,
        completedLessons: completed,
        percentage: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
      },
    };
  });
}

async function listAssignedCoursesForFreelancer({ freelancerUserId }) {
  const uid = Number(freelancerUserId);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (c.id) c.*,
            a.completed_at AS assignment_completed_at,
            (a.freelancer_id IS NOT NULL) AS has_assignment_row,
            (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = c.id AND l.is_active = TRUE) AS total_lessons,
            (SELECT COUNT(*)::int FROM course_lesson_progress p WHERE p.course_id = c.id AND p.freelancer_id = $1) AS completed_lessons
     FROM courses c
     LEFT JOIN course_assignments a ON a.course_id = c.id AND a.freelancer_id = $1
     WHERE c.is_active = TRUE
       AND (c.is_visible_to_all_freelancers = TRUE OR a.freelancer_id IS NOT NULL)
     ORDER BY c.id DESC`,
    [uid],
  );
  return rows.map((r) => {
    const total = Number(r.total_lessons || 0);
    const completed = Number(r.completed_lessons || 0);
    return {
      ...mapCourse(r, { forFreelancer: true }),
      accessMode: Boolean(r.has_assignment_row) ? "assigned" : "global",
      courseCompletedAt: r.assignment_completed_at || null,
      progress: {
        totalLessons: total,
        completedLessons: completed,
        percentage: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
      },
    };
  });
}

async function uploadCourseTestFile({ actorUserId, courseId, file }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const cid = Number(courseId);
    const { rows } = await client.query(`SELECT id FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [cid]);
    if (!rows[0]) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    assertCoursePdfUploadFile(file);
    let uploaded;
    try {
      uploaded = await uploadCourseDocumentBuffer({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        courseId: cid,
        purpose: "test",
      });
      const secureUrl = assertCloudinaryCourseFileUpload(uploaded, { courseId: cid, purpose: "test" });
      await verifyCloudinaryPdfDelivery(secureUrl, { minBytes: file.buffer.length > 0 ? 5 : 1 });
      await client.query(`UPDATE courses SET test_file_url = $2, updated_at = NOW() WHERE id = $1`, [cid, secureUrl]);
      logCourseFileUrlDiagnostic({
        courseId: cid,
        action: "upload-test-file",
        uploadSecureUrl: secureUrl,
        storedTestFileUrl: secureUrl,
      });
    } catch (uploadErr) {
      if (uploaded?.publicId) {
        await destroyByPublicId(uploaded.publicId, uploaded.resourceType || "raw");
      }
      throw uploadErr;
    }
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: cid });
  } catch (err) {
    await client.query("ROLLBACK");
    throw wrapCourseFileUploadError(err, "uploadCourseTestFile");
  } finally {
    client.release();
  }
}

async function uploadCoursePromptFile({ actorUserId, courseId, file }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const cid = Number(courseId);
    const { rows } = await client.query(`SELECT id FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [cid]);
    if (!rows[0]) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    assertCoursePdfUploadFile(file);
    let uploaded;
    try {
      uploaded = await uploadCourseDocumentBuffer({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        courseId: cid,
        purpose: "prompt",
      });
      const secureUrl = assertCloudinaryCourseFileUpload(uploaded, { courseId: cid, purpose: "prompt" });
      await verifyCloudinaryPdfDelivery(secureUrl, { minBytes: file.buffer.length > 0 ? 5 : 1 });
      await client.query(`UPDATE courses SET test_prompt_file_url = $2, updated_at = NOW() WHERE id = $1`, [cid, secureUrl]);
      logCourseFileUrlDiagnostic({
        courseId: cid,
        action: "upload-prompt-file",
        uploadSecureUrl: secureUrl,
        storedPromptFileUrl: secureUrl,
      });
    } catch (uploadErr) {
      if (uploaded?.publicId) {
        await destroyByPublicId(uploaded.publicId, uploaded.resourceType || "raw");
      }
      throw uploadErr;
    }
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: cid });
  } catch (err) {
    await client.query("ROLLBACK");
    throw wrapCourseFileUploadError(err, "uploadCoursePromptFile");
  } finally {
    client.release();
  }
}

async function uploadCourseModelAnswerFile({ actorUserId, courseId, file }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const cid = Number(courseId);
    const { rows } = await client.query(`SELECT id FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`, [cid]);
    if (!rows[0]) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    assertCoursePdfUploadFile(file);
    let uploaded;
    try {
      uploaded = await uploadCourseDocumentBuffer({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        courseId: cid,
        purpose: "model-answer",
      });
      const secureUrl = assertCloudinaryCourseFileUpload(uploaded, { courseId: cid, purpose: "model-answer" });
      await verifyCloudinaryPdfDelivery(secureUrl, { minBytes: file.buffer.length > 0 ? 5 : 1 });
      await client.query(`UPDATE courses SET test_model_answer_file_url = $2, updated_at = NOW() WHERE id = $1`, [
        cid,
        secureUrl,
      ]);
      logCourseFileUrlDiagnostic({
        courseId: cid,
        action: "upload-model-answer-file",
        uploadSecureUrl: secureUrl,
        storedModelAnswerFileUrl: secureUrl,
      });
    } catch (uploadErr) {
      if (uploaded?.publicId) {
        await destroyByPublicId(uploaded.publicId, uploaded.resourceType || "raw");
      }
      throw uploadErr;
    }
    await client.query("COMMIT");
    return getCourseDetailsForAdmin({ actorUserId, courseId: cid });
  } catch (err) {
    await client.query("ROLLBACK");
    throw wrapCourseFileUploadError(err, "uploadCourseModelAnswerFile");
  } finally {
    client.release();
  }
}

async function getCourseDetailsForFreelancer({ freelancerUserId, courseId }) {
  const uid = Number(freelancerUserId);
  const cid = Number(courseId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hasAccess = await freelancerHasCourseAccess(client, cid, uid);
    if (!hasAccess) {
      const err = new Error("لا يمكنك الوصول إلى هذه الدورة.");
      err.statusCode = 403;
      throw err;
    }
    await ensureFreelancerCourseEngagement(client, { courseId: cid, freelancerId: uid });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const { rows: assignRows } = await pool.query(
    `SELECT audit_confirmed, audit_notes, audit_response_text, audit_response_file_url, audit_submitted_at, completed_at,
            exam_question_marks, exam_final_grade
     FROM course_assignments
     WHERE course_id = $1 AND freelancer_id = $2
     LIMIT 1`,
    [cid, uid],
  );
  const assignmentRow = assignRows[0] || {
    audit_confirmed: false,
    audit_notes: null,
    audit_response_text: null,
    audit_response_file_url: null,
    audit_submitted_at: null,
    completed_at: null,
    exam_question_marks: null,
    exam_final_grade: null,
  };
  const assignmentGrading = mapAssignmentGrading(assignmentRow);
  const { rows: courseRows } = await pool.query(`SELECT * FROM courses WHERE id = $1 AND is_active = TRUE LIMIT 1`, [cid]);
  const course = courseRows[0];
  if (!course) {
    const err = new Error("الدورة غير موجودة.");
    err.statusCode = 404;
    throw err;
  }
  const { rows: lessons } = await pool.query(
    `SELECT l.*,
            EXISTS(
              SELECT 1
              FROM course_lesson_progress p
              WHERE p.lesson_id = l.id
                AND p.course_id = l.course_id
                AND p.freelancer_id = $2
            ) AS is_completed
     FROM course_lessons l
     WHERE l.course_id = $1
       AND l.is_active = TRUE
     ORDER BY l.sort_order ASC, l.id ASC`,
    [cid, uid],
  );
  const completed = lessons.filter((l) => l.is_completed).length;
  const totalLessons = lessons.length;
  const allLessonsComplete = totalLessons > 0 && completed >= totalLessons;
  const testingOn = Boolean(course.is_testing_enabled);
  const courseMapped = applyTestingVisibilityToCourse(mapCourse(course, { forFreelancer: true }), testingOn);
  const courseCompleted = Boolean(assignmentRow.completed_at);
  return {
    course: courseMapped,
    assignment: {
      auditConfirmed: Boolean(assignmentRow.audit_confirmed),
      auditNotes: assignmentRow.audit_notes || null,
      auditResponseText: assignmentRow.audit_response_text || null,
      auditResponseFileUrl: assignmentRow.audit_response_file_url || null,
      auditSubmittedAt: assignmentRow.audit_submitted_at || null,
      completedAt: assignmentRow.completed_at || null,
      examQuestionMarks: assignmentGrading.examQuestionMarks,
      examFinalGrade: assignmentGrading.examFinalGrade,
    },
    completion: {
      allLessonsComplete,
      courseCompleted,
      needsAuditStep: testingOn && allLessonsComplete && !courseCompleted,
      testingEnabled: testingOn,
    },
    lessons: lessons.map((l) => ({ ...mapLesson(l), isCompleted: Boolean(l.is_completed) })),
    progress: {
      totalLessons,
      completedLessons: completed,
      percentage: totalLessons > 0 ? Math.min(100, Math.round((completed / totalLessons) * 100)) : 0,
    },
  };
}

async function markLessonComplete({ freelancerUserId, courseId, lessonId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const uid = Number(freelancerUserId);
    const cid = Number(courseId);
    const lid = Number(lessonId);
    const hasAccess = await freelancerHasCourseAccess(client, cid, uid);
    if (!hasAccess) {
      const err = new Error("غير مسموح بهذا الإجراء.");
      err.statusCode = 403;
      throw err;
    }
    await ensureFreelancerCourseEngagement(client, { courseId: cid, freelancerId: uid });
    const { rows: lessonRows } = await client.query(
      `SELECT id, title
       FROM course_lessons
       WHERE id = $1
         AND course_id = $2
         AND is_active = TRUE
       LIMIT 1`,
      [lid, cid],
    );
    const lesson = lessonRows[0];
    if (!lesson) {
      const err = new Error("الدرس غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    await client.query(
      `INSERT INTO course_lesson_progress (course_id, lesson_id, freelancer_id, completed_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (freelancer_id, course_id, lesson_id) DO NOTHING`,
      [cid, lid, uid],
    );
    const { rows: countsRows } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM course_lessons WHERE course_id = $1 AND is_active = TRUE) AS total_lessons,
         (SELECT COUNT(*)::int FROM course_lesson_progress WHERE course_id = $1 AND freelancer_id = $2) AS completed_lessons,
         (SELECT is_testing_enabled FROM courses WHERE id = $1 LIMIT 1) AS is_testing_enabled`,
      [cid, uid],
    );
    const total = Number(countsRows[0]?.total_lessons || 0);
    const completed = Number(countsRows[0]?.completed_lessons || 0);
    const testingEnabled = Boolean(countsRows[0]?.is_testing_enabled);
    const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    await safeNotify(() =>
      notificationEventsService.notifyUsers(
        {
          userIds: [uid],
          recipientRole: "freelancer",
          actorUserId: uid,
          type: "course.lesson.completed",
          title: "تم تسجيل إكمال الدرس",
          message: `تم إكمال درس: ${lesson.title}`,
          entityType: "course",
          entityId: cid,
          link: `/dashboard/freelancer/courses/${encodeURIComponent(String(cid))}`,
          priority: "low",
          metadata: { courseId: String(cid), lessonId: String(lid) },
          dedupeKey: `course_lesson_completed_${cid}_${lid}`,
        },
        client,
      ),
    );
    if (total > 0 && completed >= total && !testingEnabled) {
      const { rowCount: updated } = await client.query(
        `UPDATE course_assignments
         SET completed_at = COALESCE(completed_at, NOW())
         WHERE course_id = $1 AND freelancer_id = $2 AND completed_at IS NULL`,
        [cid, uid],
      );
      if (updated) {
        await safeNotify(() =>
          notificationEventsService.notifyUsers(
            {
              userIds: [uid],
              recipientRole: "freelancer",
              actorUserId: uid,
              type: "course.completed",
              title: "اكتملت الدورة بنجاح",
              message: "ممتاز! لقد أكملت جميع دروس هذه الدورة.",
              entityType: "course",
              entityId: cid,
              link: `/dashboard/freelancer/courses/${encodeURIComponent(String(cid))}`,
              priority: "medium",
              metadata: { courseId: String(cid) },
              dedupeKey: `course_completed_${cid}_${uid}_${Date.now()}`,
            },
            client,
          ),
        );
      }
    }
    await client.query("COMMIT");
    return { totalLessons: total, completedLessons: completed, percentage };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function submitCourseCompletion({
  freelancerUserId,
  courseId,
  auditNotes,
  auditResponseText,
  auditResponseFileUrl,
  auditResponseFile,
  questionMarks,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const uid = Number(freelancerUserId);
    const cid = Number(courseId);
    const { rows: courseRows } = await client.query(`SELECT * FROM courses WHERE id = $1 AND is_active = TRUE LIMIT 1 FOR UPDATE`, [cid]);
    const course = courseRows[0];
    if (!course) {
      const err = new Error("الدورة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const hasAccess = await freelancerHasCourseAccess(client, cid, uid);
    if (!hasAccess) {
      const err = new Error("غير مسموح بهذا الإجراء.");
      err.statusCode = 403;
      throw err;
    }
    await ensureFreelancerCourseEngagement(client, { courseId: cid, freelancerId: uid });
    const { rows: assignRows } = await client.query(
      `SELECT * FROM course_assignments WHERE course_id = $1 AND freelancer_id = $2 LIMIT 1 FOR UPDATE`,
      [cid, uid],
    );
    const assignment = assignRows[0];
    if (!assignment) {
      const err = new Error("غير مسموح بهذا الإجراء.");
      err.statusCode = 403;
      throw err;
    }
    if (assignment.completed_at) {
      await client.query("COMMIT");
      return getCourseDetailsForFreelancer({ freelancerUserId: uid, courseId: cid });
    }
    const { rows: countRows } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM course_lessons WHERE course_id = $1 AND is_active = TRUE) AS total_lessons,
         (SELECT COUNT(*)::int FROM course_lesson_progress WHERE course_id = $1 AND freelancer_id = $2) AS completed_lessons`,
      [cid, uid],
    );
    const total = Number(countRows[0]?.total_lessons || 0);
    const completed = Number(countRows[0]?.completed_lessons || 0);
    if (total <= 0 || completed < total) {
      const err = new Error("يجب إكمال جميع الدروس أولاً.");
      err.statusCode = 400;
      throw err;
    }
    const testingOn = Boolean(course.is_testing_enabled);
    const questionCount = normalizeQuestionCount(course.test_question_count);
    let examMarksJson = null;
    let examFinalGrade = null;

    if (testingOn) {
      if (questionCount) {
        const markResult = validateAndComputeExamMarks(questionMarks, questionCount);
        if (!markResult.ok) {
          const err = new Error(markResult.message || "تحقق من درجات جميع الأسئلة.");
          err.statusCode = 400;
          err.exposeToClient = true;
          err.publicCode = "EXAM_MARKS_INVALID";
          err.fieldErrors = markResult.fieldErrors || {};
          throw err;
        }
        examMarksJson = JSON.stringify(markResult.marks);
        examFinalGrade = markResult.finalGrade;
      }

      let responseFileUrl =
        auditResponseFileUrl != null && String(auditResponseFileUrl).trim()
          ? String(auditResponseFileUrl).trim().slice(0, 2000)
          : null;
      if (auditResponseFile?.buffer?.length) {
        const uploaded = await uploadCourseDocumentBuffer({
          buffer: auditResponseFile.buffer,
          mimetype: auditResponseFile.mimetype,
          originalname: auditResponseFile.originalname,
          courseId: cid,
          purpose: `responses/${uid}`,
        });
        responseFileUrl = uploaded.secureUrl;
      }
      const responseText =
        auditResponseText != null && String(auditResponseText).trim()
          ? String(auditResponseText).trim().slice(0, MAX_AUDIT_RESPONSE_TEXT)
          : null;
      if (!hasAuditResponse(responseText, responseFileUrl)) {
        const err = new Error("يجب إرسال نص استجابة ChatGPT أو رفع ملف الاستجابة قبل إنهاء الدورة.");
        err.statusCode = 400;
        throw err;
      }
      const notes = auditNotes != null && String(auditNotes).trim() ? String(auditNotes).trim().slice(0, 8000) : null;
      await client.query(
        `UPDATE course_assignments
         SET audit_confirmed = TRUE,
             audit_notes = $3,
             audit_response_text = $4,
             audit_response_file_url = $5,
             exam_question_marks = $6::jsonb,
             exam_final_grade = $7,
             audit_submitted_at = NOW(),
             completed_at = NOW()
         WHERE course_id = $1 AND freelancer_id = $2`,
        [cid, uid, notes, responseText, responseFileUrl, examMarksJson, examFinalGrade],
      );
    } else {
      await client.query(
        `UPDATE course_assignments
         SET completed_at = NOW()
         WHERE course_id = $1 AND freelancer_id = $2`,
        [cid, uid],
      );
    }
    await safeNotify(() =>
      notificationEventsService.notifyUsers(
        {
          userIds: [uid],
          recipientRole: "freelancer",
          actorUserId: uid,
          type: "course.completed",
          title: "اكتملت الدورة بنجاح",
          message: testingOn
            ? "تم إرسال استجابة الاختبار وإنهاء الدورة بنجاح."
            : "ممتاز! لقد أكملت جميع متطلبات هذه الدورة.",
          entityType: "course",
          entityId: cid,
          link: `/dashboard/freelancer/courses/${encodeURIComponent(String(cid))}`,
          priority: "medium",
          metadata: { courseId: String(cid), audit: testingOn },
          dedupeKey: `course_completed_submit_${cid}_${uid}_${Date.now()}`,
        },
        client,
      ),
    );
    await client.query("COMMIT");
    return getCourseDetailsForFreelancer({ freelancerUserId: uid, courseId: cid });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listFreelancerIds,
  createCourse,
  importCourseLessons,
  updateCourse,
  updateCourseLessons,
  publishCourse,
  archiveCourse,
  deleteCourse,
  addCourseFreelancer,
  removeCourseFreelancer,
  assignCourseFreelancers,
  listCoursesForAdmin,
  getCourseDetailsForAdmin,
  listAssignedCoursesForFreelancer,
  listAssignedCoursesForFreelancerDashboard,
  getCourseDetailsForFreelancer,
  markLessonComplete,
  submitCourseCompletion,
  uploadCourseTestFile,
  uploadCoursePromptFile,
  uploadCourseModelAnswerFile,
};
