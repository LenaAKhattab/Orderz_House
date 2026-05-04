/**
 * Public pool sanitizer must not expose assignment or payment linkage to guests.
 * Run: npm run test:pool-sanitize  |  npm test
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/pool_sanitize_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { sanitizePublicPoolOrder, sanitizeFreelancerPoolOrder } = require("../src/utils/poolOrderSanitize");

describe("sanitizePublicPoolOrder", () => {
  it("does not include assignedFreelancerId even when input has one", () => {
    const raw = {
      id: "1",
      orderCode: "X",
      title: "T",
      description: "D",
      categoryId: "1",
      assignedFreelancerId: "999",
      paymentStatus: "paid",
      orderStatus: "open_for_freelancers",
      isPublished: true,
      isOpenForPool: true,
      isArchived: false,
    };
    const safe = sanitizePublicPoolOrder(raw);
    assert.strictEqual(safe.assignedFreelancerId, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "assignedFreelancerId"));
    assert.strictEqual(safe.hasAssignedFreelancer, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "orderCode"));
  });

  it("pool list rows mapped like GET /orders/pool omit assignment id", () => {
    const listRow = {
      id: "9",
      title: "Job",
      description: "D",
      categoryId: "1",
      category: { id: "1", slug: "c", name: "Cat" },
      assignedFreelancerId: null,
      createdByUserId: "77",
      paymentStatus: "paid",
      applicantsCount: 2,
      bidsCount: 2,
      filesCount: 0,
      files: [],
      orderSource: "real",
    };
    const safe = sanitizePublicPoolOrder(listRow);
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "assignedFreelancerId"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "createdByUserId"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "paymentStatus"));
    assert.strictEqual(safe.hasAssignedFreelancer, false);
  });

  it("freelancer pool sanitizer omits internal IDs; uses hasAssignedFreelancer flag", () => {
    const order = {
      id: "1",
      title: "T",
      assignedFreelancerId: "42",
      createdByUserId: "7",
      paymentStatus: "paid",
      bidUsers: [{ bidId: "1", user: { id: "9", email: "x@y.com" } }],
    };
    const out = sanitizeFreelancerPoolOrder(order);
    assert.ok(!Object.prototype.hasOwnProperty.call(out, "assignedFreelancerId"));
    assert.ok(!Object.prototype.hasOwnProperty.call(out, "createdByUserId"));
    assert.strictEqual(out.paymentStatus, undefined);
    assert.strictEqual(out.hasAssignedFreelancer, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(out, "bidUsers"));
  });
});
