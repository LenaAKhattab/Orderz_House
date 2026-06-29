const { pool } = require("../config/db");
const { sanitizeOptionalUrl } = require("../utils/adsSanitize");

const TEXT_MAX = 200;
const DIRECTIONS = new Set(["vertical", "horizontal"]);
const SPEEDS = new Set(["slow", "normal", "fast"]);
const PLACEMENTS = new Set(["courses_list", "all_course_details", "both", "specific_course"]);
const TEXT_COLORS = new Set(["blue", "black", "red"]);

function trimText(value, max) {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    enabled: Boolean(row.enabled),
    textAr: row.textAr || "",
    textEn: row.textEn || "",
    url: row.url || null,
    placement: row.placement,
    courseId: row.courseId != null ? Number(row.courseId) : null,
    courseTitle: row.courseTitle || null,
    direction: row.direction,
    speed: row.speed,
    textColor: TEXT_COLORS.has(row.textColor) ? row.textColor : "blue",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hasDisplayText(ad) {
  return Boolean(ad?.textAr || ad?.textEn);
}

function toPublicAd(ad) {
  if (!ad || !ad.enabled || !hasDisplayText(ad)) return null;
  return {
    enabled: true,
    textAr: ad.textAr,
    textEn: ad.textEn || "",
    url: ad.url,
    direction: ad.direction,
    speed: ad.speed,
    textColor: TEXT_COLORS.has(ad.textColor) ? ad.textColor : "blue",
    placement: ad.placement,
    courseId: ad.courseId,
  };
}

const ADMIN_SELECT = `
  SELECT a.id,
         a.enabled,
         a.text_ar AS "textAr",
         a.text_en AS "textEn",
         a.url,
         a.placement,
         a.course_id AS "courseId",
         c.title AS "courseTitle",
         a.direction,
         a.speed,
         a.text_color AS "textColor",
         a.created_at AS "createdAt",
         a.updated_at AS "updatedAt"
  FROM course_text_ads a
  LEFT JOIN courses c ON c.id = a.course_id
`;

function normalizeInput(body = {}) {
  const placement = PLACEMENTS.has(body.placement) ? body.placement : "both";
  const courseIdRaw = body.courseId ?? body.course_id;
  const courseId =
    placement === "specific_course" && courseIdRaw != null && String(courseIdRaw).trim() !== ""
      ? Number(courseIdRaw)
      : null;

  return {
    enabled: Boolean(body.enabled),
    textAr: trimText(body.textAr ?? body.text_ar, TEXT_MAX),
    textEn: trimText(body.textEn ?? body.text_en, TEXT_MAX),
    url: body.url !== undefined ? sanitizeOptionalUrl(body.url) : null,
    placement,
    courseId: placement === "specific_course" ? courseId : null,
    direction: DIRECTIONS.has(body.direction) ? body.direction : "vertical",
    speed: SPEEDS.has(body.speed) ? body.speed : "normal",
    textColor: TEXT_COLORS.has(body.textColor ?? body.text_color) ? (body.textColor ?? body.text_color) : "blue",
  };
}

function validateInput(input, { rawUrl } = {}) {
  const errors = {};
  if (!input.textAr && !input.textEn) {
    errors.textAr = "أدخل نصاً بالعربية أو الإنجليزية على الأقل.";
  }
  if (input.textAr && input.textAr.length > TEXT_MAX) {
    errors.textAr = `النص العربي يجب ألا يتجاوز ${TEXT_MAX} حرفاً.`;
  }
  if (input.textEn && input.textEn.length > TEXT_MAX) {
    errors.textEn = `النص الإنجليزي يجب ألا يتجاوز ${TEXT_MAX} حرفاً.`;
  }
  if (rawUrl !== undefined) {
    const trimmed = String(rawUrl || "").trim();
    if (trimmed && !input.url) {
      errors.url = "الرابط غير صالح.";
    }
  }
  if (!PLACEMENTS.has(input.placement)) {
    errors.placement = "خيار الظهور غير صالح.";
  }
  if (input.placement === "specific_course") {
    if (!Number.isFinite(input.courseId) || input.courseId <= 0) {
      errors.courseId = "اختر دورة محددة.";
    }
  } else if (input.courseId != null) {
    errors.courseId = "لا يمكن ربط دورة إلا مع خيار «دورة محددة».";
  }
  if (!TEXT_COLORS.has(input.textColor)) {
    errors.textColor = "لون النص غير صالح.";
  }
  return errors;
}

async function assertCourseExists(courseId) {
  const { rows } = await pool.query(`SELECT id FROM courses WHERE id = $1 LIMIT 1`, [courseId]);
  if (!rows.length) {
    const err = new Error("Course not found");
    err.status = 404;
    throw err;
  }
}

async function listForAdmin() {
  const { rows } = await pool.query(`${ADMIN_SELECT} ORDER BY a.updated_at DESC, a.id DESC`);
  return rows.map(mapRow);
}

async function getByIdForAdmin(id) {
  const { rows } = await pool.query(`${ADMIN_SELECT} WHERE a.id = $1 LIMIT 1`, [id]);
  return mapRow(rows[0]);
}

async function createAd(body) {
  const input = normalizeInput(body);
  const fieldErrors = validateInput(input, { rawUrl: body?.url });
  if (Object.keys(fieldErrors).length > 0) {
    const err = new Error("Validation failed");
    err.status = 400;
    err.fieldErrors = fieldErrors;
    throw err;
  }
  if (input.placement === "specific_course") {
    await assertCourseExists(input.courseId);
  }

  const { rows } = await pool.query(
    `INSERT INTO course_text_ads (
       enabled, text_ar, text_en, url, placement, course_id, direction, speed, text_color, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING id`,
    [
      input.enabled,
      input.textAr,
      input.textEn || null,
      input.url,
      input.placement,
      input.courseId,
      input.direction,
      input.speed,
      input.textColor,
    ],
  );
  return getByIdForAdmin(rows[0].id);
}

async function updateAd(id, body) {
  const existing = await getByIdForAdmin(id);
  if (!existing) {
    const err = new Error("Ad not found");
    err.status = 404;
    throw err;
  }

  const input = normalizeInput({
    enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
    textAr: body.textAr !== undefined ? body.textAr : existing.textAr,
    textEn: body.textEn !== undefined ? body.textEn : existing.textEn,
    url: body.url !== undefined ? body.url : existing.url,
    placement: body.placement !== undefined ? body.placement : existing.placement,
    courseId: body.courseId !== undefined ? body.courseId : existing.courseId,
    direction: body.direction !== undefined ? body.direction : existing.direction,
    speed: body.speed !== undefined ? body.speed : existing.speed,
    textColor: body.textColor !== undefined ? body.textColor : existing.textColor,
  });

  const fieldErrors = validateInput(input, {
    rawUrl: body.url !== undefined ? body.url : undefined,
  });
  if (Object.keys(fieldErrors).length > 0) {
    const err = new Error("Validation failed");
    err.status = 400;
    err.fieldErrors = fieldErrors;
    throw err;
  }
  if (input.placement === "specific_course") {
    await assertCourseExists(input.courseId);
  }

  await pool.query(
    `UPDATE course_text_ads
     SET enabled = $2,
         text_ar = $3,
         text_en = $4,
         url = $5,
         placement = $6,
         course_id = $7,
         direction = $8,
         speed = $9,
         text_color = $10,
         updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      input.enabled,
      input.textAr,
      input.textEn || null,
      input.url,
      input.placement,
      input.courseId,
      input.direction,
      input.speed,
      input.textColor,
    ],
  );
  return getByIdForAdmin(id);
}

async function deleteAd(id) {
  const { rowCount } = await pool.query(`DELETE FROM course_text_ads WHERE id = $1`, [id]);
  if (!rowCount) {
    const err = new Error("Ad not found");
    err.status = 404;
    throw err;
  }
  return { deleted: true };
}

async function pickForCoursesList() {
  const { rows } = await pool.query(
    `${ADMIN_SELECT}
     WHERE a.enabled = TRUE
       AND (a.text_ar <> '' OR COALESCE(a.text_en, '') <> '')
       AND a.placement IN ('courses_list', 'both')
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT 1`,
  );
  return toPublicAd(mapRow(rows[0]));
}

async function pickForCourseDetails(courseId) {
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return null;
  }

  const specific = await pool.query(
    `${ADMIN_SELECT}
     WHERE a.enabled = TRUE
       AND (a.text_ar <> '' OR COALESCE(a.text_en, '') <> '')
       AND a.placement = 'specific_course'
       AND a.course_id = $1
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT 1`,
    [cid],
  );
  const specificAd = toPublicAd(mapRow(specific.rows[0]));
  if (specificAd) return specificAd;

  const general = await pool.query(
    `${ADMIN_SELECT}
     WHERE a.enabled = TRUE
       AND (a.text_ar <> '' OR COALESCE(a.text_en, '') <> '')
       AND a.placement IN ('all_course_details', 'both')
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT 1`,
  );
  return toPublicAd(mapRow(general.rows[0]));
}

async function getFreelancerDisplayAd({ context, courseId }) {
  if (context === "courses_list") {
    const ad = await pickForCoursesList();
    return ad || { enabled: false };
  }
  if (context === "course_details") {
    const ad = await pickForCourseDetails(courseId);
    return ad || { enabled: false };
  }
  const err = new Error("Invalid context");
  err.status = 400;
  throw err;
}

module.exports = {
  TEXT_MAX,
  listForAdmin,
  getByIdForAdmin,
  createAd,
  updateAd,
  deleteAd,
  getFreelancerDisplayAd,
};
