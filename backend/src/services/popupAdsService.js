const { pool } = require("../config/db");
const { sanitizeOptionalUrl } = require("../utils/adsSanitize");

const TITLE_MAX = 200;
const BODY_MAX = 2000;
const CTA_TEXT_MAX = 120;

const AUDIENCES = new Set(["all", "guests", "freelancer", "client", "staff"]);
const PAGE_SCOPES = new Set(["all", "home", "public", "dashboard"]);
const FREQUENCIES = new Set(["every_visit", "session", "day"]);
const STAFF_ROLES = new Set(["admin", "super_admin"]);

function trimText(value, max) {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    enabled: Boolean(row.enabled),
    titleAr: row.titleAr || "",
    titleEn: row.titleEn || "",
    bodyAr: row.bodyAr || "",
    bodyEn: row.bodyEn || "",
    imageUrl: row.imageUrl || null,
    ctaText: row.ctaText || null,
    ctaUrl: row.ctaUrl || null,
    openInNewTab: Boolean(row.openInNewTab),
    audience: row.audience,
    pageScope: row.pageScope,
    frequency: row.frequency,
    sortOrder: Number(row.sortOrder) || 0,
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    impressionCount: Number(row.impressionCount) || 0,
    clickCount: Number(row.clickCount) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicAd(ad) {
  if (!ad) return null;
  return {
    id: ad.id,
    titleAr: ad.titleAr,
    titleEn: ad.titleEn || "",
    bodyAr: ad.bodyAr || "",
    bodyEn: ad.bodyEn || "",
    imageUrl: ad.imageUrl,
    ctaText: ad.ctaText,
    ctaUrl: ad.ctaUrl,
    openInNewTab: ad.openInNewTab,
    frequency: ad.frequency,
    audience: ad.audience,
    pageScope: ad.pageScope,
  };
}

const ADMIN_SELECT = `
  SELECT id,
         enabled,
         title_ar AS "titleAr",
         title_en AS "titleEn",
         body_ar AS "bodyAr",
         body_en AS "bodyEn",
         image_url AS "imageUrl",
         cta_text AS "ctaText",
         cta_url AS "ctaUrl",
         open_in_new_tab AS "openInNewTab",
         audience,
         page_scope AS "pageScope",
         frequency,
         sort_order AS "sortOrder",
         start_date AS "startDate",
         end_date AS "endDate",
         impression_count AS "impressionCount",
         click_count AS "clickCount",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
  FROM popup_ads
`;

function hasTitle(ad) {
  return Boolean(ad?.titleAr || ad?.titleEn);
}

function isWithinSchedule(ad, now = new Date()) {
  const sd = ad.startDate ? new Date(ad.startDate) : null;
  const ed = ad.endDate ? new Date(ad.endDate) : null;
  if (sd && !Number.isNaN(sd.getTime()) && sd > now) return false;
  if (ed && !Number.isNaN(ed.getTime()) && ed < now) return false;
  return true;
}

function matchesAudience(ad, { role, isAuthenticated }) {
  switch (ad.audience) {
    case "guests":
      return !isAuthenticated;
    case "freelancer":
      return role === "freelancer";
    case "client":
      return role === "client";
    case "staff":
      return STAFF_ROLES.has(role);
    case "all":
    default:
      return true;
  }
}

function normalizePathname(pathname) {
  const raw = String(pathname || "/").trim();
  if (!raw || raw === "") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function isClientFreelancerDashboardPath(pathname) {
  const path = normalizePathname(pathname);
  return path.startsWith("/dashboard/client") || path.startsWith("/dashboard/freelancer");
}

function matchesPageScope(ad, pathname) {
  const path = normalizePathname(pathname);
  switch (ad.pageScope) {
    case "home":
      return path === "/";
    case "public":
      return !path.startsWith("/dashboard");
    case "dashboard":
      return isClientFreelancerDashboardPath(path);
    case "all":
    default:
      return true;
  }
}

function normalizeInput(body = {}) {
  return {
    enabled: Boolean(body.enabled),
    titleAr: trimText(body.titleAr ?? body.title_ar, TITLE_MAX),
    titleEn: trimText(body.titleEn ?? body.title_en, TITLE_MAX),
    bodyAr: trimText(body.bodyAr ?? body.body_ar, BODY_MAX),
    bodyEn: trimText(body.bodyEn ?? body.body_en, BODY_MAX),
    imageUrl: body.imageUrl !== undefined ? sanitizeOptionalUrl(body.imageUrl) : null,
    ctaText: body.ctaText !== undefined ? trimText(body.ctaText, CTA_TEXT_MAX) || null : null,
    ctaUrl: body.ctaUrl !== undefined ? sanitizeOptionalUrl(body.ctaUrl) : null,
    openInNewTab: Boolean(body.openInNewTab ?? body.open_in_new_tab),
    audience: AUDIENCES.has(body.audience) ? body.audience : "all",
    pageScope: PAGE_SCOPES.has(body.pageScope ?? body.page_scope) ? body.pageScope ?? body.page_scope : "all",
    frequency: FREQUENCIES.has(body.frequency) ? body.frequency : "session",
    sortOrder:
      body.sortOrder !== undefined || body.sort_order !== undefined
        ? Math.max(0, Number(body.sortOrder ?? body.sort_order) || 0)
        : 0,
    startDate: body.startDate !== undefined ? body.startDate || null : undefined,
    endDate: body.endDate !== undefined ? body.endDate || null : undefined,
  };
}

function validateInput(input, { rawCtaUrl, rawImageUrl } = {}) {
  const errors = {};
  if (!input.titleAr && !input.titleEn) {
    errors.titleAr = "أدخل عنواناً بالعربية أو الإنجليزية على الأقل.";
  }
  if (input.titleAr && input.titleAr.length > TITLE_MAX) {
    errors.titleAr = `العنوان العربي يجب ألا يتجاوز ${TITLE_MAX} حرفاً.`;
  }
  if (input.titleEn && input.titleEn.length > TITLE_MAX) {
    errors.titleEn = `العنوان الإنجليزي يجب ألا يتجاوز ${TITLE_MAX} حرفاً.`;
  }
  if (rawCtaUrl !== undefined) {
    const trimmed = String(rawCtaUrl || "").trim();
    if (trimmed && !input.ctaUrl) {
      errors.ctaUrl = "رابط الزر غير صالح.";
    }
  }
  if (rawImageUrl !== undefined) {
    const trimmed = String(rawImageUrl || "").trim();
    if (trimmed && !input.imageUrl) {
      errors.imageUrl = "رابط الصورة غير صالح.";
    }
  }
  if (input.ctaText && !input.ctaUrl) {
    errors.ctaUrl = "أدخل رابطاً للزر أو احذف نص الزر.";
  }
  if (input.ctaUrl && !input.ctaText) {
    errors.ctaText = "أدخل نص الزر عند إضافة رابط.";
  }
  return errors;
}

async function listForAdmin() {
  const { rows } = await pool.query(`${ADMIN_SELECT} ORDER BY sort_order ASC, updated_at DESC, id DESC`);
  return rows.map(mapRow);
}

async function getByIdForAdmin(id) {
  const { rows } = await pool.query(`${ADMIN_SELECT} WHERE id = $1 LIMIT 1`, [id]);
  return mapRow(rows[0]);
}

async function createAd(body) {
  const input = normalizeInput(body);
  const fieldErrors = validateInput(input, {
    rawCtaUrl: body?.ctaUrl,
    rawImageUrl: body?.imageUrl,
  });
  if (Object.keys(fieldErrors).length > 0) {
    const err = new Error("Validation failed");
    err.status = 400;
    err.fieldErrors = fieldErrors;
    throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO popup_ads (
       enabled, title_ar, title_en, body_ar, body_en,
       image_url, cta_text, cta_url, open_in_new_tab,
       audience, page_scope, frequency, sort_order,
       start_date, end_date, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
     RETURNING id`,
    [
      input.enabled,
      input.titleAr,
      input.titleEn || null,
      input.bodyAr || null,
      input.bodyEn || null,
      input.imageUrl,
      input.ctaText,
      input.ctaUrl,
      input.openInNewTab,
      input.audience,
      input.pageScope,
      input.frequency,
      input.sortOrder,
      input.startDate ?? null,
      input.endDate ?? null,
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
    titleAr: body.titleAr !== undefined ? body.titleAr : existing.titleAr,
    titleEn: body.titleEn !== undefined ? body.titleEn : existing.titleEn,
    bodyAr: body.bodyAr !== undefined ? body.bodyAr : existing.bodyAr,
    bodyEn: body.bodyEn !== undefined ? body.bodyEn : existing.bodyEn,
    imageUrl: body.imageUrl !== undefined ? body.imageUrl : existing.imageUrl,
    ctaText: body.ctaText !== undefined ? body.ctaText : existing.ctaText,
    ctaUrl: body.ctaUrl !== undefined ? body.ctaUrl : existing.ctaUrl,
    openInNewTab: body.openInNewTab !== undefined ? body.openInNewTab : existing.openInNewTab,
    audience: body.audience !== undefined ? body.audience : existing.audience,
    pageScope: body.pageScope !== undefined ? body.pageScope : existing.pageScope,
    frequency: body.frequency !== undefined ? body.frequency : existing.frequency,
    sortOrder: body.sortOrder !== undefined ? body.sortOrder : existing.sortOrder,
    startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
    endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
  });

  const fieldErrors = validateInput(input, {
    rawCtaUrl: body.ctaUrl !== undefined ? body.ctaUrl : undefined,
    rawImageUrl: body.imageUrl !== undefined ? body.imageUrl : undefined,
  });
  if (Object.keys(fieldErrors).length > 0) {
    const err = new Error("Validation failed");
    err.status = 400;
    err.fieldErrors = fieldErrors;
    throw err;
  }

  await pool.query(
    `UPDATE popup_ads
     SET enabled = $2,
         title_ar = $3,
         title_en = $4,
         body_ar = $5,
         body_en = $6,
         image_url = $7,
         cta_text = $8,
         cta_url = $9,
         open_in_new_tab = $10,
         audience = $11,
         page_scope = $12,
         frequency = $13,
         sort_order = $14,
         start_date = $15,
         end_date = $16,
         updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      input.enabled,
      input.titleAr,
      input.titleEn || null,
      input.bodyAr || null,
      input.bodyEn || null,
      input.imageUrl,
      input.ctaText,
      input.ctaUrl,
      input.openInNewTab,
      input.audience,
      input.pageScope,
      input.frequency,
      input.sortOrder,
      input.startDate ?? null,
      input.endDate ?? null,
    ],
  );
  return getByIdForAdmin(id);
}

async function deleteAd(id) {
  const { rowCount } = await pool.query(`DELETE FROM popup_ads WHERE id = $1`, [id]);
  if (!rowCount) {
    const err = new Error("Ad not found");
    err.status = 404;
    throw err;
  }
  return { deleted: true };
}

async function listPublicActive({ pathname = "/", role = null, isAuthenticated = false }) {
  const { rows } = await pool.query(
    `${ADMIN_SELECT}
     WHERE enabled = TRUE
       AND (title_ar <> '' OR COALESCE(title_en, '') <> '')
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
     ORDER BY sort_order ASC, updated_at DESC, id DESC`,
  );

  const now = new Date();
  return rows
    .map(mapRow)
    .filter((ad) => hasTitle(ad) && isWithinSchedule(ad, now))
    .filter((ad) => matchesAudience(ad, { role, isAuthenticated }))
    .filter((ad) => matchesPageScope(ad, pathname))
    .map(toPublicAd);
}

async function incrementImpression(id) {
  await pool.query(
    `UPDATE popup_ads SET impression_count = impression_count + 1, updated_at = updated_at WHERE id = $1`,
    [id],
  );
}

async function incrementClick(id) {
  await pool.query(
    `UPDATE popup_ads SET click_count = click_count + 1, updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

async function isPublicActiveId(id) {
  const ad = await getByIdForAdmin(id);
  if (!ad || !ad.enabled || !hasTitle(ad) || !isWithinSchedule(ad)) return false;
  return true;
}

module.exports = {
  TITLE_MAX,
  BODY_MAX,
  CTA_TEXT_MAX,
  listForAdmin,
  getByIdForAdmin,
  createAd,
  updateAd,
  deleteAd,
  listPublicActive,
  incrementImpression,
  incrementClick,
  isPublicActiveId,
  matchesAudience,
  matchesPageScope,
};
