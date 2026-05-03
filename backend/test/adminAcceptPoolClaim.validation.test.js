/**
 * PATCH /api/admin/orders/:id/accept — claimId body validation (same chain as adminOrdersRoutes).
 * Invalid bodies must not reach the controller handler.
 *
 * Run: npm run test:admin-accept-claim
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const { once } = require("node:events");

const validateRequest = require("../src/middleware/validateRequest");
const {
  orderIdParam,
  clientOrderClaimIdBodyValidators,
} = require("../src/validators/ordersValidators");

function createValidationApp() {
  const app = express();
  app.use(express.json());
  let controllerCalls = 0;
  app.patch(
    "/api/admin/orders/:id/accept",
    orderIdParam,
    ...clientOrderClaimIdBodyValidators,
    validateRequest,
    (req, res) => {
      controllerCalls += 1;
      res.status(200).json({
        success: true,
        data: { claimId: req.body.claimId },
      });
    },
  );
  return { app, getControllerCalls: () => controllerCalls, resetCalls: () => { controllerCalls = 0; } };
}

async function patchAccept(serverPort, bodyObj) {
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/admin/orders/12/accept`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

describe("admin accept pool claim — claimId validation", () => {
  let server;
  let port;
  let appCtx;

  beforeEach(async () => {
    appCtx = createValidationApp();
    server = appCtx.app.listen(0);
    await once(server, "listening");
    port = server.address().port;
    appCtx.resetCalls();
  });

  afterEach((done) => {
    server.close(done);
  });

  it("rejects missing claimId (400, controller not run)", async () => {
    const { status, json } = await patchAccept(port, {});
    assert.strictEqual(status, 400);
    assert.strictEqual(json?.code, "VALIDATION_ERROR");
    assert.strictEqual(appCtx.getControllerCalls(), 0);
  });

  it("rejects non-integer claimId", async () => {
    const { status, json } = await patchAccept(port, { claimId: "not-a-number" });
    assert.strictEqual(status, 400);
    assert.strictEqual(json?.code, "VALIDATION_ERROR");
    assert.strictEqual(appCtx.getControllerCalls(), 0);
  });

  it("rejects zero claimId", async () => {
    const { status } = await patchAccept(port, { claimId: 0 });
    assert.strictEqual(status, 400);
    assert.strictEqual(appCtx.getControllerCalls(), 0);
  });

  it("rejects negative claimId", async () => {
    const { status } = await patchAccept(port, { claimId: -5 });
    assert.strictEqual(status, 400);
    assert.strictEqual(appCtx.getControllerCalls(), 0);
  });

  it("accepts positive integer claimId and reaches controller", async () => {
    const { status, json } = await patchAccept(port, { claimId: 42 });
    assert.strictEqual(status, 200);
    assert.strictEqual(json?.success, true);
    assert.strictEqual(json?.data?.claimId, 42);
    assert.strictEqual(appCtx.getControllerCalls(), 1);
  });

  it("rejects invalid order id param", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/orders/abc/accept`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId: 1 }),
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(appCtx.getControllerCalls(), 0);
  });
});
