/**
 * Super Admin-editable public `/plans` hero copy and initial Training/Work tab.
 * Uses existing system_settings. Does not touch default_plan_catalog.
 */

const { getSetting, setSetting } = require("./systemSettingsService");
const { createAppError } = require("../utils/AppError");
const {
  PUBLIC_PLANS_CONTENT_SETTING_KEYS,
  PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
  PUBLIC_PLANS_CONTENT_DEFAULTS,
  PUBLIC_PLANS_CONTENT_MAX_LENGTHS,
  normalizePublicPlansDefaultSection,
  normalizePublicPlansPlainText,
} = require("../constants/publicPlansContent");

const TITLE_REQUIRED_MESSAGE = "العنوان الرئيسي مطلوب.";
const INVALID_SECTION_MESSAGE = "القسم الافتراضي يجب أن يكون التدريب أو عضوية سوق أوردرز هاوس.";
const INVALID_TEXT_MESSAGE = "يجب إدخال نص عادي فقط.";
const TEXT_TOO_LONG_MESSAGE = "النص أطول من الحد المسموح.";

function resolvedText(stored, fallback) {
  return stored == null || stored === "" ? fallback : stored;
}

function toPayload({
  badgeText,
  title,
  description,
  defaultSection,
  trainingTabLabel,
  workTabLabel,
  textsAreCustom,
}) {
  return {
    badgeText: resolvedText(badgeText, PUBLIC_PLANS_CONTENT_DEFAULTS.badgeText),
    title: resolvedText(title, PUBLIC_PLANS_CONTENT_DEFAULTS.title),
    description: resolvedText(description, PUBLIC_PLANS_CONTENT_DEFAULTS.description),
    defaultSection: defaultSection || PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
    trainingTabLabel: resolvedText(trainingTabLabel, PUBLIC_PLANS_CONTENT_DEFAULTS.trainingTabLabel),
    workTabLabel: resolvedText(workTabLabel, PUBLIC_PLANS_CONTENT_DEFAULTS.workTabLabel),
    textsAreCustom: Boolean(textsAreCustom),
  };
}

async function readStoredContent(client) {
  const [badgeText, title, description, defaultSectionRaw, trainingTabLabel, workTabLabel] = await Promise.all([
    getSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.BADGE_TEXT, client),
    getSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.TITLE, client),
    getSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.DESCRIPTION, client),
    getSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.DEFAULT_SECTION, client),
    getSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.TRAINING_TAB_LABEL, client),
    getSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.WORK_TAB_LABEL, client),
  ]);

  const normalizedSection = normalizePublicPlansDefaultSection(defaultSectionRaw);
  return {
    badgeText,
    title,
    description,
    defaultSection: normalizedSection || PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
    trainingTabLabel,
    workTabLabel,
    textsAreCustom: title != null && String(title).trim() !== "",
  };
}

/**
 * Public/read-safe payload. Unset keys resolve to Production defaults.
 * Invalid stored section falls back to training (does not break /plans).
 */
async function getPublicPlansContent() {
  try {
    const stored = await readStoredContent();
    return toPayload(stored);
  } catch {
    return toPayload({
      badgeText: null,
      title: null,
      description: null,
      defaultSection: PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
      trainingTabLabel: null,
      workTabLabel: null,
      textsAreCustom: false,
    });
  }
}

async function getAdminPublicPlansContent() {
  return getPublicPlansContent();
}

function assertPlainText(raw, { required = false, maxLength } = {}) {
  if (raw != null && typeof raw !== "string") {
    throw createAppError(INVALID_TEXT_MESSAGE, 400, {
      exposeToClient: true,
      publicCode: "INVALID_PUBLIC_PLANS_TEXT",
    });
  }
  const normalized = normalizePublicPlansPlainText(raw, maxLength);
  if (normalized === undefined) {
    const tooLong = typeof raw === "string" && raw.trim().length > maxLength;
    throw createAppError(tooLong ? TEXT_TOO_LONG_MESSAGE : INVALID_TEXT_MESSAGE, 400, {
      exposeToClient: true,
      publicCode: tooLong ? "PUBLIC_PLANS_TEXT_TOO_LONG" : "INVALID_PUBLIC_PLANS_TEXT",
    });
  }
  if (required && (normalized == null || normalized === "")) {
    throw createAppError(TITLE_REQUIRED_MESSAGE, 400, {
      exposeToClient: true,
      publicCode: "PUBLIC_PLANS_TITLE_REQUIRED",
    });
  }
  return normalized;
}

/**
 * Persist hero copy + initial section. Does not write default_plan_catalog.
 * @param {object} input
 * @param {{ updatedByUserId?: number|null }} [opts]
 */
async function setPublicPlansContent(input, opts = {}) {
  const badgeText = assertPlainText(input?.badgeText, {
    maxLength: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.badgeText,
  });
  const title = assertPlainText(input?.title, {
    required: true,
    maxLength: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.title,
  });
  const description = assertPlainText(input?.description, {
    maxLength: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.description,
  });
  const trainingTabLabel = assertPlainText(input?.trainingTabLabel, {
    maxLength: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.trainingTabLabel,
  });
  const workTabLabel = assertPlainText(input?.workTabLabel, {
    maxLength: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.workTabLabel,
  });
  const defaultSection = normalizePublicPlansDefaultSection(input?.defaultSection);
  if (!defaultSection) {
    throw createAppError(INVALID_SECTION_MESSAGE, 400, {
      exposeToClient: true,
      publicCode: "INVALID_PUBLIC_PLANS_DEFAULT_SECTION",
    });
  }

  const writeOpts = { updatedByUserId: opts.updatedByUserId ?? null };
  await setSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.BADGE_TEXT, badgeText, writeOpts);
  await setSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.TITLE, title, writeOpts);
  await setSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.DESCRIPTION, description, writeOpts);
  await setSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.DEFAULT_SECTION, defaultSection, writeOpts);
  await setSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.TRAINING_TAB_LABEL, trainingTabLabel, writeOpts);
  await setSetting(PUBLIC_PLANS_CONTENT_SETTING_KEYS.WORK_TAB_LABEL, workTabLabel, writeOpts);

  return toPayload({
    badgeText,
    title,
    description,
    defaultSection,
    trainingTabLabel,
    workTabLabel,
    textsAreCustom: true,
  });
}

module.exports = {
  TITLE_REQUIRED_MESSAGE,
  INVALID_SECTION_MESSAGE,
  INVALID_TEXT_MESSAGE,
  TEXT_TOO_LONG_MESSAGE,
  getPublicPlansContent,
  getAdminPublicPlansContent,
  setPublicPlansContent,
};
