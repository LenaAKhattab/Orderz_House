/**
 * Delivery visibility: notification click must deep-link to the exact order/review surface.
 * Run from frontend/: node --test src/utils/resolveNotificationNavPath.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNotificationNavPath } from "./resolveNotificationNavPath.js";

describe("resolveNotificationNavPath — delivery visibility", () => {
  it("client delivery notification keeps orderId + openReview from link", () => {
    const path = resolveNotificationNavPath({
      type: "order.delivery.submitted",
      entityType: "order",
      entityId: 42,
      link: "/dashboard/client/my-orders?orderId=42&openReview=1",
      metadata: { orderId: "42", submissionId: "99" },
    });
    assert.equal(path, "/dashboard/client/my-orders?orderId=42&openReview=1");
  });

  it("client legacy list-only link gains orderId + openReview from metadata", () => {
    const path = resolveNotificationNavPath({
      type: "order.delivery.submitted",
      entityType: "order",
      entityId: 42,
      link: "/dashboard/client/my-orders",
      metadata: { orderId: "42" },
    });
    assert.match(path, /\/dashboard\/client\/my-orders\?/);
    assert.match(path, /orderId=42/);
    assert.match(path, /openReview=1/);
  });

  it("admin delivery notification deep-links to admin orders with openReview", () => {
    const path = resolveNotificationNavPath({
      type: "order.delivery.submitted",
      entityType: "order",
      entityId: 77,
      link: "/dashboard/admin/orders",
      metadata: { orderId: "77", openReview: true },
    });
    assert.match(path, /\/dashboard\/admin\/orders\?/);
    assert.match(path, /orderId=77/);
    assert.match(path, /openReview=1/);
  });

  it("super-admin delivery notification deep-links to super-admin orders", () => {
    const path = resolveNotificationNavPath({
      type: "order.delivery.submitted",
      entityType: "order",
      entityId: 88,
      link: "/dashboard/super-admin/orders",
      metadata: { orderId: "88" },
    });
    assert.match(path, /\/dashboard\/super-admin\/orders\?/);
    assert.match(path, /orderId=88/);
    assert.match(path, /openReview=1/);
  });

  it("falls back to entityId when metadata.orderId missing", () => {
    const path = resolveNotificationNavPath({
      type: "order.delivery.submitted",
      entityType: "order",
      entityId: "55",
      link: "/dashboard/client/my-orders",
    });
    assert.match(path, /orderId=55/);
    assert.match(path, /openReview=1/);
  });

  it("does not invent openReview for non-delivery order notifications", () => {
    const path = resolveNotificationNavPath({
      type: "order.revision.requested",
      entityType: "order",
      entityId: 9,
      link: "/dashboard/freelancer/my-orders",
      metadata: { orderId: "9" },
    });
    assert.match(path, /orderId=9/);
    assert.ok(!/[?&]openReview=/.test(path));
  });

  it("rejects external links via safe resolver", () => {
    const path = resolveNotificationNavPath(
      {
        type: "order.delivery.submitted",
        entityType: "order",
        entityId: 1,
        link: "https://evil.example/phish",
        metadata: { orderId: "1" },
      },
      "/dashboard",
    );
    assert.equal(path, "/dashboard");
  });
});
