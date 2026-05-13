const { pool } = require("../config/db");
const {
  escapeHtml,
  sanitizeOptionalUrl,
  sanitizeOptionalColor,
  sanitizeTextsArray,
  sanitizeImagesArray,
} = require("../utils/adsSanitize");

/** Migration 053 may not have run; INSERT/UPDATE expect these columns. Safe no-op when already present. */
let contentAdsFeaturedColumnsEnsured = false;
async function ensureContentAdsFeaturedColumns() {
  if (contentAdsFeaturedColumnsEnsured) return;
  await pool.query(`
    ALTER TABLE content_ads
      ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS theme_preset VARCHAR(16) NULL;
  `);
  contentAdsFeaturedColumnsEnsured = true;
}

const PLACEMENTS = new Set(["home_right_panel", "home_after_hero", "services_page", "global_sidebar"]);
const THEME_PRESETS = new Set(["purple", "green", "orange", "blue"]);
const LAYOUT_TYPES = new Set([
  "image_top",
  "image_background",
  "text_only",
  "split",
  "minimal_banner",
  "carousel",
]);

function coerceDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const dt = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function mapRow(row) {
  if (!row) return null;
  let texts = row.texts;
  let images = row.images;
  if (typeof texts === "string") {
    try {
      texts = JSON.parse(texts);
    } catch {
      texts = [];
    }
  }
  if (typeof images === "string") {
    try {
      images = JSON.parse(images);
    } catch {
      images = [];
    }
  }
  return {
    id: String(row.id),
    title: row.title,
    subtitle: row.subtitle || null,
    description: row.description || null,
    badgeText: row.badge_text || null,
    badgeColor: row.badge_color || null,
    texts: Array.isArray(texts) ? texts : [],
    images: Array.isArray(images) ? images : [],
    ctaText: row.cta_text || null,
    ctaUrl: row.cta_url || null,
    secondaryCtaText: row.secondary_cta_text || null,
    secondaryCtaUrl: row.secondary_cta_url || null,
    openInNewTab: Boolean(row.open_in_new_tab),
    backgroundColor: row.background_color || null,
    gradientFrom: row.gradient_from || null,
    gradientTo: row.gradient_to || null,
    titleColor: row.title_color || null,
    textColor: row.text_color || null,
    buttonColor: row.button_color || null,
    buttonTextColor: row.button_text_color || null,
    borderColor: row.border_color || null,
    layoutType: row.layout_type,
    textAlign: row.text_align,
    imagePosition: row.image_position,
    buttonPosition: row.button_position,
    isActive: Boolean(row.is_active),
    isSticky: Boolean(row.is_sticky),
    isClickableCard: Boolean(row.is_clickable_card),
    placement: row.placement,
    sortOrder: Number(row.sort_order) || 0,
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    impressionCount: Number(row.impression_count) || 0,
    clickCount: Number(row.click_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isFeatured: Boolean(row.is_featured),
    themePreset: row.theme_preset && THEME_PRESETS.has(String(row.theme_preset)) ? String(row.theme_preset) : null,
  };
}

function normalizePayload(body, { partial = false } = {}) {
  const src = body && typeof body === "object" ? body : {};
  const out = {};

  if (!partial || "title" in src) {
    out.title = escapeHtml(src.title != null ? String(src.title) : "").slice(0, 500);
  }
  if (!partial || "subtitle" in src) {
    out.subtitle = src.subtitle != null ? escapeHtml(String(src.subtitle)).slice(0, 2000) : null;
  }
  if (!partial || "description" in src) {
    out.description = src.description != null ? escapeHtml(String(src.description)).slice(0, 8000) : null;
  }
  if (!partial || "badgeText" in src) {
    out.badgeText = src.badgeText != null ? escapeHtml(String(src.badgeText)).slice(0, 200) : null;
  }
  if (!partial || "badgeColor" in src) {
    out.badgeColor = sanitizeOptionalColor(src.badgeColor);
  }
  if (!partial || "texts" in src) {
    out.texts = sanitizeTextsArray(src.texts);
  }
  if (!partial || "images" in src) {
    out.images = sanitizeImagesArray(src.images);
  }
  if (!partial || "ctaText" in src) {
    out.ctaText = src.ctaText != null ? escapeHtml(String(src.ctaText)).slice(0, 200) : null;
  }
  if (!partial || "ctaUrl" in src) {
    out.ctaUrl = sanitizeOptionalUrl(src.ctaUrl);
  }
  if (!partial || "secondaryCtaText" in src) {
    out.secondaryCtaText = src.secondaryCtaText != null ? escapeHtml(String(src.secondaryCtaText)).slice(0, 200) : null;
  }
  if (!partial || "secondaryCtaUrl" in src) {
    out.secondaryCtaUrl = sanitizeOptionalUrl(src.secondaryCtaUrl);
  }
  if (!partial || "openInNewTab" in src) {
    out.openInNewTab = Boolean(src.openInNewTab);
  }
  if (!partial || "backgroundColor" in src) {
    out.backgroundColor = sanitizeOptionalColor(src.backgroundColor);
  }
  if (!partial || "gradientFrom" in src) {
    out.gradientFrom = sanitizeOptionalColor(src.gradientFrom);
  }
  if (!partial || "gradientTo" in src) {
    out.gradientTo = sanitizeOptionalColor(src.gradientTo);
  }
  if (!partial || "titleColor" in src) {
    out.titleColor = sanitizeOptionalColor(src.titleColor);
  }
  if (!partial || "textColor" in src) {
    out.textColor = sanitizeOptionalColor(src.textColor);
  }
  if (!partial || "buttonColor" in src) {
    out.buttonColor = sanitizeOptionalColor(src.buttonColor);
  }
  if (!partial || "buttonTextColor" in src) {
    out.buttonTextColor = sanitizeOptionalColor(src.buttonTextColor);
  }
  if (!partial || "borderColor" in src) {
    out.borderColor = sanitizeOptionalColor(src.borderColor);
  }
  if (!partial || "layoutType" in src) {
    const lt = src.layoutType != null ? String(src.layoutType) : "image_top";
    out.layoutType = LAYOUT_TYPES.has(lt) ? lt : "image_top";
  }
  if (!partial || "textAlign" in src) {
    const ta = src.textAlign != null ? String(src.textAlign) : "right";
    out.textAlign = ["right", "center", "left"].includes(ta) ? ta : "right";
  }
  if (!partial || "imagePosition" in src) {
    const ip = src.imagePosition != null ? String(src.imagePosition) : "top";
    out.imagePosition = ["top", "bottom", "left", "right", "background"].includes(ip) ? ip : "top";
  }
  if (!partial || "buttonPosition" in src) {
    const bp = src.buttonPosition != null ? String(src.buttonPosition) : "bottom";
    out.buttonPosition = ["bottom", "inline", "overlay"].includes(bp) ? bp : "bottom";
  }
  if (!partial || "isActive" in src) {
    out.isActive = Boolean(src.isActive);
  }
  if (!partial || "isSticky" in src) {
    out.isSticky = Boolean(src.isSticky);
  }
  if (!partial || "isClickableCard" in src) {
    out.isClickableCard = Boolean(src.isClickableCard);
  }
  if (!partial || "placement" in src) {
    const p = src.placement != null ? String(src.placement) : "home_right_panel";
    out.placement = PLACEMENTS.has(p) ? p : "home_right_panel";
  }
  if (!partial || "sortOrder" in src) {
    const n = Number(src.sortOrder);
    out.sortOrder = Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  if (!partial || "startDate" in src) {
    out.startDate =
      src.startDate === null || src.startDate === undefined || src.startDate === ""
        ? null
        : coerceDate(src.startDate);
  }
  if (!partial || "endDate" in src) {
    out.endDate =
      src.endDate === null || src.endDate === undefined || src.endDate === ""
        ? null
        : coerceDate(src.endDate);
  }
  if (!partial || "isFeatured" in src) {
    out.isFeatured = Boolean(src.isFeatured);
  }
  if (!partial || "themePreset" in src) {
    const tp = src.themePreset != null ? String(src.themePreset).trim().toLowerCase() : "";
    out.themePreset = THEME_PRESETS.has(tp) ? tp : null;
  }

  return out;
}

function validateBusinessRules(payload, { partial = false } = {}) {
  const errors = [];
  const title = partial && payload.title === undefined ? " " : payload.title;
  if (!title || !String(title).trim()) {
    errors.push("العنوان مطلوب.");
  }

  const hasAnyContent =
    (payload.images && payload.images.length > 0) ||
    (payload.ctaUrl && String(payload.ctaUrl).trim()) ||
    (payload.description && String(payload.description).trim()) ||
    (payload.subtitle && String(payload.subtitle).trim()) ||
    (title && String(title).trim());

  if (!hasAnyContent) {
    errors.push("يجب إدخال عنوان أو وصف أو صورة أو رابط إجراء.");
  }

  const sd = coerceDate(payload.startDate);
  const ed = coerceDate(payload.endDate);
  if (sd && ed && ed < sd) {
    errors.push("تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ البداية.");
  }

  if (payload.layoutType === "image_background" && (!payload.images || payload.images.length === 0)) {
    errors.push("تخطيط صورة الخلفية يتطلب صورة واحدة على الأقل.");
  }

  return errors;
}

async function listPublicActive(placement) {
  const p = PLACEMENTS.has(String(placement)) ? String(placement) : "home_right_panel";
  const { rows } = await pool.query(
    `
    SELECT *
    FROM content_ads
    WHERE is_active = TRUE
      AND placement = $1::text
      AND (start_date IS NULL OR start_date <= NOW())
      AND (end_date IS NULL OR end_date >= NOW())
    ORDER BY sort_order ASC, created_at DESC
    `,
    [p],
  );
  return rows.map(mapRow);
}

async function listAllForAdmin() {
  await ensureContentAdsFeaturedColumns();
  const { rows } = await pool.query(
    `
    SELECT *
    FROM content_ads
    ORDER BY placement ASC, sort_order ASC, created_at DESC
    `,
  );
  return rows.map(mapRow);
}

async function getById(id) {
  await ensureContentAdsFeaturedColumns();
  const { rows } = await pool.query(`SELECT * FROM content_ads WHERE id = $1::bigint LIMIT 1`, [id]);
  return mapRow(rows[0]);
}

async function createAd(body) {
  await ensureContentAdsFeaturedColumns();
  const payload = normalizePayload(body, { partial: false });
  const errs = validateBusinessRules(payload, { partial: false });
  if (errs.length) {
    const err = new Error(errs[0]);
    err.code = "ADS_VALIDATION";
    err.details = errs;
    throw err;
  }

  const { rows } = await pool.query(
    `
    INSERT INTO content_ads (
      title, subtitle, description, badge_text, badge_color,
      texts, images,
      cta_text, cta_url, secondary_cta_text, secondary_cta_url, open_in_new_tab,
      background_color, gradient_from, gradient_to,
      title_color, text_color, button_color, button_text_color, border_color,
      layout_type, text_align, image_position, button_position,
      is_active, is_sticky, is_clickable_card,
      placement, sort_order, start_date, end_date,
      is_featured, theme_preset
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6::jsonb,$7::jsonb,
      $8,$9,$10,$11,$12,
      $13,$14,$15,
      $16,$17,$18,$19,$20,
      $21,$22,$23,$24,
      $25,$26,$27,
      $28,$29,$30,$31,
      $32,$33
    )
    RETURNING *
    `,
    [
      payload.title,
      payload.subtitle,
      payload.description,
      payload.badgeText,
      payload.badgeColor,
      JSON.stringify(payload.texts),
      JSON.stringify(payload.images),
      payload.ctaText,
      payload.ctaUrl,
      payload.secondaryCtaText,
      payload.secondaryCtaUrl,
      payload.openInNewTab,
      payload.backgroundColor,
      payload.gradientFrom,
      payload.gradientTo,
      payload.titleColor,
      payload.textColor,
      payload.buttonColor,
      payload.buttonTextColor,
      payload.borderColor,
      payload.layoutType,
      payload.textAlign,
      payload.imagePosition,
      payload.buttonPosition,
      payload.isActive,
      payload.isSticky,
      payload.isClickableCard,
      payload.placement,
      payload.sortOrder,
      coerceDate(payload.startDate),
      coerceDate(payload.endDate),
      payload.isFeatured,
      payload.themePreset,
    ],
  );
  return mapRow(rows[0]);
}

async function updateAd(id, body) {
  await ensureContentAdsFeaturedColumns();
  const existing = await getById(id);
  if (!existing) return null;
  const patch = normalizePayload(body, { partial: true });
  const merged = {
    ...existing,
    ...patch,
    texts: patch.texts !== undefined ? patch.texts : existing.texts,
    images: patch.images !== undefined ? patch.images : existing.images,
    startDate: patch.startDate !== undefined ? patch.startDate : coerceDate(existing.startDate),
    endDate: patch.endDate !== undefined ? patch.endDate : coerceDate(existing.endDate),
    isFeatured: patch.isFeatured !== undefined ? patch.isFeatured : existing.isFeatured,
    themePreset: patch.themePreset !== undefined ? patch.themePreset : existing.themePreset,
  };
  const normalized = normalizePayload(merged, { partial: false });
  const errs = validateBusinessRules(normalized, { partial: false });
  if (errs.length) {
    const err = new Error(errs[0]);
    err.code = "ADS_VALIDATION";
    err.details = errs;
    throw err;
  }

  await pool.query(
    `
    UPDATE content_ads SET
      title = $2,
      subtitle = $3,
      description = $4,
      badge_text = $5,
      badge_color = $6,
      texts = $7::jsonb,
      images = $8::jsonb,
      cta_text = $9,
      cta_url = $10,
      secondary_cta_text = $11,
      secondary_cta_url = $12,
      open_in_new_tab = $13,
      background_color = $14,
      gradient_from = $15,
      gradient_to = $16,
      title_color = $17,
      text_color = $18,
      button_color = $19,
      button_text_color = $20,
      border_color = $21,
      layout_type = $22,
      text_align = $23,
      image_position = $24,
      button_position = $25,
      is_active = $26,
      is_sticky = $27,
      is_clickable_card = $28,
      placement = $29,
      sort_order = $30,
      start_date = $31,
      end_date = $32,
      is_featured = $33,
      theme_preset = $34,
      updated_at = NOW()
    WHERE id = $1::bigint
    `,
    [
      id,
      normalized.title,
      normalized.subtitle,
      normalized.description,
      normalized.badgeText,
      normalized.badgeColor,
      JSON.stringify(normalized.texts),
      JSON.stringify(normalized.images),
      normalized.ctaText,
      normalized.ctaUrl,
      normalized.secondaryCtaText,
      normalized.secondaryCtaUrl,
      normalized.openInNewTab,
      normalized.backgroundColor,
      normalized.gradientFrom,
      normalized.gradientTo,
      normalized.titleColor,
      normalized.textColor,
      normalized.buttonColor,
      normalized.buttonTextColor,
      normalized.borderColor,
      normalized.layoutType,
      normalized.textAlign,
      normalized.imagePosition,
      normalized.buttonPosition,
      normalized.isActive,
      normalized.isSticky,
      normalized.isClickableCard,
      normalized.placement,
      normalized.sortOrder,
      coerceDate(normalized.startDate),
      coerceDate(normalized.endDate),
      normalized.isFeatured,
      normalized.themePreset,
    ],
  );
  return getById(id);
}

async function deleteAd(id) {
  const { rowCount } = await pool.query(`DELETE FROM content_ads WHERE id = $1::bigint`, [id]);
  return rowCount > 0;
}

async function duplicateAd(id) {
  const row = await getById(id);
  if (!row) return null;
  const body = {
    ...row,
    title: `${row.title} (نسخة)`,
    isActive: false,
    sortOrder: (Number(row.sortOrder) || 0) + 1,
    startDate: null,
    endDate: null,
  };
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;
  delete body.impressionCount;
  delete body.clickCount;
  return createAd(body);
}

async function reorderAds(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let n = 0;
    for (const item of items.slice(0, 500)) {
      if (!item || item.id == null) continue;
      const sortOrder = Number(item.sortOrder);
      if (!Number.isFinite(sortOrder)) continue;
      await client.query(`UPDATE content_ads SET sort_order = $2::int, updated_at = NOW() WHERE id = $1::bigint`, [
        item.id,
        Math.trunc(sortOrder),
      ]);
      n += 1;
    }
    await client.query("COMMIT");
    return n;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function incrementImpression(id) {
  await pool.query(
    `UPDATE content_ads SET impression_count = impression_count + 1, updated_at = NOW() WHERE id = $1::bigint`,
    [id],
  );
}

async function incrementClick(id) {
  await pool.query(
    `UPDATE content_ads SET click_count = click_count + 1, updated_at = NOW() WHERE id = $1::bigint`,
    [id],
  );
}

module.exports = {
  listPublicActive,
  listAllForAdmin,
  getById,
  createAd,
  updateAd,
  deleteAd,
  duplicateAd,
  reorderAds,
  incrementImpression,
  incrementClick,
  PLACEMENTS,
  LAYOUT_TYPES,
  THEME_PRESETS,
};
