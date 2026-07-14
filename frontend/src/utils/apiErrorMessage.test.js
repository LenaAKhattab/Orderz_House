import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOrderCreateErrorMessage,
  getRetryAfterSeconds,
  isRateLimitedError,
} from "./apiErrorMessage.js";

describe("apiErrorMessage rate limit helpers", () => {
  it("detects 429 and RATE_LIMITED code", () => {
    assert.equal(isRateLimitedError({ response: { status: 429 } }), true);
    assert.equal(isRateLimitedError({ response: { status: 400, data: { code: "RATE_LIMITED" } } }), true);
    assert.equal(isRateLimitedError({ response: { status: 500 } }), false);
  });

  it("reads Retry-After header", () => {
    assert.equal(
      getRetryAfterSeconds({ response: { headers: { "retry-after": "12" } } }),
      12,
    );
  });

  it("maps order create 429 to clear Arabic message without suggesting auto-retry", () => {
    const msg = getOrderCreateErrorMessage({
      response: {
        status: 429,
        headers: { "retry-after": "8" },
        data: {
          code: "RATE_LIMITED",
          message: "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم حاول مرة أخرى.",
        },
      },
    });
    assert.match(msg, /تم إرسال عدد كبير من الطلبات/);
    assert.match(msg, /8/);
    assert.equal(/retry/i.test(msg), false);
  });
});
