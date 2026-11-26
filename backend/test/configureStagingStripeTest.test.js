const test = require("node:test");
const assert = require("node:assert/strict");

const { upsertEnvLines, mask } = require("../scripts/configureStagingStripeTest");

test("replaces existing Stripe lines and keeps every other line", () => {
  const before = "APP_ENV=staging\nSTRIPE_SECRET_KEY=\nDATABASE_URL=postgres://x\nSTRIPE_WEBHOOK_SECRET=old\n";
  const after = upsertEnvLines(before, { STRIPE_SECRET_KEY: "sk_test_A", STRIPE_WEBHOOK_SECRET: "whsec_B" });
  assert.equal(after, "APP_ENV=staging\nSTRIPE_SECRET_KEY=sk_test_A\nDATABASE_URL=postgres://x\nSTRIPE_WEBHOOK_SECRET=whsec_B\n");
});

test("appends missing keys under a comment and preserves CRLF", () => {
  const before = "APP_ENV=staging\r\nDATABASE_URL=postgres://x\r\n";
  const after = upsertEnvLines(before, { STRIPE_SECRET_KEY: "sk_test_A", STRIPE_WEBHOOK_SECRET: "whsec_B" });
  assert.match(after, /^APP_ENV=staging\r\nDATABASE_URL=postgres:\/\/x\r\n\r\n# Stripe TEST mode/);
  assert.match(after, /\r\nSTRIPE_SECRET_KEY=sk_test_A\r\nSTRIPE_WEBHOOK_SECRET=whsec_B\r\n$/);
});

test("does not touch similarly named keys", () => {
  const before = "STRIPE_SECRET_KEY_OLD=keep\nSTRIPE_SECRET_KEY=\n";
  const after = upsertEnvLines(before, { STRIPE_SECRET_KEY: "sk_test_A" });
  assert.equal(after, "STRIPE_SECRET_KEY_OLD=keep\nSTRIPE_SECRET_KEY=sk_test_A\n");
});

test("mask never reveals the secret body", () => {
  const secret = "sk_test_51AbCdEfGhIjKlMnOp";
  const masked = mask(secret);
  assert.equal(masked, `sk_test_… (${secret.length} chars)`);
  assert.ok(!masked.includes("51AbCd"));
  assert.equal(mask(""), "<missing>");
});
