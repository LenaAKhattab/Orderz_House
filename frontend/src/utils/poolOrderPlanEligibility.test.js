/**
 * Pool plan lock user-facing messages.
 * Run: node --test src/utils/poolOrderPlanEligibility.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  poolOrderPlanLockUserMessage,
  POOL_PLAN_ELIGIBILITY_MESSAGE_AR,
} from "./poolOrderPlanEligibility.js";

describe("poolOrderPlanLockUserMessage", () => {
  it("maps PLAN_TOO_LOW", () => {
    const msg = poolOrderPlanLockUserMessage({
      poolEligibility: {
        isLockedByPlan: true,
        reasonCode: "PLAN_TOO_LOW",
        lockReason: "ignored when code present",
      },
    });
    assert.equal(msg, POOL_PLAN_ELIGIBILITY_MESSAGE_AR.PLAN_TOO_LOW);
    assert.doesNotMatch(msg, /تصحيح/);
  });

  it("maps INTERNAL_PLAN_CONFIGURATION and sanitizes legacy copy", () => {
    const msg = poolOrderPlanLockUserMessage({
      poolEligibility: {
        isLockedByPlan: true,
        reasonCode: "INTERNAL_PLAN_CONFIGURATION",
        planConfigurationError: true,
        lockReason: "الخطة بحاجة إلى تصحيح قبل إتاحة الطلبات",
      },
    });
    assert.equal(msg, POOL_PLAN_ELIGIBILITY_MESSAGE_AR.INTERNAL_PLAN_CONFIGURATION);
    assert.doesNotMatch(msg, /تصحيح/);
  });

  it("sanitizes legacy lockReason without reasonCode", () => {
    const msg = poolOrderPlanLockUserMessage({
      poolEligibility: {
        isLockedByPlan: true,
        planConfigurationError: true,
        lockReason: "الخطة بحاجة إلى تصحيح قبل إتاحة الطلبات",
      },
    });
    assert.doesNotMatch(msg, /تصحيح/);
    assert.equal(msg, POOL_PLAN_ELIGIBILITY_MESSAGE_AR.INTERNAL_PLAN_CONFIGURATION);
  });
});
