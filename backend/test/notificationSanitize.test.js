const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeNotificationForViewer } = require("../src/utils/notificationViewerSanitize");

test("sanitizeNotificationForViewer strips actor ids and sensitive metadata for client role", () => {
  const mapped = {
    id: "1",
    recipientUserId: "99",
    actorUserId: "42",
    actor: {
      id: "42",
      accountId: "acc-x",
      firstName: "A",
      fatherName: "B",
      familyName: "C",
      fullName: "A B C",
    },
    type: "order.bid.submitted",
    title: "t",
    message: "m",
    entityType: "order",
    entityId: "5",
    metadata: { orderId: "5", orderCode: "ORD-SECRET", freelancerUserId: "42", amount: 10 },
  };
  const out = sanitizeNotificationForViewer(mapped, "client");
  assert.equal(out.actorUserId, undefined);
  assert.deepEqual(out.actor, { displayName: "A B C" });
  assert.deepEqual(out.metadata, { orderId: "5", amount: 10 });
});

test("sanitizeNotificationForViewer keeps orderCode in metadata for admin", () => {
  const mapped = {
    id: "1",
    recipientUserId: "99",
    actorUserId: "42",
    actor: { id: "42", accountId: "acc", firstName: "A", fatherName: null, familyName: "Z", fullName: "A Z" },
    type: "order.bid.submitted",
    title: "t",
    message: "m",
    entityType: "order",
    entityId: "5",
    metadata: { orderId: "5", orderCode: "ORD-KEEP" },
  };
  const out = sanitizeNotificationForViewer(mapped, "admin");
  assert.equal(out.metadata.orderCode, "ORD-KEEP");
});

test("sanitizeNotificationForViewer keeps full actor and metadata for admin", () => {
  const mapped = {
    id: "1",
    recipientUserId: "99",
    actorUserId: "42",
    actor: { id: "42", accountId: "acc", firstName: "A", fatherName: null, familyName: "Z", fullName: "A Z" },
    type: "x",
    title: "t",
    message: "m",
    entityType: "order",
    entityId: "5",
    metadata: { freelancerUserId: "42" },
  };
  const out = sanitizeNotificationForViewer(mapped, "admin");
  assert.equal(out.actorUserId, "42");
  assert.equal(out.metadata.freelancerUserId, "42");
});
