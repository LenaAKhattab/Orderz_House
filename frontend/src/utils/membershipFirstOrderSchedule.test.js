import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { membershipScheduleView } from "./membershipFirstOrderSchedule.js";

describe("membership schedule copy", () => {
  it("shows no calendar dates before the first real order", () => {
    const view = membershipScheduleView({
      status: "assigned_not_started",
      activationStatus: "company_approved",
      hasFirstOrder: false,
      actualStartDate: null,
      expiryDate: null,
      entitlementDurationMonths: 1,
      source: "admin",
    });
    assert.equal(view.awaitingFirstOrder, true);
    assert.equal(view.statusLabel, "بانتظار أول طلب");
    assert.equal(view.durationLabel, "شهر واحد");
    assert.equal(view.startLabel, "تبدأ عند أول طلب");
    assert.equal(view.expiryLabel, "يُحسب بعد بدء الاشتراك");
  });

  it("shows the real dates after the first order", () => {
    const view = membershipScheduleView({
      status: "active",
      activationStatus: "company_approved",
      hasFirstOrder: true,
      actualStartDate: "2026-11-02T09:30:00.000Z",
      expiryDate: "2026-12-02T09:30:00.000Z",
      entitlementDurationMonths: 1,
    });
    assert.equal(view.awaitingFirstOrder, false);
    assert.equal(view.statusLabel, null);
    assert.equal(view.startLabel, null);
    assert.equal(view.expiryLabel, null);
    assert.equal(view.durationLabel, "شهر واحد");
  });
});
