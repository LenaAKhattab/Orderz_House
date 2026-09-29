/**
 * E.164 composition — national trunk-zero stripping for Legacy / auth phones.
 * Run: node --test test/phoneE164.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  composeE164,
  stripNationalTrunkPrefix,
  stripTrunkZeroAfterDialCode,
} = require("../src/utils/phoneE164");

describe("phoneE164 composeE164", () => {
  it("Jordan +962 + 0779001925 → +962779001925", () => {
    assert.equal(
      composeE164({ countryCode: "+962", number: "0779001925" }),
      "+962779001925",
    );
  });

  it("Jordan +962 + 779001925 → +962779001925", () => {
    assert.equal(
      composeE164({ countryCode: "+962", number: "779001925" }),
      "+962779001925",
    );
  });

  it("does not keep duplicate leading zero after dial code", () => {
    const e164 = composeE164({ countryCode: "+962", number: "0779001925" });
    assert.equal(e164, "+962779001925");
    assert.doesNotMatch(e164, /^\+9620/);
  });

  it("strips trunk zero from a full E.164 string", () => {
    assert.equal(stripTrunkZeroAfterDialCode("+9620779001925"), "+962779001925");
    assert.equal(composeE164("+9620779001925"), "+962779001925");
  });

  it("keeps other Arab formats valid without inventing zeros", () => {
    assert.equal(
      composeE164({ countryCode: "+971", number: "501234567" }),
      "+971501234567",
    );
    assert.equal(
      composeE164({ countryCode: "+966", number: "501234567" }),
      "+966501234567",
    );
    assert.equal(
      composeE164({ countryCode: "+20", number: "1012345678" }),
      "+201012345678",
    );
    assert.equal(
      composeE164({ countryCode: "+971", number: "0501234567" }),
      "+971501234567",
    );
  });

  it("rejects clearly invalid phones with VALIDATION_ERROR", () => {
    assert.throws(
      () => composeE164({ countryCode: "+962", number: "12" }),
      (err) => err && err.publicCode === "VALIDATION_ERROR" && err.statusCode === 400,
    );
  });

  it("stripNationalTrunkPrefix removes only leading zeros", () => {
    assert.equal(stripNationalTrunkPrefix("0779001925"), "779001925");
    assert.equal(stripNationalTrunkPrefix("779001925"), "779001925");
    assert.equal(stripNationalTrunkPrefix("0"), "0");
  });
});
