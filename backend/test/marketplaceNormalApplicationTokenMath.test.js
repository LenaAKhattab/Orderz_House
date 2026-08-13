/**

 * Pure CEIL + snapshot-based refund math for Phase 5 normal application Tokens.

 */

const { describe, it } = require("node:test");

const assert = require("node:assert/strict");

const {

  ceilRequiredNormalApplicationTokens,

  fullNormalApplicationRefundTokens,

  refundTokensFromEconomicSnapshot,

  assertNormalApplicationRefundPercentage,

} = require("../src/utils/marketplaceNormalApplicationTokenMath");

const { WORK_TOKEN_ERROR_CODES } = require("../src/constants/marketplaceWorkTokens");



describe("marketplaceNormalApplicationTokenMath", () => {

  it("CEIL: exact integers stay exact", () => {

    assert.equal(ceilRequiredNormalApplicationTokens(10, 1), 10);

    assert.equal(ceilRequiredNormalApplicationTokens("10.000", "1.000"), 10);

  });



  it("CEIL: fractional products round up", () => {

    assert.equal(ceilRequiredNormalApplicationTokens(10.1, 1), 11);

    assert.equal(ceilRequiredNormalApplicationTokens(10.9, 1), 11);

    assert.equal(ceilRequiredNormalApplicationTokens(10, 1.1), 11);

    assert.equal(ceilRequiredNormalApplicationTokens("3.333", "1.000"), 4);

  });



  it("FULL 100% snapshot refund: returns exact token_cost", () => {

    assert.equal(

      refundTokensFromEconomicSnapshot({

        tokenCost: 11,

        refundPercentage: 100,

        refundRoundingRule: "FULL",

      }),

      11,

    );

    assert.equal(fullNormalApplicationRefundTokens(1), 1);

    assert.equal(fullNormalApplicationRefundTokens(100), 100);

  });



  it("non-100 snapshot fails closed without inventing rounding", () => {

    assert.throws(

      () =>

        refundTokensFromEconomicSnapshot({

          tokenCost: 10,

          refundPercentage: 80,

          refundRoundingRule: "POLICY_PENDING",

        }),

      (err) =>

        err.publicCode === WORK_TOKEN_ERROR_CODES.FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED,

    );

  });



  it("validates refund percentage range", () => {

    assert.equal(assertNormalApplicationRefundPercentage(100), 100);

    assert.equal(assertNormalApplicationRefundPercentage("80.00"), 80);

    assert.throws(() => assertNormalApplicationRefundPercentage(101));

    assert.throws(() => assertNormalApplicationRefundPercentage(-1));

  });



  it("rejects non-positive budget", () => {

    assert.throws(() => ceilRequiredNormalApplicationTokens(0, 1), /budget|Pricing|positive/i);

  });

});


