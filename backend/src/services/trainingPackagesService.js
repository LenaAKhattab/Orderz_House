const { createAppError } = require("../utils/AppError");
const {
  TRAINING_PACKAGES_SETTING_KEY,
  ACCENTS,
  cloneDefaultTrainingPackages,
} = require("../constants/trainingPackagesCatalog");

const CODE_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

function asString(value, max) {
  const text = value == null ? "" : String(value).trim();
  return max ? text.slice(0, max) : text;
}

function asStringArray(value, maxItems = 40, maxLen = 240) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asPriceJod(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    throw createAppError("السعر بالدينار الأردني غير صالح.", 400, { exposeToClient: true });
  }
  return Math.round(n * 1000) / 1000;
}

function asDurationMonths(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 36) {
    throw createAppError("مدة الباقة يجب أن تكون بين 1 و 36 شهرًا.", 400, { exposeToClient: true });
  }
  return n;
}

function defaultWhatsAppMessage(pkg) {
  const name = asString(pkg.nameAr, 120) || "باقة التدريب";
  const price = pkg.priceJod;
  return `مرحبًا، أرغب بالاستفسار والتسجيل في ${name} للتدريب بسعر ${price} د.أ، وأود معرفة تفاصيل الدورة وطريقة التسجيل.`;
}

function normalizePackage(raw, fallback = {}) {
  const code = asString(raw.code ?? raw.id ?? fallback.code, 40).toLowerCase();
  if (!CODE_RE.test(code)) {
    throw createAppError("رمز الباقة غير صالح.", 400, { exposeToClient: true });
  }
  const accent = ACCENTS.includes(String(raw.accent || "").trim())
    ? String(raw.accent).trim()
    : fallback.accent && ACCENTS.includes(fallback.accent)
      ? fallback.accent
      : "basic";
  const nameAr = asString(raw.nameAr ?? fallback.nameAr, 120);
  if (!nameAr) {
    throw createAppError("اسم الباقة مطلوب.", 400, { exposeToClient: true });
  }
  const priceJod = asPriceJod(raw.priceJod ?? fallback.priceJod ?? 0);
  const featuresAr = asStringArray(raw.featuresAr ?? fallback.featuresAr);
  const whatsappMessageAr =
    asString(raw.whatsappMessageAr ?? fallback.whatsappMessageAr, 500) ||
    defaultWhatsAppMessage({ nameAr, priceJod });
  const highlight = Number(raw.highlightFeatureIndex ?? fallback.highlightFeatureIndex ?? 0);
  const highlightFeatureIndex =
    Number.isInteger(highlight) && highlight >= 0 && highlight < Math.max(featuresAr.length, 1)
      ? highlight
      : 0;

  return {
    code,
    accent,
    featured: raw.featured != null ? Boolean(raw.featured) : Boolean(fallback.featured),
    isVisible: raw.isVisible != null ? Boolean(raw.isVisible) : fallback.isVisible !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder ?? fallback.sortOrder))
      ? Number(raw.sortOrder ?? fallback.sortOrder)
      : 0,
    priceJod,
    durationMonths: asDurationMonths(
      raw.durationMonths !== undefined ? raw.durationMonths : fallback.durationMonths,
    ),
    nameAr,
    nameEn: asString(raw.nameEn ?? fallback.nameEn, 120),
    shortDescAr: asString(raw.shortDescAr ?? fallback.shortDescAr, 400),
    shortDescEn: asString(raw.shortDescEn ?? fallback.shortDescEn, 400),
    featuresAr,
    featuresEn: asStringArray(raw.featuresEn ?? fallback.featuresEn),
    highlightFeatureIndex,
    badgeAr: asString(raw.badgeAr ?? fallback.badgeAr, 80),
    badgeEn: asString(raw.badgeEn ?? fallback.badgeEn, 80),
    whatsappMessageAr,
  };
}

function sortPackages(list) {
  return [...list].sort((a, b) => {
    const d = Number(a.sortOrder) - Number(b.sortOrder);
    return d !== 0 ? d : String(a.code).localeCompare(String(b.code));
  });
}

function parseStored(raw) {
  if (!raw) return cloneDefaultTrainingPackages().map((pkg) => normalizePackage(pkg));
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return cloneDefaultTrainingPackages().map((pkg) => normalizePackage(pkg));
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.packages;
  if (!Array.isArray(list) || list.length === 0) {
    return cloneDefaultTrainingPackages().map((pkg) => normalizePackage(pkg));
  }
  return sortPackages(list.map((item) => normalizePackage(item)));
}

function toPublicDto(pkg) {
  return {
    id: pkg.code,
    code: pkg.code,
    accent: pkg.accent,
    featured: pkg.featured,
    priceJod: pkg.priceJod,
    durationMonths: pkg.durationMonths,
    nameAr: pkg.nameAr,
    nameEn: pkg.nameEn,
    shortDescAr: pkg.shortDescAr,
    shortDescEn: pkg.shortDescEn,
    featuresAr: pkg.featuresAr,
    featuresEn: pkg.featuresEn,
    highlightFeatureIndex: pkg.highlightFeatureIndex,
    badgeAr: pkg.badgeAr,
    badgeEn: pkg.badgeEn,
    whatsappMessageAr: pkg.whatsappMessageAr,
  };
}

function toAdminDto(pkg) {
  return { ...toPublicDto(pkg), isVisible: pkg.isVisible, sortOrder: pkg.sortOrder };
}

function resolveSettings(settings) {
  return settings || require("./systemSettingsService");
}

async function loadAll(settings) {
  const store = resolveSettings(settings);
  try {
    const raw = await store.getSetting(TRAINING_PACKAGES_SETTING_KEY);
    return parseStored(raw);
  } catch {
    return parseStored(null);
  }
}

async function persistAll(packages, { updatedByUserId } = {}, settings) {
  const store = resolveSettings(settings);
  const normalized = sortPackages(packages.map((pkg) => normalizePackage(pkg)));
  const codes = new Set();
  for (const pkg of normalized) {
    if (codes.has(pkg.code)) {
      throw createAppError("رمز الباقة مكرر.", 400, { exposeToClient: true });
    }
    codes.add(pkg.code);
  }
  await store.setSetting(
    TRAINING_PACKAGES_SETTING_KEY,
    JSON.stringify({ packages: normalized }),
    { updatedByUserId },
  );
  return normalized;
}

async function listPublicTrainingPackages(settings) {
  const all = await loadAll(settings);
  return all.filter((pkg) => pkg.isVisible !== false).map(toPublicDto);
}

async function listAdminTrainingPackages(settings) {
  const all = await loadAll(settings);
  return all.map(toAdminDto);
}

async function upsertTrainingPackage(code, patch, { updatedByUserId } = {}, settings) {
  const all = await loadAll(settings);
  const currentCode = asString(code, 40).toLowerCase();
  const idx = all.findIndex((pkg) => pkg.code === currentCode);
  if (idx < 0) {
    throw createAppError("الباقة غير موجودة.", 404, { exposeToClient: true });
  }
  const incoming = patch && Object.prototype.hasOwnProperty.call(patch, "code") ? patch.code : undefined;
  if (incoming != null && String(incoming).trim() !== "") {
    const attempted = asString(incoming, 40).toLowerCase();
    if (attempted !== currentCode) {
      throw createAppError("لا يمكن تغيير رمز الباقة بعد إنشائها.", 400, {
        exposeToClient: true,
        publicCode: "TRAINING_PACKAGE_CODE_IMMUTABLE",
      });
    }
  }
  const { code: _ignoredCode, ...rest } = patch || {};
  all[idx] = normalizePackage({ ...all[idx], ...rest, code: currentCode }, all[idx]);
  const saved = await persistAll(all, { updatedByUserId }, settings);
  return toAdminDto(saved.find((pkg) => pkg.code === currentCode));
}

async function createTrainingPackage(payload, { updatedByUserId } = {}, settings) {
  const all = await loadAll(settings);
  const next = normalizePackage({
    ...payload,
    sortOrder: payload.sortOrder != null ? payload.sortOrder : (all[all.length - 1]?.sortOrder || 0) + 10,
    isVisible: payload.isVisible !== false,
  });
  if (all.some((pkg) => pkg.code === next.code)) {
    throw createAppError("رمز الباقة مستخدم مسبقًا.", 409, { exposeToClient: true });
  }
  all.push(next);
  const saved = await persistAll(all, { updatedByUserId }, settings);
  return toAdminDto(saved.find((pkg) => pkg.code === next.code));
}

async function reorderTrainingPackages(orderedCodes, { updatedByUserId } = {}, settings) {
  const all = await loadAll(settings);
  const codes = Array.isArray(orderedCodes) ? orderedCodes.map((c) => asString(c, 40).toLowerCase()) : [];
  if (codes.length !== all.length || new Set(codes).size !== all.length) {
    throw createAppError("ترتيب الباقات غير مكتمل.", 400, { exposeToClient: true });
  }
  const byCode = new Map(all.map((pkg) => [pkg.code, pkg]));
  const next = codes.map((code, index) => {
    const pkg = byCode.get(code);
    if (!pkg) throw createAppError("رمز باقة غير معروف في الترتيب.", 400, { exposeToClient: true });
    return { ...pkg, sortOrder: (index + 1) * 10 };
  });
  const saved = await persistAll(next, { updatedByUserId }, settings);
  return saved.map(toAdminDto);
}

module.exports = {
  CODE_RE,
  normalizePackage,
  parseStored,
  listPublicTrainingPackages,
  listAdminTrainingPackages,
  upsertTrainingPackage,
  createTrainingPackage,
  reorderTrainingPackages,
};
