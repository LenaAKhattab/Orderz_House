const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeOrderForFreelancerAssigned,
  sanitizeOrderForClient,
  canViewOrderNumber,
} = require("../src/utils/orderViewerSanitize");

test("client order payload omits orderCode", () => {
  const o = sanitizeOrderForClient({ id: "1", orderCode: "ORD-X", title: "T", orderStatus: "completed" });
  assert.ok(!Object.prototype.hasOwnProperty.call(o, "orderCode"));
});

test("freelancer assigned: orderCode only when completed", () => {
  const active = sanitizeOrderForFreelancerAssigned({
    id: "1",
    orderCode: "ORD-A",
    title: "T",
    orderStatus: "in_progress",
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(active, "orderCode"));

  const done = sanitizeOrderForFreelancerAssigned({
    id: "1",
    orderCode: "ORD-B",
    title: "T",
    orderStatus: "completed",
  });
  assert.equal(done.orderCode, "ORD-B");
});

test("canViewOrderNumber matches policy", () => {
  assert.equal(canViewOrderNumber("admin", { orderStatus: "draft" }), true);
  assert.equal(canViewOrderNumber("client", { orderStatus: "completed" }), false);
  assert.equal(canViewOrderNumber("freelancer", { orderStatus: "in_progress" }), false);
  assert.equal(canViewOrderNumber("freelancer", { orderStatus: "completed" }), true);
  assert.equal(canViewOrderNumber("", { orderStatus: "completed" }), false);
});
