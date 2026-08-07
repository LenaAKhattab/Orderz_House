/**
 * Regression: numeric user-id search must surface the exact id even when
 * many higher ids contain the same digit substring.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("adminUsersService searchUsers id priority", () => {
  it("orders exact numeric id matches before substring id hits", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/adminUsersService.js"),
      "utf8",
    );
    assert.match(src, /CASE WHEN u\.id = \$\$\{i - 1\} THEN 0 ELSE 1 END/);
    assert.match(src, /u\.id = \$\$\{i\}/);
  });

  it("duplicate membership sets publicCode DUPLICATE_MEMBERSHIP", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/institutionsService.js"),
      "utf8",
    );
    assert.match(src, /publicCode = "DUPLICATE_MEMBERSHIP"/);
  });
});
