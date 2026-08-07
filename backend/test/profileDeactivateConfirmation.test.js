/**
 * Unit tests for profile account deactivate confirmation rules (no DB).
 * Full integration of deactivateOwnAccount requires Postgres + seeded user.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");

const { ROLES } = require("../src/constants/roles");

function isValidDeactivateConfirmation(raw) {
  const conf = String(raw || "").trim();
  return conf === "حذف" || conf.toUpperCase() === "DELETE";
}

function maySelfDeactivate(legacyRole) {
  const role = String(legacyRole || "").trim().toLowerCase();
  return role !== ROLES.ADMIN && role !== ROLES.SUPER_ADMIN;
}

describe("profile deactivate confirmation", () => {
  it("accepts Arabic حذف and English DELETE", () => {
    assert.strictEqual(isValidDeactivateConfirmation("حذف"), true);
    assert.strictEqual(isValidDeactivateConfirmation(" DELETE "), true);
    assert.strictEqual(isValidDeactivateConfirmation("delete"), true);
  });

  it("rejects empty or wrong confirmation", () => {
    assert.strictEqual(isValidDeactivateConfirmation(""), false);
    assert.strictEqual(isValidDeactivateConfirmation("نعم"), false);
    assert.strictEqual(isValidDeactivateConfirmation("delete account"), false);
  });

  it("blocks admin self-deactivate; allows client and freelancer", () => {
    assert.strictEqual(maySelfDeactivate(ROLES.CLIENT), true);
    assert.strictEqual(maySelfDeactivate(ROLES.FREELANCER), true);
    assert.strictEqual(maySelfDeactivate(ROLES.ADMIN), false);
    assert.strictEqual(maySelfDeactivate(ROLES.SUPER_ADMIN), false);
  });
});
