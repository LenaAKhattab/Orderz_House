import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSearchUsers } from "./institutionMemberSearchUtils.js";

describe("institution member search gate", () => {
  it("requires 2 chars for text and 1 digit for numeric ids", () => {
    assert.equal(shouldSearchUsers(""), false);
    assert.equal(shouldSearchUsers("a"), false);
    assert.equal(shouldSearchUsers("ab"), true);
    assert.equal(shouldSearchUsers("1"), true);
    assert.equal(shouldSearchUsers("12"), true);
  });
});
