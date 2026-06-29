const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

// Inline mirrors of popupAdsService page-scope helpers for regression without DB.
function normalizePathname(pathname) {
  const raw = String(pathname || "/").trim();
  if (!raw || raw === "") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function isClientFreelancerDashboardPath(pathname) {
  const path = normalizePathname(pathname);
  return path.startsWith("/dashboard/client") || path.startsWith("/dashboard/freelancer");
}

function matchesPageScope(pageScope, pathname) {
  const path = normalizePathname(pathname);
  switch (pageScope) {
    case "home":
      return path === "/";
    case "public":
      return !path.startsWith("/dashboard");
    case "dashboard":
      return isClientFreelancerDashboardPath(path);
    case "all":
    default:
      return true;
  }
}

function matchesAudience(audience, { role, isAuthenticated }) {
  const STAFF = new Set(["admin", "super_admin"]);
  switch (audience) {
    case "guests":
      return !isAuthenticated;
    case "freelancer":
      return role === "freelancer";
    case "client":
      return role === "client";
    case "staff":
      return STAFF.has(role);
    case "all":
    default:
      return true;
  }
}

describe("popupAdsService targeting", () => {
  it("dashboard scope is client/freelancer dashboards only", () => {
    assert.equal(matchesPageScope("dashboard", "/dashboard/client"), true);
    assert.equal(matchesPageScope("dashboard", "/dashboard/freelancer/courses"), true);
    assert.equal(matchesPageScope("dashboard", "/dashboard/admin"), false);
    assert.equal(matchesPageScope("dashboard", "/dashboard/super-admin"), false);
  });

  it("public scope excludes dashboard", () => {
    assert.equal(matchesPageScope("public", "/about"), true);
    assert.equal(matchesPageScope("public", "/dashboard/client"), false);
  });

  it("audience guests excludes authenticated users", () => {
    assert.equal(matchesAudience("guests", { role: null, isAuthenticated: false }), true);
    assert.equal(matchesAudience("guests", { role: "client", isAuthenticated: true }), false);
  });

  it("audience staff is admin and super_admin only", () => {
    assert.equal(matchesAudience("staff", { role: "admin", isAuthenticated: true }), true);
    assert.equal(matchesAudience("staff", { role: "super_admin", isAuthenticated: true }), true);
    assert.equal(matchesAudience("staff", { role: "freelancer", isAuthenticated: true }), false);
  });
});
