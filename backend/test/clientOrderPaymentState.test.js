const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { attachClientOrderUiFlags } = require("../src/utils/clientOrderUiFlags");
const { sanitizeOrderForClient } = require("../src/utils/orderViewerSanitize");
const fs = require("node:fs");
const path = require("node:path");

describe("attachClientOrderUiFlags", () => {
  it("marks unpaid fixed pending_payment as canPayNow", () => {
    const out = attachClientOrderUiFlags({
      id: "1",
      projectType: "fixed",
      orderStatus: "pending_payment",
      paymentStatus: "pending",
      isPublished: false,
      isOpenForPool: false,
    });
    assert.equal(out.requiresPayment, true);
    assert.equal(out.canPayNow, true);
    assert.equal(out.requiresAdminReview, false);
    assert.equal(out.clientDisplayStatus, "pending_payment");
    assert.equal(out.clientDisplayStatusLabelAr, "بانتظار الدفع");
  });

  it("marks paid unpublished as pending admin review", () => {
    const out = attachClientOrderUiFlags({
      id: "2",
      projectType: "fixed",
      orderStatus: "pending_payment",
      paymentStatus: "paid",
      isPublished: false,
      isOpenForPool: false,
    });
    assert.equal(out.requiresPayment, false);
    assert.equal(out.canPayNow, false);
    assert.equal(out.requiresAdminReview, true);
    assert.equal(out.clientDisplayStatus, "pending_admin_review");
    assert.equal(out.clientDisplayStatusLabelAr, "بانتظار مراجعة الإدارة");
  });

  it("paid open for freelancers is not pay/review pending", () => {
    const out = attachClientOrderUiFlags({
      id: "3",
      projectType: "fixed",
      orderStatus: "open_for_freelancers",
      paymentStatus: "paid",
      isPublished: true,
      isOpenForPool: true,
    });
    assert.equal(out.requiresPayment, false);
    assert.equal(out.canPayNow, false);
    assert.equal(out.requiresAdminReview, false);
  });
});

describe("sanitizeOrderForClient attaches UI flags", () => {
  it("includes canPayNow for unpaid draft", () => {
    const out = sanitizeOrderForClient({
      id: "9",
      projectType: "fixed",
      orderStatus: "pending_payment",
      paymentStatus: "pending",
      isPublished: false,
      isOpenForPool: false,
      assignedFreelancerId: "99",
      createdByUserId: "1",
    });
    assert.equal(out.canPayNow, true);
    assert.equal(out.hasAssignedFreelancer, true);
    assert.equal(out.assignedFreelancerId, undefined);
    assert.equal(out.createdByUserId, undefined);
  });
});

describe("listClientOrders includes unpaid pending_payment", () => {
  it("SQL no longer excludes pending_payment unpaid rows", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/ordersService.js"), "utf8");
    const fnStart = src.indexOf("async function listClientOrders");
    assert.ok(fnStart > 0);
    const slice = src.slice(fnStart, fnStart + 900);
    assert.ok(slice.includes("source_type = 'client_created'"));
    assert.ok(!slice.includes("order_status <> 'pending_payment'"));
  });
});

describe("pool list still requires published + open", () => {
  it("listPoolOrders keeps is_published / is_open_for_pool gates", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/ordersService.js"), "utf8");
    assert.ok(src.includes("`o.is_published = TRUE`"));
    assert.ok(src.includes("`o.is_open_for_pool = TRUE`"));
  });
});
