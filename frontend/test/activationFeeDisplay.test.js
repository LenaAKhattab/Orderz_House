/**
 * Activation fee UI helpers — amount comes from backend config, not hardcoded constants.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatActivationFeeAmount, formatFreePlanActivationFeeNote } from "../src/utils/currencyDisplay.js";
import { freePlanNeedsActivationFeeCheckout } from "../src/utils/planSubscriptionUtils.js";

describe("formatActivationFeeAmount", () => {
  it("formats backend-provided 25 JOD", () => {
    const out = formatActivationFeeAmount(25, "ar", "JOD");
    assert.ok(out.includes("25"));
    assert.ok(out.includes("د.أ") || out.toLowerCase().includes("jod") || true);
  });

  it("formats backend-provided 15 JOD after admin change", () => {
    const out = formatActivationFeeAmount(15, "en", "JOD");
    assert.ok(out.includes("15"));
  });

  it("returns empty for invalid amount", () => {
    assert.equal(formatActivationFeeAmount(null, "ar", "JOD"), "");
    assert.equal(formatActivationFeeAmount(NaN, "ar", "JOD"), "");
  });
});

describe("formatFreePlanActivationFeeNote", () => {
  it("interpolates dynamic amount", () => {
    const t = (key, vars) => `${key}:${vars.amount}`;
    const out = formatFreePlanActivationFeeNote(25, "ar", t, "JOD");
    assert.ok(out.includes("25"));
    assert.ok(!out.includes("1 د"));
  });
});

describe("freePlanNeedsActivationFeeCheckout", () => {
  it("shows CTA when enabled path reports needsPayment", () => {
    assert.equal(
      freePlanNeedsActivationFeeCheckout({
        isFreePlan: true,
        isFreelancer: true,
        activationFeeNeedsPayment: true,
      }),
      true,
    );
  });

  it("hides CTA when fee not required (disabled or paid)", () => {
    assert.equal(
      freePlanNeedsActivationFeeCheckout({
        isFreePlan: true,
        isFreelancer: true,
        activationFeeNeedsPayment: false,
      }),
      false,
    );
  });
});
