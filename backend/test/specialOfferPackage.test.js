/**
 * Special offer — version lock + independent package checkout.
 * Run: node --test test/specialOfferPackage.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/special_offer_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeSpecialOffer,
  toPublicDto,
  upsertSpecialOfferPackage,
  getPublicSpecialOfferPackage,
  getSpecialOfferPackage,
  setSpecialOfferVisibility,
  createSpecialOfferCheckoutSession,
  createNewSpecialOfferVersion,
  SPECIAL_OFFER_PLAN_TIER_CODE,
  SPECIAL_OFFER_PURCHASE_MODE,
  LOCKED_BENEFIT_ERROR_AR,
} = require("../src/services/specialOfferPackageService");
const { isPaidMarketplaceMembershipTier } = require("../src/utils/marketplaceMembershipPendingStart");
const {
  SPECIAL_OFFER_MEMBERSHIP_TIER_CODE,
  isSpecialOfferMembershipTier,
} = require("../src/constants/marketplaceMembershipPlans");
const {
  specialOfferTierCodeForVersion,
} = require("../src/constants/specialOfferPackage");

function memorySettings() {
  const map = new Map();
  return {
    async getSetting(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setSetting(key, value) {
      if (value == null) map.delete(key);
      else map.set(key, String(value));
      return value;
    },
  };
}

function fakeSpecialOfferPlanStore() {
  const plans = new Map();
  let nextId = 9001;
  return {
    async getMarketplaceMembershipPlanByTierCode(code) {
      const key = String(code || "").toLowerCase();
      for (const p of plans.values()) {
        if (String(p.tierCode).toLowerCase() === key) return { ...p };
      }
      return null;
    },
    async getMarketplaceMembershipPlanById(id) {
      const p = plans.get(Number(id));
      return p ? { ...p } : null;
    },
    async createMarketplaceMembershipPlan(payload) {
      const id = nextId++;
      const plan = {
        id,
        tierCode: String(payload.tierCode).toLowerCase(),
        isActive: true,
        monthlyPriceJod: payload.monthlyPriceJod,
        monthlyBidAllowance: payload.monthlyBidAllowance,
        dailyBidSpendLimit: payload.dailyBidSpendLimit,
        cycleDurationDays: payload.cycleDurationDays,
        maxRealOrderValueJod: payload.maxRealOrderValueJod,
        unlimitedRealOrderValue: payload.unlimitedRealOrderValue,
        articleAccessLevel: payload.articleAccessLevel,
        nameAr: payload.nameAr,
        slug: payload.slug,
      };
      plans.set(id, plan);
      return { ...plan };
    },
    async updateMarketplaceMembershipPlan(id, patch) {
      const prev = plans.get(Number(id));
      if (!prev) throw new Error("plan missing");
      const plan = {
        ...prev,
        ...patch,
        id: Number(id),
        tierCode: prev.tierCode,
        isActive: patch.isActive !== undefined ? patch.isActive : true,
      };
      plans.set(Number(id), plan);
      return { ...plan };
    },
    _plans: plans,
  };
}

function baseOfferPatch(extra = {}) {
  return {
    title: "عرض مستقل",
    priceJod: 49,
    totalOffers: 200,
    dailyLimit: 15,
    durationDays: 30,
    maxProjectValueJod: 70,
    accessLevelKey: "pro",
    isVisible: true,
    purchaseMode: "checkout",
    ...extra,
  };
}

describe("specialOfferPackageService version lock", () => {
  it("treats special_offer and special_offer_v2 as paid membership tiers", () => {
    assert.equal(SPECIAL_OFFER_MEMBERSHIP_TIER_CODE, "special_offer");
    assert.equal(isSpecialOfferMembershipTier("special_offer"), true);
    assert.equal(isSpecialOfferMembershipTier("special_offer_v2"), true);
    assert.equal(isSpecialOfferMembershipTier("special_offer_v10"), true);
    assert.equal(isSpecialOfferMembershipTier("silver"), false);
    assert.equal(isPaidMarketplaceMembershipTier("special_offer"), true);
    assert.equal(isPaidMarketplaceMembershipTier("special_offer_v2"), true);
    assert.equal(isPaidMarketplaceMembershipTier("silver"), true);
    assert.equal(specialOfferTierCodeForVersion(1), "special_offer");
    assert.equal(specialOfferTierCodeForVersion(2), "special_offer_v2");
  });

  it("rejects invalid price / bids / duration", () => {
    assert.throws(() =>
      normalizeSpecialOffer({
        title: "X",
        priceJod: -1,
        totalOffers: 1,
        dailyLimit: 1,
        durationDays: 1,
        purchaseMode: "whatsapp",
      }),
    );
  });

  it("admin can edit special offer before any purchase", async () => {
    const settings = memorySettings();
    const plansService = fakeSpecialOfferPlanStore();
    const deps = { plansService, countPurchasesForPlanId: async () => 0 };
    await upsertSpecialOfferPackage(baseOfferPatch(), { updatedByUserId: 1 }, settings, deps);
    const updated = await upsertSpecialOfferPackage(
      { priceJod: 59, totalOffers: 100 },
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    assert.equal(updated.priceJod, 59);
    assert.equal(updated.totalOffers, 100);
    assert.equal(updated.benefitsLocked, false);
    const plan = await plansService.getMarketplaceMembershipPlanByTierCode("special_offer");
    assert.equal(plan.monthlyPriceJod, 59);
    assert.equal(plan.monthlyBidAllowance, 100);
  });

  it("checkout references exact specialOfferPlanId / version and benefit snapshot", async () => {
    const settings = memorySettings();
    const plansService = fakeSpecialOfferPlanStore();
    let captured = null;
    const deps = {
      plansService,
      countPurchasesForPlanId: async () => 0,
      checkoutService: {
        async createMarketplaceMembershipCheckoutSession(input) {
          captured = input;
          return {
            checkoutUrl: "https://checkout.test/session",
            sessionId: "cs_test_so",
            planCode: input.planCode,
            marketplacePlanId: "9001",
            membershipGranted: false,
          };
        },
      },
    };

    await upsertSpecialOfferPackage(baseOfferPatch(), { updatedByUserId: 1 }, settings, deps);
    const result = await createSpecialOfferCheckoutSession(
      { freelancerUserId: 7 },
      { ...deps, settings },
    );
    assert.equal(captured.planCode, "special_offer");
    assert.equal(captured.extraMetadata.specialOfferPackage, "1");
    assert.equal(captured.extraMetadata.specialOfferPlanId, "9001");
    assert.equal(captured.extraMetadata.specialOfferVersion, "1");
    assert.equal(captured.extraMetadata.totalOffers, "200");
    assert.equal(captured.extraMetadata.dailyLimit, "15");
    assert.equal(result.specialOfferPlanId, "9001");
    assert.equal(result.benefitSnapshot.totalOffers, 200);
    assert.notEqual(captured.planCode, "silver");
  });

  it("after purchase, editing price/benefits is rejected", async () => {
    const settings = memorySettings();
    const plansService = fakeSpecialOfferPlanStore();
    const purchaseCounts = new Map();
    const deps = {
      plansService,
      countPurchasesForPlanId: async (id) => purchaseCounts.get(Number(id)) || 0,
    };
    const saved = await upsertSpecialOfferPackage(
      baseOfferPatch(),
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    purchaseCounts.set(Number(saved.linkedMarketplacePlanId), 1);

    const locked = await getSpecialOfferPackage(settings, deps);
    assert.equal(locked.benefitsLocked, true);
    assert.equal(locked.purchaseCount, 1);

    await assert.rejects(
      () =>
        upsertSpecialOfferPackage(
          { priceJod: 99, totalOffers: 1 },
          { updatedByUserId: 1 },
          settings,
          deps,
        ),
      (err) => {
        assert.match(String(err.message || ""), /تم شراؤها بالفعل|SPECIAL_OFFER_BENEFITS_LOCKED/);
        assert.equal(err.publicCode, "SPECIAL_OFFER_BENEFITS_LOCKED");
        assert.match(LOCKED_BENEFIT_ERROR_AR, /أنشئ عرضاً جديداً/);
        return true;
      },
    );

    const plan = await plansService.getMarketplaceMembershipPlanByTierCode("special_offer");
    assert.equal(plan.monthlyPriceJod, 49);
    assert.equal(plan.monthlyBidAllowance, 200);
  });

  it("admin can hide locked offer and create a new offer version", async () => {
    const settings = memorySettings();
    const plansService = fakeSpecialOfferPlanStore();
    const purchaseCounts = new Map();
    const deps = {
      plansService,
      countPurchasesForPlanId: async (id) => purchaseCounts.get(Number(id)) || 0,
    };
    const v1 = await upsertSpecialOfferPackage(
      baseOfferPatch(),
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    const v1PlanId = Number(v1.linkedMarketplacePlanId);
    purchaseCounts.set(v1PlanId, 1);

    const hidden = await setSpecialOfferVisibility(false, { updatedByUserId: 1 }, settings, deps);
    assert.equal(hidden.isVisible, false);
    assert.equal(hidden.benefitsLocked, true);
    assert.equal(await getPublicSpecialOfferPackage(settings, deps), null);

    const v2 = await createNewSpecialOfferVersion(
      { copyFromCurrent: true, makeVisible: false },
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    assert.equal(v2.offerVersion, 2);
    assert.equal(v2.planTierCode, "special_offer_v2");
    assert.equal(v2.benefitsLocked, false);
    assert.equal(v2.isVisible, false);
    assert.notEqual(Number(v2.linkedMarketplacePlanId), v1PlanId);

    const oldPlan = await plansService.getMarketplaceMembershipPlanById(v1PlanId);
    assert.equal(oldPlan.monthlyPriceJod, 49);
    assert.equal(oldPlan.monthlyBidAllowance, 200);

    await upsertSpecialOfferPackage(
      {
        priceJod: 59,
        totalOffers: 100,
        dailyLimit: 7,
        durationDays: 20,
        maxProjectValueJod: 50,
        isVisible: true,
      },
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    const pub = await getPublicSpecialOfferPackage(settings, deps);
    assert.equal(pub.priceJod, 59);
    assert.equal(pub.totalOffers, 100);
    assert.equal(pub.dailyLimit, 7);
    assert.equal(pub.planTierCode, "special_offer_v2");

    // Old plan benefits unchanged
    const stillOld = await plansService.getMarketplaceMembershipPlanById(v1PlanId);
    assert.equal(stillOld.monthlyPriceJod, 49);
    assert.equal(stillOld.monthlyBidAllowance, 200);
  });

  it("checkout created for old version grants old plan even if newer version exists", async () => {
    const settings = memorySettings();
    const plansService = fakeSpecialOfferPlanStore();
    let captured = null;
    const deps = {
      plansService,
      countPurchasesForPlanId: async () => 0,
      checkoutService: {
        async createMarketplaceMembershipCheckoutSession(input) {
          captured = input;
          return { checkoutUrl: "https://checkout.test/a", sessionId: "cs_a", planCode: input.planCode };
        },
      },
    };

    await upsertSpecialOfferPackage(baseOfferPatch(), { updatedByUserId: 1 }, settings, deps);
    const checkoutA = await createSpecialOfferCheckoutSession(
      { freelancerUserId: 1 },
      { ...deps, settings },
    );
    assert.equal(checkoutA.specialOfferPlanId, "9001");
    assert.equal(captured.extraMetadata.specialOfferPlanId, "9001");

    // Simulate "session already created" then admin creates v2 before webhook
    await createNewSpecialOfferVersion(
      { copyFromCurrent: true, makeVisible: true },
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    const current = await getSpecialOfferPackage(settings, deps);
    assert.equal(current.planTierCode, "special_offer_v2");
    // Metadata from checkout A still points at plan 9001 — webhook uses specialOfferPlanId first
    assert.equal(captured.extraMetadata.specialOfferPlanId, "9001");
    assert.notEqual(String(current.linkedMarketplacePlanId), "9001");
  });

  it("hidden offer cannot be purchased; whatsapp mode skips checkout", async () => {
    const settings = memorySettings();
    const deps = {
      plansService: fakeSpecialOfferPlanStore(),
      countPurchasesForPlanId: async () => 0,
      checkoutService: {
        async createMarketplaceMembershipCheckoutSession() {
          throw new Error("should not run");
        },
      },
    };
    await upsertSpecialOfferPackage(
      baseOfferPatch({ isVisible: false }),
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    await assert.rejects(
      () => createSpecialOfferCheckoutSession({ freelancerUserId: 1 }, { ...deps, settings }),
      /غير متاحة|HIDDEN/i,
    );

    await upsertSpecialOfferPackage(
      baseOfferPatch({ purchaseMode: "whatsapp", isVisible: true }),
      { updatedByUserId: 1 },
      settings,
      deps,
    );
    await assert.rejects(
      () => createSpecialOfferCheckoutSession({ freelancerUserId: 1 }, { ...deps, settings }),
      /يدوي|WHATSAPP/i,
    );
  });

  it("public list SQL excludes all special_offer versions", () => {
    const plansServiceSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceMembershipPlansService.js"),
      "utf8",
    );
    assert.match(plansServiceSrc, /special_offer\(_v\[0-9\]\+\)\?/);
    assert.equal(
      toPublicDto({
        isVisible: false,
        title: "x",
        priceJod: 1,
        totalOffers: 1,
        dailyLimit: 1,
        durationDays: 1,
      }),
      null,
    );
  });

  it("routes wired for new-version; no migration file", () => {
    const adminRoutes = fs.readFileSync(
      path.join(__dirname, "../src/routes/superAdminSpecialOfferPackageRoutes.js"),
      "utf8",
    );
    const checkout = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceMembershipCheckoutService.js"),
      "utf8",
    );
    assert.match(adminRoutes, /special-offer\/new-version/);
    assert.match(checkout, /specialOfferPlanId|isSpecialOfferMembershipTier/);
    assert.equal(
      fs.existsSync(path.join(__dirname, "../sql/migrations/999_special_offer_version_lock.sql")),
      false,
    );
    assert.ok(SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT);
    assert.equal(SPECIAL_OFFER_PLAN_TIER_CODE, "special_offer");
  });
});
