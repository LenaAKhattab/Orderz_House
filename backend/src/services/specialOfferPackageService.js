const { createAppError } = require("../utils/AppError");
const {
  SPECIAL_OFFER_PACKAGE_SETTING_KEY,
  SPECIAL_OFFER_PURCHASE_MODE,
  SPECIAL_OFFER_PLAN_TIER_CODE,
  SPECIAL_OFFER_LOCKED_BENEFIT_FIELDS,
  DEFAULT_SPECIAL_OFFER_PACKAGE,
  accessLevelKeyFromArticleLevel,
  articleAccessLevelFromKey,
  specialOfferTierCodeForVersion,
  specialOfferVersionFromTierCode,
  specialOfferSlugForVersion,
} = require("../constants/specialOfferPackage");
const { isSpecialOfferMembershipTier } = require("../constants/marketplaceMembershipPlans");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const {
  MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY,
} = require("../constants/marketplaceMembershipCheckout");

const LOCKED_BENEFIT_ERROR_AR =
  "لا يمكن تعديل السعر أو المزايا لأن هذه الباقة تم شراؤها بالفعل. أنشئ عرضاً جديداً بدلاً من تعديل العرض الحالي.";

function asString(value, max) {
  const text = value == null ? "" : String(value).trim();
  return max ? text.slice(0, max) : text;
}

function asNonNegNumber(value, fieldLabel) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    throw createAppError(`${fieldLabel} غير صالح.`, 400, { exposeToClient: true });
  }
  return Math.round(n * 1000) / 1000;
}

function asPositiveInt(value, fieldLabel) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100000) {
    throw createAppError(`${fieldLabel} يجب أن يكون عدداً صحيحاً أكبر من صفر.`, 400, {
      exposeToClient: true,
    });
  }
  return n;
}

function asArticleAccessLevel(value) {
  if (value === "" || value === undefined || value === null) {
    return DEFAULT_SPECIAL_OFFER_PACKAGE.articleAccessLevel;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw createAppError("مستوى الوصول يجب أن يكون بين 1 و 5.", 400, { exposeToClient: true });
  }
  return n;
}

function cloneDefault() {
  return { ...DEFAULT_SPECIAL_OFFER_PACKAGE };
}

function normalizePurchaseMode(raw) {
  const mode = String(raw || "")
    .trim()
    .toLowerCase();
  if (mode === SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP) {
    return SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP;
  }
  return SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT;
}

function normalizeOfferVersion(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 9999);
}

function normalizeSpecialOffer(raw = {}, { partial = false } = {}) {
  const base = cloneDefault();
  const src = raw && typeof raw === "object" ? raw : {};
  const merged = partial ? { ...base, ...src } : { ...base, ...src };

  const title = asString(merged.title, 120);
  if (!title) {
    throw createAppError("عنوان الباقة مطلوب.", 400, { exposeToClient: true });
  }

  const priceJod = asNonNegNumber(merged.priceJod, "السعر");
  if (priceJod == null) {
    throw createAppError("السعر مطلوب.", 400, { exposeToClient: true });
  }
  if (normalizePurchaseMode(merged.purchaseMode) === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT && priceJod <= 0) {
    throw createAppError("سعر الشراء المباشر يجب أن يكون أكبر من صفر.", 400, {
      exposeToClient: true,
    });
  }

  const originalRaw =
    merged.originalPriceJod === "" || merged.originalPriceJod == null
      ? null
      : asNonNegNumber(merged.originalPriceJod, "السعر قبل الخصم");

  const maxProject =
    merged.maxProjectValueJod === "" || merged.maxProjectValueJod == null
      ? null
      : asNonNegNumber(merged.maxProjectValueJod, "الحد الأقصى لقيمة المشروع");

  let articleAccessLevel = asArticleAccessLevel(merged.articleAccessLevel);
  if (merged.accessLevelKey) {
    articleAccessLevel = articleAccessLevelFromKey(merged.accessLevelKey);
  }
  const accessLevelKey = accessLevelKeyFromArticleLevel(articleAccessLevel);

  const linked =
    merged.linkedMarketplacePlanId == null || merged.linkedMarketplacePlanId === ""
      ? null
      : String(merged.linkedMarketplacePlanId).trim().slice(0, 40);

  const linkedPlanCodeRaw = String(merged.linkedPlanCode || "")
    .trim()
    .toLowerCase();
  const linkedPlanCode = ["silver", "pro", "elite"].includes(linkedPlanCodeRaw)
    ? linkedPlanCodeRaw
    : null;

  const offerVersion = normalizeOfferVersion(merged.offerVersion);
  const planTierCode =
    asString(merged.planTierCode, 64) || specialOfferTierCodeForVersion(offerVersion);

  const refundExplanationAr =
    merged.refundExplanationAr === undefined || merged.refundExplanationAr === null
      ? asString(cloneDefault().refundExplanationAr, 2000)
      : asString(merged.refundExplanationAr, 2000);

  return {
    isVisible: Boolean(merged.isVisible),
    title,
    subtitle: asString(merged.subtitle, 400),
    badgeText: asString(merged.badgeText, 80) || "عرض خاص",
    ribbonText: asString(merged.ribbonText, 80) || "لفترة محدودة",
    priceJod,
    originalPriceJod: originalRaw,
    totalOffers: asPositiveInt(merged.totalOffers, "عدد العروض"),
    dailyLimit: asPositiveInt(merged.dailyLimit, "الحد اليومي"),
    durationDays: asPositiveInt(merged.durationDays, "مدة الباقة"),
    maxProjectValueJod: maxProject,
    articleAccessLevel,
    accessLevelKey,
    ctaLabel: asString(merged.ctaLabel, 80) || "احصل على العرض الآن",
    microcopy: asString(merged.microcopy, 240),
    refundExplanationAr,
    whatsappMessageAr: asString(merged.whatsappMessageAr, 500),
    purchaseMode: normalizePurchaseMode(merged.purchaseMode),
    linkedPlanCode,
    linkedMarketplacePlanId: linked,
    offerVersion,
    planTierCode,
  };
}

function parseStored(raw) {
  if (!raw) return cloneDefault();
  try {
    const parsed = JSON.parse(raw);
    try {
      return normalizeSpecialOffer(parsed);
    } catch {
      return normalizeSpecialOffer({
        ...cloneDefault(),
        ...parsed,
        purchaseMode:
          parsed?.purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT &&
          Number(parsed?.priceJod) <= 0
            ? SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP
            : parsed?.purchaseMode,
      });
    }
  } catch {
    return cloneDefault();
  }
}

function isPublicReady(pkg) {
  if (!pkg || pkg.isVisible !== true) return false;
  if (!pkg.title || pkg.priceJod == null) return false;
  if (!(pkg.totalOffers > 0 && pkg.dailyLimit > 0 && pkg.durationDays > 0)) return false;
  return true;
}

function benefitSnapshotEqual(a, b) {
  return (
    Number(a.priceJod) === Number(b.priceJod) &&
    Number(a.totalOffers) === Number(b.totalOffers) &&
    Number(a.dailyLimit) === Number(b.dailyLimit) &&
    Number(a.durationDays) === Number(b.durationDays) &&
    (a.maxProjectValueJod == null
      ? b.maxProjectValueJod == null
      : Number(a.maxProjectValueJod) === Number(b.maxProjectValueJod)) &&
    Number(a.articleAccessLevel) === Number(b.articleAccessLevel) &&
    normalizePurchaseMode(a.purchaseMode) === normalizePurchaseMode(b.purchaseMode)
  );
}

function assertBenefitsUnlockedOrUnchanged(current, next, benefitsLocked) {
  if (!benefitsLocked) return;
  if (!benefitSnapshotEqual(current, next)) {
    throw createAppError(LOCKED_BENEFIT_ERROR_AR, 409, {
      exposeToClient: true,
      publicCode: "SPECIAL_OFFER_BENEFITS_LOCKED",
    });
  }
}

function toAdminDto(pkg, planSummary = null, { benefitsLocked = false, purchaseCount = 0 } = {}) {
  const tier =
    pkg.planTierCode || specialOfferTierCodeForVersion(pkg.offerVersion || 1);
  return {
    id: "special_offer",
    ...pkg,
    planTierCode: tier,
    checkoutSupported:
      pkg.purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT && Number(pkg.priceJod) > 0,
    independentPlanTier: tier,
    benefitsLocked: Boolean(benefitsLocked),
    purchaseCount: Number(purchaseCount) || 0,
    canCreateNewVersion: Boolean(benefitsLocked),
    planSummary,
  };
}

function toPublicDto(pkg) {
  if (!isPublicReady(pkg)) return null;
  const checkoutSupported =
    pkg.purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT && Number(pkg.priceJod) > 0;
  const tier =
    pkg.planTierCode || specialOfferTierCodeForVersion(pkg.offerVersion || 1);

  return {
    id: "special_offer",
    title: pkg.title,
    subtitle: pkg.subtitle,
    badgeText: pkg.badgeText,
    ribbonText: pkg.ribbonText,
    priceJod: pkg.priceJod,
    originalPriceJod: pkg.originalPriceJod,
    totalOffers: pkg.totalOffers,
    dailyLimit: pkg.dailyLimit,
    durationDays: pkg.durationDays,
    maxProjectValueJod: pkg.maxProjectValueJod,
    articleAccessLevel: pkg.articleAccessLevel,
    accessLevelKey: pkg.accessLevelKey,
    ctaLabel: checkoutSupported
      ? pkg.ctaLabel || "احصل على العرض الآن"
      : "تواصل للحصول على العرض",
    microcopy: pkg.microcopy,
    refundExplanationAr: String(pkg.refundExplanationAr || "").trim() || null,
    whatsappMessageAr: checkoutSupported ? null : pkg.whatsappMessageAr || null,
    purchaseMode: checkoutSupported
      ? SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
      : SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP,
    checkoutSupported: Boolean(checkoutSupported),
    linkedPlanCode: null,
    linkedMarketplacePlanId: pkg.linkedMarketplacePlanId || null,
    offerVersion: pkg.offerVersion || 1,
    planTierCode: tier,
    catalogSource: "special_offer",
  };
}

function resolveSettings(settings) {
  return settings || require("./systemSettingsService");
}

function buildPlanPayloadFromOffer(pkg, { tierCode, slug } = {}) {
  const unlimited = pkg.maxProjectValueJod == null;
  const version = normalizeOfferVersion(pkg.offerVersion);
  const code = tierCode || pkg.planTierCode || specialOfferTierCodeForVersion(version);
  return {
    tierCode: code,
    nameAr: pkg.title,
    nameEn: pkg.title,
    slug: slug || specialOfferSlugForVersion(version),
    descriptionAr: pkg.subtitle || null,
    descriptionEn: pkg.subtitle || null,
    isActive: true,
    sortOrder: 9990,
    monthlyPriceJod: pkg.priceJod,
    monthlyBidAllowance: pkg.totalOffers,
    dailyBidSpendLimit: pkg.dailyLimit,
    cycleDurationDays: pkg.durationDays,
    maxRealOrderValueJod: unlimited ? null : pkg.maxProjectValueJod,
    unlimitedRealOrderValue: unlimited,
    articleAccessLevel: pkg.articleAccessLevel,
    cashAllowed: true,
    minimumCashMonths: 1,
    maximumPrepaidMonths: 1,
    eliteDirectOrdersEnabled: false,
    priorityBidEnabled: false,
    priorityBidUsesPerCycle: 0,
    withdrawalEnabled: true,
    projectMinValueJod: 1,
    saleEnabled: false,
  };
}

function summarizePlan(plan) {
  if (!plan) return null;
  const tier = String(plan.tierCode || "").toLowerCase();
  return {
    id: plan.id != null ? String(plan.id) : null,
    tierCode: tier || SPECIAL_OFFER_PLAN_TIER_CODE,
    offerVersion: specialOfferVersionFromTierCode(tier),
    isActive: plan.isActive !== false,
    monthlyPriceJod: Number(plan.monthlyPriceJod) || null,
    monthlyBidAllowance: Number(plan.monthlyBidAllowance) || null,
    dailyBidSpendLimit: Number(plan.dailyBidSpendLimit) || null,
    cycleDurationDays: Number(plan.cycleDurationDays) || null,
    maxRealOrderValueJod:
      plan.unlimitedRealOrderValue === true
        ? null
        : plan.maxRealOrderValueJod != null
          ? Number(plan.maxRealOrderValueJod)
          : null,
    articleAccessLevel: Number(plan.articleAccessLevel) || null,
  };
}

async function countPurchasesForPlanId(planId, deps = {}) {
  const id = Number(planId);
  if (!Number.isInteger(id) || id < 1) return 0;
  if (typeof deps.countPurchasesForPlanId === "function") {
    return Number(await deps.countPurchasesForPlanId(id)) || 0;
  }
  const db = deps.db || require("../config/db");
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS c
       FROM freelancer_marketplace_memberships
       WHERE marketplace_plan_id = $1::bigint`,
      [id],
    );
    return Number(rows[0]?.c) || 0;
  } catch {
    return 0;
  }
}

async function resolveCurrentPlan(pkg, plansService) {
  if (pkg.linkedMarketplacePlanId) {
    try {
      const byId = await plansService.getMarketplaceMembershipPlanById(
        Number(pkg.linkedMarketplacePlanId),
      );
      if (byId && isSpecialOfferMembershipTier(byId.tierCode)) return byId;
    } catch {
      /* fall through */
    }
  }
  const tier =
    pkg.planTierCode || specialOfferTierCodeForVersion(pkg.offerVersion || 1);
  try {
    return await plansService.getMarketplaceMembershipPlanByTierCode(tier);
  } catch {
    return null;
  }
}

/**
 * Ensure the current campaign plan row exists and (when unlocked) matches config.
 * Never mutates benefit fields on a plan that already has purchases.
 */
async function ensureIndependentSpecialOfferPlan(pkg, deps = {}, { allowBenefitUpdate = true } = {}) {
  const plansService = deps.plansService || require("./marketplaceMembershipPlansService");
  const version = normalizeOfferVersion(pkg.offerVersion);
  const tierCode = pkg.planTierCode || specialOfferTierCodeForVersion(version);
  const payload = buildPlanPayloadFromOffer(pkg, {
    tierCode,
    slug: specialOfferSlugForVersion(version),
  });

  let existing = await resolveCurrentPlan(pkg, plansService);

  if (!existing) {
    try {
      existing = await plansService.getMarketplaceMembershipPlanByTierCode(tierCode);
    } catch {
      existing = null;
    }
  }

  if (!existing) {
    return plansService.createMarketplaceMembershipPlan(payload);
  }

  const purchaseCount = await countPurchasesForPlanId(existing.id, deps);
  const locked = purchaseCount > 0;
  if (locked || !allowBenefitUpdate) {
    // Keep plan active for existing buyers / in-flight webhooks; do not mutate benefits.
    if (existing.isActive === false) {
      return plansService.updateMarketplaceMembershipPlan(existing.id, { isActive: true });
    }
    return existing;
  }

  return plansService.updateMarketplaceMembershipPlan(existing.id, {
    nameAr: payload.nameAr,
    nameEn: payload.nameEn,
    descriptionAr: payload.descriptionAr,
    descriptionEn: payload.descriptionEn,
    isActive: true,
    monthlyPriceJod: payload.monthlyPriceJod,
    monthlyBidAllowance: payload.monthlyBidAllowance,
    dailyBidSpendLimit: payload.dailyBidSpendLimit,
    cycleDurationDays: payload.cycleDurationDays,
    maxRealOrderValueJod: payload.maxRealOrderValueJod,
    unlimitedRealOrderValue: payload.unlimitedRealOrderValue,
    articleAccessLevel: payload.articleAccessLevel,
    withdrawalEnabled: true,
    saleEnabled: false,
  });
}

async function loadLockState(pkg, deps = {}) {
  const plansService = deps.plansService || require("./marketplaceMembershipPlansService");
  const plan = await resolveCurrentPlan(pkg, plansService);
  const purchaseCount = plan ? await countPurchasesForPlanId(plan.id, deps) : 0;
  return {
    plan,
    purchaseCount,
    benefitsLocked: purchaseCount > 0,
  };
}

async function getSpecialOfferPackage(settings, deps = {}) {
  const store = resolveSettings(settings);
  let pkg;
  try {
    const raw = await store.getSetting(SPECIAL_OFFER_PACKAGE_SETTING_KEY);
    pkg = parseStored(raw);
  } catch {
    pkg = cloneDefault();
  }

  const { plan, purchaseCount, benefitsLocked } = await loadLockState(pkg, deps);
  if (plan) {
    pkg.linkedMarketplacePlanId = String(plan.id);
    pkg.planTierCode = String(plan.tierCode || pkg.planTierCode).toLowerCase();
    pkg.offerVersion = specialOfferVersionFromTierCode(pkg.planTierCode);
  }
  return toAdminDto(pkg, summarizePlan(plan), { benefitsLocked, purchaseCount });
}

async function getPublicSpecialOfferPackage(settings, deps = {}) {
  const admin = await getSpecialOfferPackage(settings, deps);
  return toPublicDto(admin);
}

async function persistOffer(store, next, { updatedByUserId } = {}) {
  await store.setSetting(SPECIAL_OFFER_PACKAGE_SETTING_KEY, JSON.stringify(next), {
    updatedByUserId,
  });
}

async function upsertSpecialOfferPackage(patch, { updatedByUserId } = {}, settings, deps = {}) {
  const store = resolveSettings(settings);
  const currentDto = await getSpecialOfferPackage(store, deps);
  const benefitsLocked = Boolean(currentDto.benefitsLocked);

  if (benefitsLocked) {
    // Locked versions: only visibility endpoint (or create-new-version) may change state.
    // Reject any PUT that tries to mutate the offer — including cosmetic fields.
    const next = normalizeSpecialOffer({
      ...currentDto,
      ...(patch || {}),
      offerVersion: currentDto.offerVersion,
      planTierCode: currentDto.planTierCode,
      linkedMarketplacePlanId: currentDto.linkedMarketplacePlanId,
    });
    const cosmeticChanged =
      next.title !== currentDto.title ||
      next.subtitle !== currentDto.subtitle ||
      next.badgeText !== currentDto.badgeText ||
      next.ribbonText !== currentDto.ribbonText ||
      next.ctaLabel !== currentDto.ctaLabel ||
      next.microcopy !== currentDto.microcopy ||
      next.refundExplanationAr !== currentDto.refundExplanationAr ||
      next.whatsappMessageAr !== currentDto.whatsappMessageAr ||
      (next.originalPriceJod == null
        ? currentDto.originalPriceJod != null
        : Number(next.originalPriceJod) !== Number(currentDto.originalPriceJod)) ||
      Boolean(next.isVisible) !== Boolean(currentDto.isVisible);
    if (!benefitSnapshotEqual(currentDto, next) || cosmeticChanged) {
      throw createAppError(LOCKED_BENEFIT_ERROR_AR, 409, {
        exposeToClient: true,
        publicCode: "SPECIAL_OFFER_BENEFITS_LOCKED",
      });
    }
    return currentDto;
  }

  const next = normalizeSpecialOffer({
    ...currentDto,
    ...(patch || {}),
    offerVersion: currentDto.offerVersion,
    planTierCode: currentDto.planTierCode,
    linkedMarketplacePlanId: currentDto.linkedMarketplacePlanId,
  });

  if (next.purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT) {
    const plan = await ensureIndependentSpecialOfferPlan(next, deps, {
      allowBenefitUpdate: true,
    });
    next.linkedMarketplacePlanId = plan?.id != null ? String(plan.id) : null;
    next.planTierCode = String(plan?.tierCode || next.planTierCode).toLowerCase();
    next.linkedPlanCode = null;
    await persistOffer(store, next, { updatedByUserId });
    const purchaseCount = await countPurchasesForPlanId(plan?.id, deps);
    return toAdminDto(next, summarizePlan(plan), {
      benefitsLocked: purchaseCount > 0,
      purchaseCount,
    });
  }

  await persistOffer(store, next, { updatedByUserId });
  const { plan, purchaseCount, benefitsLocked: locked } = await loadLockState(next, deps);
  return toAdminDto(next, summarizePlan(plan), {
    benefitsLocked: locked,
    purchaseCount,
  });
}

/**
 * Visibility / end offer — allowed even when benefits are locked.
 */
async function setSpecialOfferVisibility(isVisible, { updatedByUserId } = {}, settings, deps = {}) {
  const store = resolveSettings(settings);
  const current = await getSpecialOfferPackage(store, deps);
  const next = normalizeSpecialOffer({
    ...current,
    isVisible: Boolean(isVisible),
  });
  await persistOffer(store, next, { updatedByUserId });
  const { plan, purchaseCount, benefitsLocked } = await loadLockState(next, deps);
  return toAdminDto(next, summarizePlan(plan), { benefitsLocked, purchaseCount });
}

/**
 * Clone current campaign into a new unlocked plan row (special_offer_vN).
 * Old plan row is left untouched so existing buyers keep their benefits.
 */
async function createNewSpecialOfferVersion(
  { copyFromCurrent = true, makeVisible = false } = {},
  { updatedByUserId } = {},
  settings,
  deps = {},
) {
  const store = resolveSettings(settings);
  const current = await getSpecialOfferPackage(store, deps);
  const nextVersion = normalizeOfferVersion(current.offerVersion) + 1;
  const nextTier = specialOfferTierCodeForVersion(nextVersion);

  const base = copyFromCurrent
    ? {
        ...current,
        isVisible: Boolean(makeVisible),
        offerVersion: nextVersion,
        planTierCode: nextTier,
        linkedMarketplacePlanId: null,
        linkedPlanCode: null,
      }
    : {
        ...cloneDefault(),
        isVisible: Boolean(makeVisible),
        offerVersion: nextVersion,
        planTierCode: nextTier,
        linkedMarketplacePlanId: null,
        linkedPlanCode: null,
      };

  const next = normalizeSpecialOffer(base);
  const plansService = deps.plansService || require("./marketplaceMembershipPlansService");
  const payload = buildPlanPayloadFromOffer(next, {
    tierCode: nextTier,
    slug: specialOfferSlugForVersion(nextVersion),
  });

  let created;
  try {
    created = await plansService.createMarketplaceMembershipPlan(payload);
  } catch (err) {
    // If tier already exists (retry), reuse and overwrite only when zero purchases.
    const existing = await plansService.getMarketplaceMembershipPlanByTierCode(nextTier);
    if (!existing) throw err;
    const purchases = await countPurchasesForPlanId(existing.id, deps);
    if (purchases > 0) {
      throw createAppError("تعذر إنشاء إصدار جديد — جرّب مرة أخرى.", 409, {
        exposeToClient: true,
        publicCode: "SPECIAL_OFFER_VERSION_CONFLICT",
      });
    }
    created = await plansService.updateMarketplaceMembershipPlan(existing.id, {
      nameAr: payload.nameAr,
      nameEn: payload.nameEn,
      descriptionAr: payload.descriptionAr,
      descriptionEn: payload.descriptionEn,
      isActive: true,
      monthlyPriceJod: payload.monthlyPriceJod,
      monthlyBidAllowance: payload.monthlyBidAllowance,
      dailyBidSpendLimit: payload.dailyBidSpendLimit,
      cycleDurationDays: payload.cycleDurationDays,
      maxRealOrderValueJod: payload.maxRealOrderValueJod,
      unlimitedRealOrderValue: payload.unlimitedRealOrderValue,
      articleAccessLevel: payload.articleAccessLevel,
      withdrawalEnabled: true,
      saleEnabled: false,
    });
  }

  next.linkedMarketplacePlanId = created?.id != null ? String(created.id) : null;
  next.planTierCode = String(created?.tierCode || nextTier).toLowerCase();
  next.offerVersion = specialOfferVersionFromTierCode(next.planTierCode);
  await persistOffer(store, next, { updatedByUserId });

  return toAdminDto(next, summarizePlan(created), {
    benefitsLocked: false,
    purchaseCount: 0,
  });
}

/**
 * Create Stripe Checkout for the current special offer plan version.
 * Hidden / WhatsApp-mode offers cannot be purchased.
 * Does not mutate locked plan benefit fields.
 */
async function createSpecialOfferCheckoutSession(input = {}, deps = {}) {
  const pkg = await getSpecialOfferPackage(deps.settings, deps);
  if (!pkg.isVisible) {
    throw createAppError("باقة العرض غير متاحة حالياً.", 404, {
      exposeToClient: true,
      publicCode: "SPECIAL_OFFER_HIDDEN",
    });
  }
  if (pkg.purchaseMode !== SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT) {
    throw createAppError("باقة العرض مضبوطة على التواصل اليدوي وليست للشراء المباشر.", 400, {
      exposeToClient: true,
      publicCode: "SPECIAL_OFFER_WHATSAPP_ONLY",
    });
  }
  if (!(Number(pkg.priceJod) > 0)) {
    throw createAppError("سعر باقة العرض غير صالح للشراء.", 400, {
      exposeToClient: true,
      publicCode: "SPECIAL_OFFER_INVALID_PRICE",
    });
  }

  const plan = await ensureIndependentSpecialOfferPlan(pkg, deps, {
    allowBenefitUpdate: !pkg.benefitsLocked,
  });
  if (!plan || plan.isActive === false) {
    throw createAppError("تعذر تجهيز باقة العرض للشراء.", 500, {
      exposeToClient: true,
      publicCode: "SPECIAL_OFFER_PLAN_UNAVAILABLE",
    });
  }

  const expectedAmountMinor = amountMajorToStripeMinor(
    Number(pkg.priceJod),
    MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY,
  );

  const planTier = String(plan.tierCode || pkg.planTierCode || SPECIAL_OFFER_PLAN_TIER_CODE).toLowerCase();
  const offerVersion = specialOfferVersionFromTierCode(planTier);

  const checkoutService =
    deps.checkoutService || require("./marketplaceMembershipCheckoutService");
  const result = await checkoutService.createMarketplaceMembershipCheckoutSession(
    {
      freelancerUserId: input.freelancerUserId,
      planCode: planTier,
      locale: input.locale,
      extraMetadata: {
        specialOfferPackage: "1",
        purchaseSource: "special_offer_package",
        purchase_context: "special_offer_package",
        specialOfferPlanId: String(plan.id),
        specialOfferVersion: String(offerVersion),
        totalOffers: String(pkg.totalOffers),
        dailyLimit: String(pkg.dailyLimit),
        durationDays: String(pkg.durationDays),
        maxProjectValue: pkg.maxProjectValueJod == null ? "" : String(pkg.maxProjectValueJod),
        accessLevel: String(pkg.articleAccessLevel),
        articleAccessLevel: String(pkg.articleAccessLevel),
        offerPriceJod: String(pkg.priceJod),
        expectedAmountMinor: String(expectedAmountMinor),
      },
    },
    deps,
  );

  return {
    ...result,
    specialOfferPackage: true,
    independent: true,
    planTierCode: planTier,
    specialOfferPlanId: String(plan.id),
    specialOfferVersion: offerVersion,
    benefitSnapshot: {
      priceJod: pkg.priceJod,
      totalOffers: pkg.totalOffers,
      dailyLimit: pkg.dailyLimit,
      durationDays: pkg.durationDays,
      maxProjectValueJod: pkg.maxProjectValueJod,
      articleAccessLevel: pkg.articleAccessLevel,
      specialOfferPlanId: String(plan.id),
      specialOfferVersion: offerVersion,
    },
  };
}

module.exports = {
  SPECIAL_OFFER_PACKAGE_SETTING_KEY,
  SPECIAL_OFFER_PURCHASE_MODE,
  SPECIAL_OFFER_PLAN_TIER_CODE,
  SPECIAL_OFFER_LOCKED_BENEFIT_FIELDS,
  LOCKED_BENEFIT_ERROR_AR,
  normalizeSpecialOffer,
  isPublicReady,
  toPublicDto,
  toAdminDto,
  ensureIndependentSpecialOfferPlan,
  countPurchasesForPlanId,
  getSpecialOfferPackage,
  getPublicSpecialOfferPackage,
  upsertSpecialOfferPackage,
  setSpecialOfferVisibility,
  createNewSpecialOfferVersion,
  createSpecialOfferCheckoutSession,
};
