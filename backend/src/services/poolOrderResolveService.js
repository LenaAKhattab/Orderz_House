const { pool } = require("../config/db");
const ordersService = require("./ordersService");
const fakeOrdersService = require("./fakeOrdersService");
const orderFlowService = require("./orderFlowService");

async function isFakeOrderInActivePool(orderId) {
  const oid = Number(orderId);
  if (!Number.isInteger(oid) || oid <= 0) return false;
  const { rows } = await pool.query(
    `SELECT 1
     FROM fake_orders fo
     INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
       -- Exclusive end: visible_until > NOW() matches pool list / trainingPoolEligibility.
       AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
     INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id AND fr.status = 'active'
     WHERE fo.id = $1 AND fo.fake_status = 'active'
     LIMIT 1`,
    [oid],
  );
  return rows.length > 0;
}

async function loadRealPoolOrder(orderId, freelancerUserId = null) {
  const order = await ordersService.getOrderById(orderId);
  if (!order) return null;
  if (!["admin_created", "super_admin_created", "client_created"].includes(order.sourceType)) return null;
  if (!orderFlowService.orderApiEligibleForFreelancerPool(order)) return null;
  if (String(order.visibilityScope || "public") === "institution") {
    if (!freelancerUserId) return null;
    const stored = require("./institutionalStoredOrdersService");
    const access = await stored.assertUserCanViewInstitutionalOrder(freelancerUserId, order.id);
    if (!access.allowed) return null;
  }
  return { kind: "real", order };
}

async function loadFakePoolOrder(orderId, freelancerUserId, role) {
  const maySee = await fakeOrdersService.poolViewerMaySeeFakeOrders({
    userId: freelancerUserId ?? null,
    role: role ?? null,
  });
  if (!maySee) return null;
  const order = await fakeOrdersService.getFakePoolOrderMapped({
    orderId,
    freelancerUserId: freelancerUserId ?? null,
  });
  if (!order) return null;
  return { kind: "fake", order };
}

/**
 * Resolve a pool order id to a real or training (fake) row without exposing kind to clients.
 * When both tables share the same numeric id, prefer whichever is in the active pool.
 */
async function resolvePoolOrderForViewer(orderId, { userId = null, role = null } = {}) {
  const [realHit, fakeHit] = await Promise.all([
    loadRealPoolOrder(orderId, userId),
    loadFakePoolOrder(orderId, userId, role),
  ]);
  if (!realHit && !fakeHit) return null;
  if (realHit && !fakeHit) return realHit;
  if (fakeHit && !realHit) return fakeHit;

  const inRealPool = Boolean(realHit);
  const inFakePool = await isFakeOrderInActivePool(orderId);
  if (inFakePool && !inRealPool) return fakeHit;
  if (inRealPool && !inFakePool) return realHit;
  if (inFakePool) return fakeHit;
  return realHit;
}

async function enrichFreelancerPoolOrder(resolved, freelancerUserId) {
  const { kind, order } = resolved;
  const planOrderValueEligibility = require("./planOrderValueEligibility");
  const range = await planOrderValueEligibility.getFreelancerPlanOrderValueRange(freelancerUserId);
  const poolEligibility = planOrderValueEligibility.computePoolOrderPlanEligibility(
    { ...order, orderSource: kind },
    range,
  );
  if (kind === "fake") {
    return {
      kind,
      order: {
        ...order,
        myClaim: null,
        myBid: order.myBid ?? null,
        poolEligibility,
      },
    };
  }
  let myClaim = null;
  let myBid = order.myBid ?? null;
  if (order.projectType !== "fixed") {
    myClaim = await ordersService.getMyOrderClaim({ orderId: order.id, freelancerUserId });
  }
  if (order.projectType === "bidding" && order.bidBudgetMin != null && order.bidBudgetMax != null) {
    myBid = await ordersService.getMyOrderBid({ orderId: order.id, freelancerUserId });
  }
  return { kind, order: { ...order, myClaim, myBid, poolEligibility } };
}

module.exports = {
  resolvePoolOrderForViewer,
  enrichFreelancerPoolOrder,
  isFakeOrderInActivePool,
};
