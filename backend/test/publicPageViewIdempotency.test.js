const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPageViewIdempotencyKey,
  resetNavigationState,
} = require("./helpers/pageViewIdempotency");

test("StrictMode-style duplicate navigation uses the same idempotency key", () => {
  resetNavigationState();
  const a = buildPageViewIdempotencyKey("/");
  const b = buildPageViewIdempotencyKey("/");
  assert.equal(a, b);
});

test("SPA navigation to a new path increments the key", () => {
  resetNavigationState();
  const home = buildPageViewIdempotencyKey("/");
  const about = buildPageViewIdempotencyKey("/about");
  assert.notEqual(home, about);
});

test("Returning to a previous path counts as a new navigation", () => {
  resetNavigationState();
  const first = buildPageViewIdempotencyKey("/");
  const second = buildPageViewIdempotencyKey("/about");
  const third = buildPageViewIdempotencyKey("/");
  assert.notEqual(first, third);
  assert.notEqual(second, third);
});
