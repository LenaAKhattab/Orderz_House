/**
 * Phase 2B.1 — final Mini Article manuscript (not bid proposal, not campaign brief).
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  ARTICLE_APPLICATION_STATUSES_CAN_SUBMIT_MANUSCRIPT,
  ARTICLE_SUBMISSION_APPROVABLE_STATUS,
  ARTICLE_SUBMISSION_CONTENT_MAX,
  ARTICLE_SUBMISSION_CONTENT_MIN_CHARS,
  ARTICLE_SUBMISSION_EDITABLE_STATUSES,
  ARTICLE_SUBMISSION_ERROR_CODES,
  ARTICLE_SUBMISSION_TITLE_MAX,
  ARTICLE_SUBMISSION_TITLE_MIN,
  countWords,
} = require("../constants/marketplaceArticleSubmissions");
const {
  marketplaceArticleSubmissionsSchemaReady,
} = require("../utils/marketplaceArticleSubmissionsSchema");
const {
  MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
  MINI_ARTICLE_SUBMISSION_TERMS_SNAPSHOT_KEY,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
  isTruthyTermsAcceptance,
  buildManuscriptTermsSnapshot,
} = require("../constants/marketplaceArticleSubmissionTerms");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function rejectPasswordFields(body) {
  if (!body || typeof body !== "object") return;
  for (const key of Object.keys(body)) {
    if (/password/i.test(key) || /secret/i.test(key)) {
      throw createAppError("حقول غير مسموحة.", 400, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_INVALID,
      });
    }
  }
}

function sanitizeText(raw, max) {
  const s = String(raw || "")
    .replace(/\u0000/g, "")
    .trim();
  if (!s) return "";
  return s.slice(0, max);
}

function mapSubmissionTerms(row) {
  const acceptedAt = row.terms_accepted_at || null;
  const version = row.terms_version || null;
  return {
    termsAccepted: Boolean(acceptedAt || version),
    termsVersion: version,
    termsAcceptedAt: acceptedAt,
    termsSnapshotKey: row.terms_snapshot_key || null,
  };
}

function mapSubmissionRow(row, { forAdmin = false } = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    articleId: String(row.article_id),
    freelancerUserId: String(row.freelancer_user_id),
    title: row.title,
    content: row.content,
    status: row.status,
    reviewerNotes: row.reviewer_notes || null,
    submittedAt: row.submitted_at || null,
    reviewedAt: row.reviewed_at || null,
    reviewedByUserId: forAdmin && row.reviewed_by_user_id != null ? String(row.reviewed_by_user_id) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    canResubmit: ARTICLE_SUBMISSION_EDITABLE_STATUSES.includes(row.status),
    ...mapSubmissionTerms(row),
  };
}

function assertManuscriptTermsAccepted(value) {
  if (isTruthyTermsAcceptance(value)) return true;
  throw createAppError(
    "يجب الموافقة على شروط ملكية ونشر المقال قبل التسليم.",
    400,
    {
      exposeToClient: true,
      publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_TERMS_REQUIRED,
    },
  );
}

function sanitizeClientIp(raw) {
  const s = String(raw || "").split(",")[0].trim();
  if (!s) return null;
  return s.slice(0, 64);
}

function sanitizeUserAgent(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  return s.slice(0, 512);
}

function termsWriteValues({
  freelancerUserId,
  articleId,
  applicationId,
  requestMeta = {},
  now = new Date(),
} = {}) {
  const acceptedAt = new Date(now).toISOString();
  const snapshot = buildManuscriptTermsSnapshot({
    freelancerUserId,
    articleId,
    applicationId,
    acceptedAt,
  });
  return {
    version: MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
    acceptedAt,
    ip: sanitizeClientIp(requestMeta.ip),
    userAgent: sanitizeUserAgent(requestMeta.userAgent),
    snapshotKey: MINI_ARTICLE_SUBMISSION_TERMS_SNAPSHOT_KEY,
    textSnapshot: JSON.stringify({
      version: snapshot.version,
      key: snapshot.key,
      copyAr: MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
      legalReview: snapshot.legalReview,
      acceptedAt: snapshot.acceptedAt,
    }),
  };
}

async function getSubmissionByApplicationId(applicationId, db = pool) {
  if (!(await marketplaceArticleSubmissionsSchemaReady(db))) return null;
  const { rows } = await db.query(
    `SELECT * FROM marketplace_article_submissions WHERE application_id = $1 LIMIT 1`,
    [Number(applicationId)],
  );
  return rows[0] || null;
}

async function listSubmissionsForArticle(articleId, db = pool) {
  try {
    if (!(await marketplaceArticleSubmissionsSchemaReady(db))) return [];
    const { rows } = await db.query(
      `SELECT * FROM marketplace_article_submissions WHERE article_id = $1`,
      [Number(articleId)],
    );
    return rows;
  } catch {
    return [];
  }
}

function attachSubmissionsToApplications(applications, rows, { forAdmin = false } = {}) {
  const byApp = new Map((rows || []).map((r) => [String(r.application_id), r]));
  return (applications || []).map((app) => ({
    ...app,
    articleSubmission: mapSubmissionRow(byApp.get(String(app.id)), { forAdmin }),
  }));
}

async function assertSubmittedManuscriptForApproval({ applicationId, client = pool } = {}) {
  const ready = await marketplaceArticleSubmissionsSchemaReady(client);
  if (!ready) {
    throw createAppError("يجب تسليم المقال النهائي قبل الاعتماد.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_FINAL_CONTENT_REQUIRED,
    });
  }
  const row = await getSubmissionByApplicationId(applicationId, client);
  const title = String(row?.title || "").trim();
  const content = String(row?.content || "").trim();
  if (!row || !title || !content || String(row.status) !== ARTICLE_SUBMISSION_APPROVABLE_STATUS) {
    throw createAppError("يجب تسليم المقال النهائي قبل الاعتماد.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_FINAL_CONTENT_REQUIRED,
    });
  }
  return row;
}

async function markSubmissionApproved({ applicationId, actorUserId, now = new Date(), client = pool } = {}) {
  if (!(await marketplaceArticleSubmissionsSchemaReady(client))) return null;
  const { rows } = await client.query(
    `UPDATE marketplace_article_submissions
        SET status = 'approved',
            reviewed_at = $2,
            reviewed_by_user_id = $3,
            updated_at = NOW()
      WHERE application_id = $1
        AND status = 'submitted'
      RETURNING *`,
    [Number(applicationId), new Date(now).toISOString(), actorUserId ? Number(actorUserId) : null],
  );
  return rows[0] || null;
}

async function submitFinalArticleManuscript({
  applicationId,
  freelancerUserId,
  title,
  content,
  body = {},
  termsAccepted,
  requestMeta = {},
  client: existingClient = null,
} = {}) {
  rejectPasswordFields(body);
  assertManuscriptTermsAccepted(termsAccepted ?? body.termsAccepted);
  if (!(await marketplaceArticleSubmissionsSchemaReady(existingClient || undefined))) {
    throw createAppError("تسليم المقال النهائي غير جاهز.", 503, {
      exposeToClient: true,
      publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_SCHEMA_NOT_READY,
    });
  }
  const appId = Number(applicationId);
  const fid = Number(freelancerUserId);
  const ownsClient = !existingClient;
  const client = existingClient || await pool.connect();
  try {
    if (ownsClient) await client.query("BEGIN");
    const { rows: appRows } = await client.query(
      `SELECT a.*, art.required_word_count
         FROM marketplace_article_applications a
         JOIN marketplace_articles art ON art.id = a.article_id
        WHERE a.id = $1
        FOR UPDATE`,
      [appId],
    );
    const application = appRows[0];
    if (!application) {
      throw createAppError("الطلب غير موجود.", 404, {
        exposeToClient: true,
        publicCode: "ARTICLE_APPLICATION_NOT_FOUND",
      });
    }
    if (Number(application.freelancer_user_id) !== fid) {
      throw createAppError("لا يمكنك تسليم مقال لهذا الطلب.", 403, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_NOT_ALLOWED,
      });
    }
    if (!ARTICLE_APPLICATION_STATUSES_CAN_SUBMIT_MANUSCRIPT.includes(String(application.status))) {
      throw createAppError("تسليم المقال متاح بعد اختيارك فقط.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_NOT_ALLOWED,
      });
    }

    const cleanTitle = sanitizeText(title, ARTICLE_SUBMISSION_TITLE_MAX);
    const cleanContent = sanitizeText(content, ARTICLE_SUBMISSION_CONTENT_MAX);
    if (cleanTitle.length < ARTICLE_SUBMISSION_TITLE_MIN) {
      throw createAppError("عنوان المقال النهائي مطلوب.", 400, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_INVALID,
      });
    }
    if (cleanContent.length < ARTICLE_SUBMISSION_CONTENT_MIN_CHARS) {
      throw createAppError("محتوى المقال النهائي مطلوب.", 400, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_INVALID,
      });
    }
    const requiredWords = Number(application.required_word_count) || 0;
    if (requiredWords > 0 && countWords(cleanContent) < requiredWords) {
      throw createAppError(`يجب ألا يقل المقال عن ${requiredWords} كلمة.`, 400, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_INVALID,
      });
    }

    const existing = await getSubmissionByApplicationId(appId, client);
    if (existing && String(existing.status) === "approved") {
      throw createAppError("تم اعتماد المقال ولا يمكن تعديله.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_NOT_ALLOWED,
      });
    }
    if (existing && String(existing.status) === "rejected") {
      throw createAppError("لا يمكن إعادة التسليم بعد الرفض.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_NOT_ALLOWED,
      });
    }

    let row;
    const terms = termsWriteValues({
      freelancerUserId: fid,
      articleId: application.article_id,
      applicationId: appId,
      requestMeta,
    });
    if (existing) {
      try {
        const { rows } = await client.query(
          `UPDATE marketplace_article_submissions
              SET title = $2,
                  content = $3,
                  status = 'submitted',
                  reviewer_notes = NULL,
                  submitted_at = NOW(),
                  reviewed_at = NULL,
                  reviewed_by_user_id = NULL,
                  terms_version = $4,
                  terms_accepted_at = $5::timestamptz,
                  terms_accepted_ip = $6,
                  terms_accepted_user_agent = $7,
                  terms_snapshot_key = $8,
                  terms_text_snapshot = $9,
                  updated_at = NOW()
            WHERE application_id = $1
            RETURNING *`,
          [
            appId,
            cleanTitle,
            cleanContent,
            terms.version,
            terms.acceptedAt,
            terms.ip,
            terms.userAgent,
            terms.snapshotKey,
            terms.textSnapshot,
          ],
        );
        row = rows[0];
      } catch (err) {
        if (!isMissingSchema(err)) throw err;
        const { rows } = await client.query(
          `UPDATE marketplace_article_submissions
              SET title = $2,
                  content = $3,
                  status = 'submitted',
                  reviewer_notes = NULL,
                  submitted_at = NOW(),
                  reviewed_at = NULL,
                  reviewed_by_user_id = NULL,
                  updated_at = NOW()
            WHERE application_id = $1
            RETURNING *`,
          [appId, cleanTitle, cleanContent],
        );
        row = rows[0];
      }
    } else {
      try {
        const { rows } = await client.query(
          `INSERT INTO marketplace_article_submissions (
             application_id, article_id, freelancer_user_id, title, content, status,
             terms_version, terms_accepted_at, terms_accepted_ip, terms_accepted_user_agent,
             terms_snapshot_key, terms_text_snapshot
           ) VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7::timestamptz,$8,$9,$10,$11)
           RETURNING *`,
          [
            appId,
            application.article_id,
            fid,
            cleanTitle,
            cleanContent,
            terms.version,
            terms.acceptedAt,
            terms.ip,
            terms.userAgent,
            terms.snapshotKey,
            terms.textSnapshot,
          ],
        );
        row = rows[0];
      } catch (err) {
        if (!isMissingSchema(err)) throw err;
        const { rows } = await client.query(
          `INSERT INTO marketplace_article_submissions (
             application_id, article_id, freelancer_user_id, title, content, status
           ) VALUES ($1,$2,$3,$4,$5,'submitted')
           RETURNING *`,
          [appId, application.article_id, fid, cleanTitle, cleanContent],
        );
        row = rows[0];
      }
    }

    if (String(application.status) !== "submitted" && String(application.status) !== "approved") {
      await client.query(
        `UPDATE marketplace_article_applications
            SET status = 'submitted', updated_at = NOW()
          WHERE id = $1
            AND status IN ('selected', 'assigned', 'writing', 'under_review', 'revision_requested')`,
        [appId],
      );
    }

    if (ownsClient) await client.query("COMMIT");
    return { submission: mapSubmissionRow(row), created: !existing };
  } catch (err) {
    if (ownsClient) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

async function requestArticleSubmissionRevision({
  applicationId,
  actorUserId,
  reviewerNotes,
} = {}) {
  if (!(await marketplaceArticleSubmissionsSchemaReady())) {
    throw createAppError("تسليم المقال النهائي غير جاهز.", 503, {
      exposeToClient: true,
      publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_SCHEMA_NOT_READY,
    });
  }
  const notes = sanitizeText(reviewerNotes, 2000) || null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: appRows } = await client.query(
      `SELECT * FROM marketplace_article_applications WHERE id = $1 FOR UPDATE`,
      [Number(applicationId)],
    );
    const application = appRows[0];
    if (!application) {
      throw createAppError("الطلب غير موجود.", 404, {
        exposeToClient: true,
        publicCode: "ARTICLE_APPLICATION_NOT_FOUND",
      });
    }
    if (String(application.status) === "approved") {
      throw createAppError("لا يمكن طلب تعديل بعد الاعتماد.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_NOT_REVISABLE,
      });
    }
    const existing = await getSubmissionByApplicationId(applicationId, client);
    if (!existing || String(existing.status) !== "submitted") {
      throw createAppError("لا يوجد مقال نهائي مقدّم لطلب التعديل.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_NOT_REVISABLE,
      });
    }
    const { rows } = await client.query(
      `UPDATE marketplace_article_submissions
          SET status = 'revision_requested',
              reviewer_notes = $2,
              reviewed_at = NOW(),
              reviewed_by_user_id = $3,
              updated_at = NOW()
        WHERE application_id = $1
        RETURNING *`,
      [Number(applicationId), notes, actorUserId ? Number(actorUserId) : null],
    );
    await client.query(
      `UPDATE marketplace_article_applications
          SET status = 'revision_requested', updated_at = NOW()
        WHERE id = $1 AND status <> 'approved'`,
      [Number(applicationId)],
    );
    await client.query("COMMIT");
    return { submission: mapSubmissionRow(rows[0], { forAdmin: true }) };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  mapSubmissionRow,
  getSubmissionByApplicationId,
  listSubmissionsForArticle,
  attachSubmissionsToApplications,
  assertSubmittedManuscriptForApproval,
  markSubmissionApproved,
  submitFinalArticleManuscript,
  requestArticleSubmissionRevision,
  assertManuscriptTermsAccepted,
  termsWriteValues,
};
