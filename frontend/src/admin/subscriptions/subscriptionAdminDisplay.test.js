/**
 * Admin eligibility status copy — company approval ≠ fully eligible.
 * Run: node --test src/admin/subscriptions/subscriptionAdminDisplay.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activationStatusLabel,
  adminSubscriptionActivationMenuLabel,
  describeFreelancerAdminEligibilityState,
  formatSubscriptionAdminDate,
} from "./subscriptionAdminDisplay.js";

describe("activationStatusLabel", () => {
  it("does not use generic مفعّل for company_approved", () => {
    assert.equal(activationStatusLabel("company_approved"), "موافقة الشركة مكتملة");
    assert.notEqual(activationStatusLabel("company_approved"), "مفعّل");
  });
});

describe("describeFreelancerAdminEligibilityState", () => {
  it("company-approved + fee unpaid", () => {
    const state = describeFreelancerAdminEligibilityState({
      eligibility: { eligible: false, reason: "activation_fee_unpaid" },
      subscription: { activationStatus: "company_approved", status: "assigned_not_started" },
      activationFeeStatus: { needsPayment: true, isCurrent: false },
    });
    assert.equal(state.code, "activation_fee_unpaid");
    assert.equal(state.label, "موافقة الشركة مكتملة، لكن رسوم التفعيل غير مدفوعة");
    assert.equal(state.canTakeOrders, false);
  });

  it("fully eligible", () => {
    const state = describeFreelancerAdminEligibilityState({
      eligibility: { eligible: true, reason: "assigned_not_started" },
      subscription: { activationStatus: "company_approved", status: "assigned_not_started" },
      activationFeeStatus: { needsPayment: false, isCurrent: true },
    });
    assert.equal(state.code, "fully_eligible");
    assert.equal(state.label, "المستخدم مؤهل لاستلام الطلبات");
    assert.equal(state.canTakeOrders, true);
  });

  it("plan configuration error", () => {
    const state = describeFreelancerAdminEligibilityState({
      eligibility: { eligible: false, reason: "plan_configuration_error" },
      subscription: { activationStatus: "company_approved", status: "assigned_not_started" },
    });
    assert.equal(state.code, "plan_configuration_error");
    assert.equal(state.label, "الخطة بحاجة إلى تصحيح قبل إتاحة الطلبات");
  });
});

describe("adminSubscriptionActivationMenuLabel", () => {
  it("never shows مفعّل بالكامل when fee unpaid", () => {
    const label = adminSubscriptionActivationMenuLabel({
      isApproved: true,
      canActivate: false,
      eligibility: { eligible: false, reason: "activation_fee_unpaid" },
      subscription: { activationStatus: "company_approved" },
      activationFeeStatus: { needsPayment: true },
    });
    assert.match(label, /رسوم التفعيل غير مدفوعة/);
    assert.ok(!label.includes("مفعّل بالكامل"));
    assert.ok(!label.includes("مفعّل بالفعل"));
  });
});

describe("formatSubscriptionAdminDate", () => {
  it("formats date-only as DD/MM/YYYY and handles null/invalid", () => {
    assert.equal(formatSubscriptionAdminDate(null), "—");
    assert.equal(formatSubscriptionAdminDate(""), "—");
    assert.equal(formatSubscriptionAdminDate("not-a-date"), "—");
    const formatted = formatSubscriptionAdminDate("2026-07-18T12:00:00.000Z");
    assert.match(formatted, /^\d{2}\/\d{2}\/\d{4}$/);
  });
});
