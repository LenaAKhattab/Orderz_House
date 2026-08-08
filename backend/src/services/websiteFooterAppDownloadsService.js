const { pool } = require("../config/db");

const APP_DEFAULTS = Object.freeze({
  titleAr: "تحميل التطبيق",
  titleEn: "Download the app",
  googlePlayUrl: "https://play.google.com/store/apps/details?id=com.orderzhouse.app",
  appStoreUrl: "https://apps.apple.com/ae/app/orderzhouse/id6762045683",
  visible: true,
  titleVisible: true,
  googlePlayVisible: true,
  appStoreVisible: true,
});

const CONTACT_DEFAULTS = Object.freeze({
  phone: "+971 522857808",
  email: "info@orderzhouse.com",
  whatsapp: "+971 522857808",
  location: "الإمارات العربية المتحدة، دبي",
  visible: true,
  phoneVisible: true,
  emailVisible: true,
  whatsappVisible: true,
  locationVisible: true,
});

const WORKING_HOURS_DEFAULTS = Object.freeze({
  title: "ساعات العمل",
  text: "نعمل على مدار الساعة لخدمتك",
  visible: true,
  titleVisible: true,
  textVisible: true,
});

const CONTACT_CENTER_DEFAULTS = Object.freeze({
  visible: true,
  helperText: "للاقتراحات والشكاوى اضغط هنا",
  helperTextVisible: true,
  buttonText: "مركز التواصل",
  buttonVisible: true,
  /** Guests → login; authenticated freelancer/client resolve to role feedback in the public Footer. */
  url: "/login",
});

/** @deprecated use APP_DEFAULTS — kept for existing imports/tests */
const DEFAULTS = APP_DEFAULTS;

const TITLE_MAX = 120;
const URL_MAX = 2048;
const PHONE_MAX = 40;
const EMAIL_MAX = 255;
const LOCATION_MAX = 200;
const HOURS_TEXT_MAX = 500;
const HELPER_TEXT_MAX = 200;
const CONTACT_CENTER_URL_MAX = 2048;

const GOOGLE_PLAY_HOSTS = new Set(["play.google.com"]);
const APP_STORE_HOSTS = new Set(["apps.apple.com"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isMissingColumnError(err) {
  return err?.code === "42703";
}

function coalesceText(value, fallback) {
  const s = String(value ?? "").trim();
  return s || fallback;
}

/** Missing/null visibility → true (backward compatible). Explicit false stays false. */
function coalesceBool(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeVisibleFlag(raw, current) {
  if (raw === undefined) return coalesceBool(current, true);
  return Boolean(raw);
}

/** Strip tags/null bytes for plain footer text. */
function sanitizePlainText(value, { maxLen }) {
  let s = String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function normalizeStoreHttpsUrl(raw, { label, allowedHosts }) {
  const t = String(raw ?? "").trim();
  if (!t) {
    const err = new Error(`${label} مطلوب.`);
    err.publicCode = "STORE_URL_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  if (t.length > URL_MAX) {
    const err = new Error(`${label} طويل جداً.`);
    err.publicCode = "STORE_URL_TOO_LONG";
    err.statusCode = 400;
    throw err;
  }
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    const err = new Error(`${label} غير صالح.`);
    err.publicCode = "STORE_URL_INVALID";
    err.statusCode = 400;
    throw err;
  }
  let u;
  try {
    u = new URL(t);
  } catch {
    const err = new Error(`${label} غير صالح.`);
    err.publicCode = "STORE_URL_INVALID";
    err.statusCode = 400;
    throw err;
  }
  if (u.protocol !== "https:") {
    const err = new Error(`${label} يجب أن يكون رابط HTTPS.`);
    err.publicCode = "STORE_URL_HTTPS_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  const host = String(u.hostname || "").toLowerCase();
  if (!allowedHosts.has(host)) {
    const err = new Error(`${label} يجب أن يكون من النطاق المسموح.`);
    err.publicCode = "STORE_URL_HOST_NOT_ALLOWED";
    err.statusCode = 400;
    throw err;
  }
  return u.toString().slice(0, URL_MAX);
}

function normalizeTitle(raw, label, maxLen = TITLE_MAX) {
  const t = sanitizePlainText(raw, { maxLen });
  if (!t) {
    const err = new Error(`${label} مطلوب.`);
    err.publicCode = "TITLE_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  return t;
}

function normalizePhoneLike(raw, label) {
  const t = sanitizePlainText(raw, { maxLen: PHONE_MAX });
  if (!t) {
    const err = new Error(`${label} مطلوب.`);
    err.publicCode = "PHONE_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  if (!/^[\d+\s().-]{6,40}$/.test(t)) {
    const err = new Error(`${label} غير صالح.`);
    err.publicCode = "PHONE_INVALID";
    err.statusCode = 400;
    throw err;
  }
  return t;
}

function normalizeEmail(raw) {
  const t = sanitizePlainText(raw, { maxLen: EMAIL_MAX }).toLowerCase();
  if (!t) {
    const err = new Error("البريد الإلكتروني مطلوب.");
    err.publicCode = "EMAIL_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  if (!EMAIL_RE.test(t)) {
    const err = new Error("البريد الإلكتروني غير صالح.");
    err.publicCode = "EMAIL_INVALID";
    err.statusCode = 400;
    throw err;
  }
  return t;
}

function normalizeLocation(raw) {
  return normalizeTitle(raw, "الموقع", LOCATION_MAX);
}

function normalizeHoursText(raw) {
  const t = sanitizePlainText(raw, { maxLen: HOURS_TEXT_MAX });
  if (!t) {
    const err = new Error("نص ساعات العمل مطلوب.");
    err.publicCode = "HOURS_TEXT_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  return t;
}

/**
 * Safe internal path (/…) or https URL for footer Contact Center CTA.
 * @param {unknown} raw
 */
function normalizeContactCenterUrl(raw) {
  const t = String(raw ?? "")
    .replace(/\u0000/g, "")
    .trim();
  if (!t) {
    const err = new Error("رابط مركز التواصل مطلوب.");
    err.publicCode = "CONTACT_CENTER_URL_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  if (t.length > CONTACT_CENTER_URL_MAX) {
    const err = new Error("رابط مركز التواصل طويل جداً.");
    err.publicCode = "CONTACT_CENTER_URL_TOO_LONG";
    err.statusCode = 400;
    throw err;
  }
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    const err = new Error("رابط مركز التواصل غير صالح.");
    err.publicCode = "CONTACT_CENTER_URL_INVALID";
    err.statusCode = 400;
    throw err;
  }
  if (t.startsWith("/")) {
    if (t.startsWith("//") || t.includes("\\") || t.includes("<") || t.includes(">")) {
      const err = new Error("رابط مركز التواصل غير صالح.");
      err.publicCode = "CONTACT_CENTER_URL_INVALID";
      err.statusCode = 400;
      throw err;
    }
    return t.slice(0, CONTACT_CENTER_URL_MAX);
  }
  let u;
  try {
    u = new URL(t);
  } catch {
    const err = new Error("رابط مركز التواصل غير صالح.");
    err.publicCode = "CONTACT_CENTER_URL_INVALID";
    err.statusCode = 400;
    throw err;
  }
  if (u.protocol !== "https:") {
    const err = new Error("الروابط الخارجية لمركز التواصل يجب أن تكون HTTPS.");
    err.publicCode = "CONTACT_CENTER_URL_HTTPS_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  return u.toString().slice(0, CONTACT_CENTER_URL_MAX);
}

function normalizeHelperText(raw) {
  const t = sanitizePlainText(raw, { maxLen: HELPER_TEXT_MAX });
  if (!t) {
    const err = new Error("النص التوضيحي مطلوب.");
    err.publicCode = "HELPER_TEXT_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  return t;
}

function mapAppFromRow(row) {
  return {
    titleAr: coalesceText(row?.footer_app_download_title_ar ?? row?.titleAr, APP_DEFAULTS.titleAr),
    titleEn: coalesceText(row?.footer_app_download_title_en ?? row?.titleEn, APP_DEFAULTS.titleEn),
    googlePlayUrl: coalesceText(row?.footer_google_play_url ?? row?.googlePlayUrl, APP_DEFAULTS.googlePlayUrl),
    appStoreUrl: coalesceText(row?.footer_app_store_url ?? row?.appStoreUrl, APP_DEFAULTS.appStoreUrl),
    visible: coalesceBool(row?.footer_app_download_visible ?? row?.visible, true),
    titleVisible: coalesceBool(row?.footer_app_download_title_visible ?? row?.titleVisible, true),
    googlePlayVisible: coalesceBool(row?.footer_google_play_visible ?? row?.googlePlayVisible, true),
    appStoreVisible: coalesceBool(row?.footer_app_store_visible ?? row?.appStoreVisible, true),
  };
}

function mapContactFromRow(row) {
  return {
    phone: coalesceText(row?.footer_contact_phone ?? row?.phone, CONTACT_DEFAULTS.phone),
    email: coalesceText(row?.footer_contact_email ?? row?.email, CONTACT_DEFAULTS.email),
    whatsapp: coalesceText(row?.footer_contact_whatsapp ?? row?.whatsapp, CONTACT_DEFAULTS.whatsapp),
    location: coalesceText(row?.footer_contact_location ?? row?.location, CONTACT_DEFAULTS.location),
    visible: coalesceBool(row?.footer_contact_visible ?? row?.visible, true),
    phoneVisible: coalesceBool(row?.footer_contact_phone_visible ?? row?.phoneVisible, true),
    emailVisible: coalesceBool(row?.footer_contact_email_visible ?? row?.emailVisible, true),
    whatsappVisible: coalesceBool(row?.footer_contact_whatsapp_visible ?? row?.whatsappVisible, true),
    locationVisible: coalesceBool(row?.footer_contact_location_visible ?? row?.locationVisible, true),
  };
}

function mapWorkingHoursFromRow(row) {
  return {
    title: coalesceText(row?.footer_working_hours_title ?? row?.title, WORKING_HOURS_DEFAULTS.title),
    text: coalesceText(row?.footer_working_hours_text ?? row?.text, WORKING_HOURS_DEFAULTS.text),
    visible: coalesceBool(row?.footer_working_hours_visible ?? row?.visible, true),
    titleVisible: coalesceBool(row?.footer_working_hours_title_visible ?? row?.titleVisible, true),
    textVisible: coalesceBool(row?.footer_working_hours_text_visible ?? row?.textVisible, true),
  };
}

function mapContactCenterFromRow(row) {
  return {
    visible: coalesceBool(row?.footer_contact_center_visible ?? row?.visible, true),
    helperText: coalesceText(
      row?.footer_contact_center_helper_text ?? row?.helperText,
      CONTACT_CENTER_DEFAULTS.helperText,
    ),
    helperTextVisible: coalesceBool(
      row?.footer_contact_center_helper_text_visible ?? row?.helperTextVisible,
      true,
    ),
    buttonText: coalesceText(
      row?.footer_contact_center_button_text ?? row?.buttonText,
      CONTACT_CENTER_DEFAULTS.buttonText,
    ),
    buttonVisible: coalesceBool(
      row?.footer_contact_center_button_visible ?? row?.buttonVisible,
      true,
    ),
    url: coalesceText(row?.footer_contact_center_url ?? row?.url, CONTACT_CENTER_DEFAULTS.url),
  };
}

/** @deprecated use mapAppFromRow */
function mapSettingsRow(row) {
  return {
    ...mapAppFromRow(row),
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

function mapFullSettingsRow(row) {
  return {
    contact: mapContactFromRow(row),
    workingHours: mapWorkingHoursFromRow(row),
    contactCenter: mapContactCenterFromRow(row),
    appDownload: mapAppFromRow(row),
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

const SELECT_FOOTER_COLUMNS = `
  footer_app_download_title_ar,
  footer_app_download_title_en,
  footer_google_play_url,
  footer_app_store_url,
  footer_app_download_visible,
  footer_app_download_title_visible,
  footer_google_play_visible,
  footer_app_store_visible,
  footer_contact_phone,
  footer_contact_email,
  footer_contact_whatsapp,
  footer_contact_location,
  footer_contact_visible,
  footer_contact_phone_visible,
  footer_contact_email_visible,
  footer_contact_whatsapp_visible,
  footer_contact_location_visible,
  footer_working_hours_title,
  footer_working_hours_text,
  footer_working_hours_visible,
  footer_working_hours_title_visible,
  footer_working_hours_text_visible,
  footer_contact_center_visible,
  footer_contact_center_helper_text,
  footer_contact_center_helper_text_visible,
  footer_contact_center_button_text,
  footer_contact_center_button_visible,
  footer_contact_center_url,
  updated_at
`;

async function fetchFooterRow() {
  const { rows } = await pool.query(
    `SELECT ${SELECT_FOOTER_COLUMNS}
     FROM platform_ui_settings
     WHERE id = 1
     LIMIT 1`,
  );
  return rows[0] || null;
}

async function getFooterSettings() {
  try {
    const row = await fetchFooterRow();
    if (!row) {
      return {
        contact: { ...CONTACT_DEFAULTS },
        workingHours: { ...WORKING_HOURS_DEFAULTS },
        contactCenter: { ...CONTACT_CENTER_DEFAULTS },
        appDownload: { ...APP_DEFAULTS },
        updatedAt: null,
      };
    }
    return mapFullSettingsRow(row);
  } catch (err) {
    if (isMissingColumnError(err)) {
      try {
        const app = await getFooterAppDownloads();
        return {
          contact: { ...CONTACT_DEFAULTS },
          workingHours: { ...WORKING_HOURS_DEFAULTS },
          contactCenter: { ...CONTACT_CENTER_DEFAULTS },
          appDownload: {
            titleAr: app.titleAr,
            titleEn: app.titleEn,
            googlePlayUrl: app.googlePlayUrl,
            appStoreUrl: app.appStoreUrl,
            visible: coalesceBool(app.visible, true),
            titleVisible: coalesceBool(app.titleVisible, true),
            googlePlayVisible: coalesceBool(app.googlePlayVisible, true),
            appStoreVisible: coalesceBool(app.appStoreVisible, true),
          },
          updatedAt: app.updatedAt,
        };
      } catch {
        return {
          contact: { ...CONTACT_DEFAULTS },
          workingHours: { ...WORKING_HOURS_DEFAULTS },
          contactCenter: { ...CONTACT_CENTER_DEFAULTS },
          appDownload: { ...APP_DEFAULTS },
          updatedAt: null,
        };
      }
    }
    throw err;
  }
}

async function getFooterAppDownloads() {
  try {
    const { rows } = await pool.query(
      `SELECT footer_app_download_title_ar,
              footer_app_download_title_en,
              footer_google_play_url,
              footer_app_store_url,
              footer_app_download_visible,
              footer_app_download_title_visible,
              footer_google_play_visible,
              footer_app_store_visible,
              updated_at
       FROM platform_ui_settings
       WHERE id = 1
       LIMIT 1`,
    );
    if (!rows.length) return { ...APP_DEFAULTS, updatedAt: null };
    return mapSettingsRow(rows[0]);
  } catch (err) {
    if (isMissingColumnError(err)) {
      try {
        const { rows } = await pool.query(
          `SELECT footer_app_download_title_ar,
                  footer_app_download_title_en,
                  footer_google_play_url,
                  footer_app_store_url,
                  updated_at
           FROM platform_ui_settings
           WHERE id = 1
           LIMIT 1`,
        );
        if (!rows.length) return { ...APP_DEFAULTS, updatedAt: null };
        return mapSettingsRow(rows[0]);
      } catch (inner) {
        if (isMissingColumnError(inner)) {
          return { ...APP_DEFAULTS, updatedAt: null };
        }
        throw inner;
      }
    }
    throw err;
  }
}

async function updateFooterAppDownloads(patch = {}) {
  const current = await getFooterAppDownloads();

  const titleAr =
    patch.titleAr !== undefined ? normalizeTitle(patch.titleAr, "عنوان القسم") : current.titleAr;
  const titleEn =
    patch.titleEn !== undefined ? normalizeTitle(patch.titleEn, "Section title") : current.titleEn;
  const googlePlayUrl =
    patch.googlePlayUrl !== undefined
      ? normalizeStoreHttpsUrl(patch.googlePlayUrl, {
          label: "رابط Google Play",
          allowedHosts: GOOGLE_PLAY_HOSTS,
        })
      : current.googlePlayUrl;
  const appStoreUrl =
    patch.appStoreUrl !== undefined
      ? normalizeStoreHttpsUrl(patch.appStoreUrl, {
          label: "رابط App Store",
          allowedHosts: APP_STORE_HOSTS,
        })
      : current.appStoreUrl;
  const visible = normalizeVisibleFlag(patch.visible, current.visible);
  const titleVisible = normalizeVisibleFlag(patch.titleVisible, current.titleVisible);
  const googlePlayVisible = normalizeVisibleFlag(patch.googlePlayVisible, current.googlePlayVisible);
  const appStoreVisible = normalizeVisibleFlag(patch.appStoreVisible, current.appStoreVisible);

  try {
    await pool.query(
      `INSERT INTO platform_ui_settings (
         id,
         footer_app_download_title_ar,
         footer_app_download_title_en,
         footer_google_play_url,
         footer_app_store_url,
         footer_app_download_visible,
         footer_app_download_title_visible,
         footer_google_play_visible,
         footer_app_store_visible,
         updated_at
       )
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO UPDATE SET
         footer_app_download_title_ar = EXCLUDED.footer_app_download_title_ar,
         footer_app_download_title_en = EXCLUDED.footer_app_download_title_en,
         footer_google_play_url = EXCLUDED.footer_google_play_url,
         footer_app_store_url = EXCLUDED.footer_app_store_url,
         footer_app_download_visible = EXCLUDED.footer_app_download_visible,
         footer_app_download_title_visible = EXCLUDED.footer_app_download_title_visible,
         footer_google_play_visible = EXCLUDED.footer_google_play_visible,
         footer_app_store_visible = EXCLUDED.footer_app_store_visible,
         updated_at = NOW()`,
      [
        titleAr,
        titleEn,
        googlePlayUrl,
        appStoreUrl,
        visible,
        titleVisible,
        googlePlayVisible,
        appStoreVisible,
      ],
    );
  } catch (err) {
    if (isMissingColumnError(err)) {
      const e = new Error("إعدادات تحميل التطبيق غير جاهزة. شغّل ترحيلات قاعدة البيانات.");
      e.publicCode = "FOOTER_APP_SETTINGS_SCHEMA_MISSING";
      e.statusCode = 503;
      throw e;
    }
    throw err;
  }

  return getFooterAppDownloads();
}

async function updateFooterContact(patch = {}) {
  const current = (await getFooterSettings()).contact;
  const phone = patch.phone !== undefined ? normalizePhoneLike(patch.phone, "رقم الهاتف") : current.phone;
  const email = patch.email !== undefined ? normalizeEmail(patch.email) : current.email;
  const whatsapp =
    patch.whatsapp !== undefined ? normalizePhoneLike(patch.whatsapp, "رقم واتساب") : current.whatsapp;
  const location = patch.location !== undefined ? normalizeLocation(patch.location) : current.location;
  const visible = normalizeVisibleFlag(patch.visible, current.visible);
  const phoneVisible = normalizeVisibleFlag(patch.phoneVisible, current.phoneVisible);
  const emailVisible = normalizeVisibleFlag(patch.emailVisible, current.emailVisible);
  const whatsappVisible = normalizeVisibleFlag(patch.whatsappVisible, current.whatsappVisible);
  const locationVisible = normalizeVisibleFlag(patch.locationVisible, current.locationVisible);

  try {
    await pool.query(
      `INSERT INTO platform_ui_settings (
         id,
         footer_contact_phone,
         footer_contact_email,
         footer_contact_whatsapp,
         footer_contact_location,
         footer_contact_visible,
         footer_contact_phone_visible,
         footer_contact_email_visible,
         footer_contact_whatsapp_visible,
         footer_contact_location_visible,
         updated_at
       )
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         footer_contact_phone = EXCLUDED.footer_contact_phone,
         footer_contact_email = EXCLUDED.footer_contact_email,
         footer_contact_whatsapp = EXCLUDED.footer_contact_whatsapp,
         footer_contact_location = EXCLUDED.footer_contact_location,
         footer_contact_visible = EXCLUDED.footer_contact_visible,
         footer_contact_phone_visible = EXCLUDED.footer_contact_phone_visible,
         footer_contact_email_visible = EXCLUDED.footer_contact_email_visible,
         footer_contact_whatsapp_visible = EXCLUDED.footer_contact_whatsapp_visible,
         footer_contact_location_visible = EXCLUDED.footer_contact_location_visible,
         updated_at = NOW()`,
      [
        phone,
        email,
        whatsapp,
        location,
        visible,
        phoneVisible,
        emailVisible,
        whatsappVisible,
        locationVisible,
      ],
    );
  } catch (err) {
    if (isMissingColumnError(err)) {
      const e = new Error("إعدادات التواصل غير جاهزة. شغّل ترحيلات قاعدة البيانات.");
      e.publicCode = "FOOTER_CONTACT_SCHEMA_MISSING";
      e.statusCode = 503;
      throw e;
    }
    throw err;
  }

  return (await getFooterSettings()).contact;
}

async function updateFooterWorkingHours(patch = {}) {
  const current = (await getFooterSettings()).workingHours;
  const title = patch.title !== undefined ? normalizeTitle(patch.title, "عنوان القسم") : current.title;
  const text = patch.text !== undefined ? normalizeHoursText(patch.text) : current.text;
  const visible = normalizeVisibleFlag(patch.visible, current.visible);
  const titleVisible = normalizeVisibleFlag(patch.titleVisible, current.titleVisible);
  const textVisible = normalizeVisibleFlag(patch.textVisible, current.textVisible);

  try {
    await pool.query(
      `INSERT INTO platform_ui_settings (
         id,
         footer_working_hours_title,
         footer_working_hours_text,
         footer_working_hours_visible,
         footer_working_hours_title_visible,
         footer_working_hours_text_visible,
         updated_at
       )
       VALUES (1, $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         footer_working_hours_title = EXCLUDED.footer_working_hours_title,
         footer_working_hours_text = EXCLUDED.footer_working_hours_text,
         footer_working_hours_visible = EXCLUDED.footer_working_hours_visible,
         footer_working_hours_title_visible = EXCLUDED.footer_working_hours_title_visible,
         footer_working_hours_text_visible = EXCLUDED.footer_working_hours_text_visible,
         updated_at = NOW()`,
      [title, text, visible, titleVisible, textVisible],
    );
  } catch (err) {
    if (isMissingColumnError(err)) {
      const e = new Error("إعدادات ساعات العمل غير جاهزة. شغّل ترحيلات قاعدة البيانات.");
      e.publicCode = "FOOTER_HOURS_SCHEMA_MISSING";
      e.statusCode = 503;
      throw e;
    }
    throw err;
  }

  return (await getFooterSettings()).workingHours;
}

async function updateFooterContactCenter(patch = {}) {
  const current = (await getFooterSettings()).contactCenter;
  const helperText =
    patch.helperText !== undefined ? normalizeHelperText(patch.helperText) : current.helperText;
  const buttonText =
    patch.buttonText !== undefined
      ? normalizeTitle(patch.buttonText, "نص الزر")
      : current.buttonText;
  const url = patch.url !== undefined ? normalizeContactCenterUrl(patch.url) : current.url;
  const visible = normalizeVisibleFlag(patch.visible, current.visible);
  const helperTextVisible = normalizeVisibleFlag(patch.helperTextVisible, current.helperTextVisible);
  const buttonVisible = normalizeVisibleFlag(patch.buttonVisible, current.buttonVisible);

  try {
    await pool.query(
      `INSERT INTO platform_ui_settings (
         id,
         footer_contact_center_visible,
         footer_contact_center_helper_text,
         footer_contact_center_helper_text_visible,
         footer_contact_center_button_text,
         footer_contact_center_button_visible,
         footer_contact_center_url,
         updated_at
       )
       VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         footer_contact_center_visible = EXCLUDED.footer_contact_center_visible,
         footer_contact_center_helper_text = EXCLUDED.footer_contact_center_helper_text,
         footer_contact_center_helper_text_visible = EXCLUDED.footer_contact_center_helper_text_visible,
         footer_contact_center_button_text = EXCLUDED.footer_contact_center_button_text,
         footer_contact_center_button_visible = EXCLUDED.footer_contact_center_button_visible,
         footer_contact_center_url = EXCLUDED.footer_contact_center_url,
         updated_at = NOW()`,
      [visible, helperText, helperTextVisible, buttonText, buttonVisible, url],
    );
  } catch (err) {
    if (isMissingColumnError(err)) {
      const e = new Error("إعدادات مركز التواصل غير جاهزة. شغّل ترحيلات قاعدة البيانات.");
      e.publicCode = "FOOTER_CONTACT_CENTER_SCHEMA_MISSING";
      e.statusCode = 503;
      throw e;
    }
    throw err;
  }

  return (await getFooterSettings()).contactCenter;
}

/**
 * Build wa.me link from a phone/whatsapp display string.
 * @param {string} phoneLike
 */
function buildWhatsAppHref(phoneLike) {
  const digits = String(phoneLike || "").replace(/\D/g, "");
  if (!digits) {
    return `https://wa.me/${CONTACT_DEFAULTS.whatsapp.replace(/\D/g, "")}`;
  }
  return `https://wa.me/${digits}`;
}

/**
 * Build tel: href from phone display string.
 * @param {string} phoneLike
 */
function buildTelHref(phoneLike) {
  const compact = String(phoneLike || "").replace(/[^\d+]/g, "");
  return compact ? `tel:${compact}` : `tel:${CONTACT_DEFAULTS.phone.replace(/[^\d+]/g, "")}`;
}

module.exports = {
  DEFAULTS,
  APP_DEFAULTS,
  CONTACT_DEFAULTS,
  WORKING_HOURS_DEFAULTS,
  CONTACT_CENTER_DEFAULTS,
  TITLE_MAX,
  URL_MAX,
  PHONE_MAX,
  EMAIL_MAX,
  LOCATION_MAX,
  HOURS_TEXT_MAX,
  HELPER_TEXT_MAX,
  CONTACT_CENTER_URL_MAX,
  GOOGLE_PLAY_HOSTS,
  APP_STORE_HOSTS,
  normalizeStoreHttpsUrl,
  normalizeTitle,
  normalizePhoneLike,
  normalizeEmail,
  normalizeLocation,
  normalizeHoursText,
  normalizeHelperText,
  normalizeContactCenterUrl,
  normalizeVisibleFlag,
  sanitizePlainText,
  mapSettingsRow,
  mapFullSettingsRow,
  coalesceText,
  coalesceBool,
  buildWhatsAppHref,
  buildTelHref,
  getFooterSettings,
  getFooterAppDownloads,
  updateFooterAppDownloads,
  updateFooterContact,
  updateFooterWorkingHours,
  updateFooterContactCenter,
};
