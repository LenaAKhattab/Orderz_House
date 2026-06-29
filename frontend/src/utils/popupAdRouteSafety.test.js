import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPopupRouteBlocked, canShowPopupOnRoute } from "./popupAdRouteSafety.js";

describe("popupAdRouteSafety", () => {
  it("blocks auth and error routes", () => {
    assert.equal(isPopupRouteBlocked("/login"), true);
    assert.equal(isPopupRouteBlocked("/register"), true);
    assert.equal(isPopupRouteBlocked("/forgot-password"), true);
    assert.equal(isPopupRouteBlocked("/unauthorized"), true);
  });

  it("blocks admin ads editing routes", () => {
    assert.equal(isPopupRouteBlocked("/dashboard/admin/ads"), true);
    assert.equal(isPopupRouteBlocked("/dashboard/super-admin/ads"), true);
  });

  it("blocks payment and financial routes", () => {
    assert.equal(isPopupRouteBlocked("/dashboard/client/financial"), true);
    assert.equal(isPopupRouteBlocked("/dashboard/client/orders/create"), true);
    assert.equal(isPopupRouteBlocked("/dashboard/freelancer/plans"), true);
    assert.equal(isPopupRouteBlocked("/dashboard/freelancer/financial-claims"), true);
  });

  it("blocks settings pages", () => {
    assert.equal(isPopupRouteBlocked("/dashboard/client/settings"), true);
    assert.equal(isPopupRouteBlocked("/dashboard/freelancer/settings"), true);
    assert.equal(isPopupRouteBlocked("/dashboard/admin/settings"), true);
    assert.equal(isPopupRouteBlocked("/dashboard/super-admin/settings"), true);
  });

  it("blocks stripe return query params", () => {
    assert.equal(isPopupRouteBlocked("/dashboard/freelancer/plans", "?session_id=cs_test_123"), true);
    assert.equal(isPopupRouteBlocked("/plans", "?checkout=success"), true);
  });

  it("allows safe public routes", () => {
    assert.equal(isPopupRouteBlocked("/"), false);
    assert.equal(isPopupRouteBlocked("/about"), false);
    assert.equal(isPopupRouteBlocked("/services"), false);
    assert.equal(isPopupRouteBlocked("/dashboard/freelancer/courses"), false);
    assert.equal(isPopupRouteBlocked("/dashboard/client/orders"), false);
  });

  it("canShowPopupOnRoute respects blocked routes", () => {
    assert.equal(canShowPopupOnRoute("/login"), false);
    assert.equal(canShowPopupOnRoute("/"), true);
  });
});
