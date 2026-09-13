import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePublicPollResumeAt, shouldSkipPublicPoll } from "./publicPollBackoff.js";

describe("publicPollBackoff", () => {
  it("backs off using Retry-After for 429", () => {
    const now = 1_000_000;
    const err = {
      response: {
        status: 429,
        headers: { "retry-after": "45" },
        data: { code: "RATE_LIMITED" },
      },
    };
    assert.equal(computePublicPollResumeAt(err, now), now + 45_000);
    assert.equal(shouldSkipPublicPoll(now + 45_000, now), true);
    assert.equal(shouldSkipPublicPoll(now + 45_000, now + 46_000), false);
  });

  it("uses default backoff when Retry-After missing", () => {
    const now = 5_000;
    const err = { response: { status: 429, headers: {}, data: { code: "RATE_LIMITED" } } };
    assert.equal(computePublicPollResumeAt(err, now), now + 60_000);
  });

  it("does not backoff non-429 errors", () => {
    const now = 9_000;
    assert.equal(computePublicPollResumeAt({ response: { status: 500 } }, now), now);
  });
});
