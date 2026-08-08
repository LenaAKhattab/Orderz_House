const { describe, it } = require("node:test");
const assert = require("node:assert");
const { validationResult } = require("express-validator");
const { updatePlanValidators } = require("../src/validators/plansValidators");
const {
  attachSaleFieldsToMappedPlan,
  assertValidSalePatch,
} = require("../src/utils/planSalePricing");

async function runValidators(body, params = { id: "21" }) {
  const req = { body, params, query: {} };
  for (const validator of updatePlanValidators) {
    // eslint-disable-next-line no-await-in-loop
    await validator.run(req);
  }
  return validationResult(req);
}

const baseBody = {
  title: "باقة سنة",
  description: null,
  durationDays: 365,
  priceJod: 45,
  requiresCompanyVisit: false,
  selfSubscribeAllowed: true,
  isActive: true,
  isVisible: true,
  sortOrder: 30,
  features: ["ميزة"],
  featuresEn: ["feat"],
  trainings: [],
  trainingsEn: [],
  paymentNotes: null,
  installmentPlan: null,
  offerExpiresAt: null,
  offerLabel: null,
  offerLabelEn: null,
  orderValueMinJod: null,
  orderValueMaxJod: null,
  activationRequirements: null,
  refundPolicy: null,
  adminNotes: null,
  isPopular: false,
  isFeatured: false,
  stripeCheckoutAmountJod: null,
  planPageId: 1,
  subscriptionPlanId: null,
  label: null,
  labelEn: null,
  billingText: null,
  billingTextEn: null,
  priceIntroText: null,
  priceIntroTextEn: null,
  buttonText: null,
  buttonTextEn: null,
  buttonUrl: null,
  currency: "JOD",
  titleEn: null,
  descriptionEn: null,
};

describe("plan sale admin validators + serialization", () => {
  it("accepts valid 20% sale payload", async () => {
    const result = await runValidators({
      ...baseBody,
      saleEnabled: true,
      salePercentage: 20,
      saleReason: "عرض خاص لفترة محدودة",
      saleReasonEn: "Limited offer",
    });
    assert.strictEqual(result.isEmpty(), true);
  });

  it("accepts update without sale fields", async () => {
    const result = await runValidators({ ...baseBody, isPopular: true });
    assert.strictEqual(result.isEmpty(), true);
  });

  it("accepts empty offerExpiresAt as null (no validation error)", async () => {
    const result = await runValidators({
      ...baseBody,
      offerExpiresAt: "",
      saleEnabled: false,
      salePercentage: null,
      saleReason: null,
    });
    assert.strictEqual(result.isEmpty(), true);
  });

  it("rejects invalid sale percentage via validators", async () => {
    const result = await runValidators({
      ...baseBody,
      saleEnabled: true,
      salePercentage: 100,
      saleReason: "عرض",
    });
    assert.strictEqual(result.isEmpty(), false);
    assert.match(result.array()[0].msg, /نسبة الخصم/);
  });

  it("rejects free-plan sale in service assert", () => {
    assert.throws(
      () =>
        assertValidSalePatch(
          { saleEnabled: true, salePercentage: 20, saleReason: "عرض" },
          { priceJod: 0, stripeCheckoutAmountJod: null },
        ),
      (err) => err.publicCode === "SALE_NOT_ALLOWED_ON_FREE_PLAN",
    );
  });

  it("mapPlan-like attach keeps original price and computes effective", () => {
    const mapped = attachSaleFieldsToMappedPlan(
      { id: "21", priceJod: 45 },
      {
        price_jod: 45,
        stripe_checkout_amount_jod: null,
        is_recurring: false,
        sale_enabled: true,
        sale_percentage: 20,
        sale_reason: "عرض خاص",
        sale_reason_en: "Sale",
        currency: "JOD",
      },
    );
    assert.strictEqual(mapped.saleEnabled, true);
    assert.strictEqual(mapped.saleActive, true);
    assert.strictEqual(mapped.originalPriceJod, 45);
    assert.strictEqual(mapped.effectivePriceJod, 36);
    assert.strictEqual(mapped.salePercentage, 20);
    assert.strictEqual(mapped.saleReason, "عرض خاص");
  });

  it("plans with null sale continue to serialize", () => {
    const mapped = attachSaleFieldsToMappedPlan(
      { id: "1", priceJod: 0 },
      {
        price_jod: 0,
        is_recurring: false,
        sale_enabled: false,
        sale_percentage: null,
        sale_reason: null,
        sale_reason_en: null,
        currency: "JOD",
      },
    );
    assert.strictEqual(mapped.saleEnabled, false);
    assert.strictEqual(mapped.saleActive, false);
    assert.ok(mapped.effectivePriceJod == null || mapped.effectivePriceJod === 0);
  });
});
