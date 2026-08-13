/**
 * Phase A2 — Article value derivation unit tests.
 * Run: node --test test/marketplaceArticleValue.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertArticleLevel,
  deriveArticleValueJodFromLevel,
  formatArticleValueJodForDb,
  assertArticleValueMatchesLevel,
} = require("../src/utils/marketplaceArticleValue");
const {
  ARTICLE_LEVEL_WORD_REFERENCE_GLOBAL_MATRIX,
  ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT,
  ARTICLE_WORK_TOKEN_MOVEMENT,
  ARTICLE_HISTORICAL_BACKFILL,
  FREE_SIGNUP_WORK_TOKEN_GRANT,
} = require("../src/constants/marketplaceArticles");

describe("marketplaceArticleValue", () => {
  it("maps levels 1..5 to 1..5 JOD", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      assert.equal(deriveArticleValueJodFromLevel(level), level);
      assert.equal(formatArticleValueJodForDb(level), `${level}.000`);
    }
  });

  it("rejects level 0 and 6 and non-integers", () => {
    assert.throws(() => assertArticleLevel(0));
    assert.throws(() => assertArticleLevel(6));
    assert.throws(() => assertArticleLevel(1.5));
    assert.throws(() => assertArticleLevel("elite"));
  });

  it("rejects forged inconsistent value", () => {
    assert.throws(() => assertArticleValueMatchesLevel(2, 5));
    assert.equal(assertArticleValueMatchesLevel(3, 3), 3);
    assert.equal(assertArticleValueMatchesLevel(4, undefined), 4);
  });
});

describe("marketplaceArticles A2 policy constants", () => {
  it("declares deferred/out-of-scope policies", () => {
    assert.equal(ARTICLE_LEVEL_WORD_REFERENCE_GLOBAL_MATRIX, "NOT_DEFINED");
    assert.equal(ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT, "NOT_IMPLEMENTED_IN_A2");
    assert.equal(ARTICLE_WORK_TOKEN_MOVEMENT, "NONE");
    assert.equal(ARTICLE_HISTORICAL_BACKFILL, "NONE");
    assert.equal(FREE_SIGNUP_WORK_TOKEN_GRANT, "NONE");
  });
});
