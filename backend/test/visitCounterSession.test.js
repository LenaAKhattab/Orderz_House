const test = require("node:test");
const assert = require("node:assert/strict");

const VISIT_COUNTER_SESSION_TTL_MS = 30 * 60 * 1000;

/** Mirrors frontend shouldIncrementVisitCounter sliding-window logic. */
function simulateVisitCounter(actions) {
  let lastActivityAt = null;
  let increments = 0;
  let now = 0;

  for (const action of actions) {
    if (action.type === "advance") {
      now += action.ms;
      continue;
    }
    if (action.type === "visit") {
      let shouldIncrement = true;
      if (lastActivityAt != null && now - lastActivityAt < VISIT_COUNTER_SESSION_TTL_MS) {
        shouldIncrement = false;
      }
      lastActivityAt = now;
      if (shouldIncrement) increments += 1;
      action.onResult?.({ shouldIncrement, now, increments });
    }
  }

  return { increments, lastActivityAt };
}

test("refresh within 30 minutes does not increment the counter", () => {
  const seen = [];
  simulateVisitCounter([
    { type: "visit", onResult: (r) => seen.push(r) },
    { type: "visit", onResult: (r) => seen.push(r) },
  ]);
  assert.equal(seen[0].shouldIncrement, true);
  assert.equal(seen[1].shouldIncrement, false);
  assert.equal(seen[1].increments, 1);
});

test("returning after 30 minutes of inactivity increments again", () => {
  const seen = [];
  simulateVisitCounter([
    { type: "visit", onResult: (r) => seen.push(r) },
    { type: "advance", ms: VISIT_COUNTER_SESSION_TTL_MS + 1 },
    { type: "visit", onResult: (r) => seen.push(r) },
  ]);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].increments, 1);
  assert.equal(seen[1].shouldIncrement, true);
  assert.equal(seen[1].increments, 2);
});

test("activity within the window extends the session without incrementing", () => {
  const { increments } = simulateVisitCounter([
    { type: "visit" },
    { type: "advance", ms: 20 * 60 * 1000 },
    { type: "visit" },
    { type: "advance", ms: 20 * 60 * 1000 },
    { type: "visit" },
  ]);
  assert.equal(increments, 1);
});
