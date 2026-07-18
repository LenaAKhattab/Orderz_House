import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOrderCreateErrorMessage,
  getRetryAfterSeconds,
  isAxiosCanceledError,
  isAxiosTimeoutError,
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

describe("apiErrorMessage cancel vs timeout", () => {
  it("detects canceled requests separately from timeouts", () => {
    assert.equal(isAxiosCanceledError({ code: "ERR_CANCELED", name: "CanceledError" }), true);
    assert.equal(isAxiosCanceledError({ name: "AbortError", message: "aborted" }), true);
    assert.equal(isAxiosCanceledError({ code: "ECONNABORTED", message: "timeout of 10000ms exceeded" }), false);
    assert.equal(isAxiosTimeoutError({ code: "ECONNABORTED", message: "timeout of 10000ms exceeded" }), true);
    assert.equal(isAxiosTimeoutError({ code: "ERR_CANCELED", name: "CanceledError" }), false);
  });
});
