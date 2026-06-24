import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { freePlanNeedsActivationFeeCheckout } from "./planSubscriptionUtils.js";

describe("freePlanNeedsActivationFeeCheckout", () => {
  it("returns true for free plan freelancer with unpaid activation fee", () => {
    assert.equal(
      freePlanNeedsActivationFeeCheckout({
        isFreePlan: true,
        isFreelancer: true,
        activationFeeNeedsPayment: true,
      }),
      true,
    );
  });

  it("returns false when activation fee is already current", () => {
    assert.equal(
      freePlanNeedsActivationFeeCheckout({
        isFreePlan: true,
        isFreelancer: true,
        activationFeeNeedsPayment: false,
      }),
      false,
    );
  });

  it("returns false for guests on free plan", () => {
    assert.equal(
      freePlanNeedsActivationFeeCheckout({
        isFreePlan: true,
        isFreelancer: false,
        activationFeeNeedsPayment: true,
      }),
      false,
    );
  });
});
