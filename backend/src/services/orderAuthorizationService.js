/**
 * Central order access control — always use authenticated user id from req.auth, never request body.
 */
const orderFlowService = require("./orderFlowService");
const planOrderValueEligibility = require("./planOrderValueEligibility");
const { collectResolvedRoleNames } = require("../utils/roleResolution");

/** Staff panel operators (legacy `super_admin` DB role retained; no new roles added). */
const STAFF_ORDER_ROLES = Object.freeze(["admin", "super_admin"]);

function authError(message, statusCode = 403, reason = "forbidden", exposeToClient = true) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.reason = reason;
  err.exposeToClient = exposeToClient;
  return err;
}

function notFoundError(message = "Order not found.") {
  return authError(message, 404, "not_found", false);
}

function isStaffAuth(auth) {
  const roles = collectRoleNames(auth);
  return roles.some((r) => STAFF_ORDER_ROLES.includes(r));
}

function isFreelancerAuth(auth) {
  return collectRoleNames(auth).includes("freelancer");
}

function isClientAuth(auth) {
  return collectRoleNames(auth).includes("client");
}

function collectRoleNames(auth) {
  return collectResolvedRoleNames(auth);
}

function requireAuthenticatedUserId(auth) {
  const uid = Number(auth?.userId);
  if (!Number.isInteger(uid) || uid < 1) {
    throw authError("يجب تسجيل الدخول.", 401, "unauthorized");
  }
  return uid;
}

function logBlockedAccess(action, details = {}) {
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      component: "order_authorization",
      event: "access_denied",
      action,
      ...details,
    }),
  );
}

function dbPool(clientMaybe) {
  return clientMaybe || require("../config/db").pool;
}

async function loadOrderRow(orderId, clientMaybe) {
  const oid = Number(orderId);
  if (!Number.isInteger(oid) || oid < 1) return null;
  const runner = dbPool(clientMaybe);
  const { rows } = await runner.query(`SELECT * FROM orders WHERE id = $1::bigint LIMIT 1`, [oid]);
  return rows[0] || null;
}

async function assertClientOwnsOrder(clientUserId, orderId, clientMaybe) {
  const uid = Number(clientUserId);
  const order = await loadOrderRow(orderId, clientMaybe);
  if (!order) throw notFoundError("الطلب غير موجود.");
  if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== uid) {
    logBlockedAccess("client_owns_order", { orderId: String(orderId), clientUserId: String(uid) });
    throw authError("لا يمكنك إدارة هذا الطلب.", 403, "client_not_owner");
  }
  return order;
}

async function assertFreelancerAssignedToOrder(freelancerUserId, orderId, clientMaybe) {
  const uid = Number(freelancerUserId);
  const order = await loadOrderRow(orderId, clientMaybe);
  if (!order) throw notFoundError();
  const assigned = order.assigned_freelancer_id ? Number(order.assigned_freelancer_id) : null;
  const accepted = order.accepted_freelancer_id ? Number(order.accepted_freelancer_id) : null;
  if (assigned !== uid && accepted !== uid) {
    logBlockedAccess("freelancer_assigned", { orderId: String(orderId), freelancerUserId: String(uid) });
    throw authError("هذا الطلب غير مسند إليك.", 403, "freelancer_not_assigned");
  }
  return order;
}

async function assertFreelancerCanAccessPoolOrder(freelancerUserId, orderOrId, clientMaybe) {
  const order =
    orderOrId && typeof orderOrId === "object" && orderOrId.id != null
      ? orderOrId
      : await loadOrderRow(typeof orderOrId === "object" ? orderOrId?.id : orderOrId, clientMaybe);
  if (!order) throw notFoundError();
  if (!orderFlowService.orderRowEligibleForFreelancerPoolListing(order)) {
    logBlockedAccess("pool_listing", { orderId: String(order.id), freelancerUserId: String(freelancerUserId) });
    throw notFoundError();
  }
  await planOrderValueEligibility.assertFreelancerMayAccessOrderByPlan(freelancerUserId, order, clientMaybe);
  // E1: Marketplace Membership project-value gate (additive; does not remove legacy plan gate).
  try {
    const runner = clientMaybe || require("../config/db").pool;
    const { rows } = await runner.query(
      `SELECT p.tier_code, p.project_min_value_jod, p.max_real_order_value_jod, p.unlimited_real_order_value
         FROM freelancer_marketplace_memberships m
         JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
        WHERE m.freelancer_user_id = $1
          AND m.is_current = TRUE
          AND m.status IN ('active', 'cancel_at_period_end', 'purchased_pending_start')
        LIMIT 1`,
      [Number(freelancerUserId)],
    );
    if (rows[0]) {
      const projectValue =
        order.budget_jod != null
          ? Number(order.budget_jod)
          : order.max_budget_jod != null
            ? Number(order.max_budget_jod)
            : order.price_jod != null
              ? Number(order.price_jod)
              : null;
      if (projectValue != null && Number.isFinite(projectValue)) {
        const eligibility = require("./marketplaceMembershipEligibilityService");
        eligibility.assertProjectValueEligible(
          {
            tierCode: rows[0].tier_code,
            projectMinValueJod: rows[0].project_min_value_jod,
            maxRealOrderValueJod: rows[0].max_real_order_value_jod,
            unlimitedRealOrderValue: rows[0].unlimited_real_order_value,
          },
          projectValue,
        );
      }
    }
  } catch (e1Err) {
    if (e1Err?.publicCode === "MEMBERSHIP_PROJECT_VALUE_BLOCKED") throw e1Err;
    if (e1Err?.code === "42703" || e1Err?.code === "42P01") {
      // Pre-153: skip
    } else if (e1Err?.statusCode) {
      throw e1Err;
    }
  }
  return order;
}

async function assertFreelancerCanBidOrder(freelancerUserId, orderOrId, clientMaybe) {
  const subscriptionsService = require("./subscriptionsService");
  const eligibility = await subscriptionsService.canFreelancerTakeOrders(String(freelancerUserId));
  if (!eligibility.eligible) {
    logBlockedAccess("bid_subscription", { freelancerUserId: String(freelancerUserId), reason: eligibility.reason });
    throw authError("Your subscription is not active. You cannot submit bids.", 403, eligibility.reason || "subscription_ineligible");
  }
  // M4: if current marketplace membership is purchased_pending_start / paid, enforce identity+training.
  try {
    const membershipsService = require("./marketplaceMembershipsService");
    const membershipEligibility = require("./marketplaceMembershipEligibilityService");
    const membership = await membershipsService.resolveCurrentMarketplaceMembershipForFreelancer(
      freelancerUserId,
      { client: clientMaybe || null },
    );
    if (membership) {
      await membershipEligibility.assertMarketplaceApplyGates(clientMaybe || null, freelancerUserId, {
        membership,
      });
    }
  } catch (gateErr) {
    if (gateErr?.statusCode) throw gateErr;
    if (gateErr?.code === "42P01" || gateErr?.code === "42703") {
      // schema missing — leave legacy path
    } else {
      throw gateErr;
    }
  }
  return assertFreelancerCanAccessPoolOrder(freelancerUserId, orderOrId, clientMaybe);
}

async function assertFreelancerCanClaimOrder(freelancerUserId, orderOrId, clientMaybe) {
  const subscriptionsService = require("./subscriptionsService");
  const eligibility = await subscriptionsService.canFreelancerTakeOrders(String(freelancerUserId));
  if (!eligibility.eligible) {
    logBlockedAccess("claim_subscription", { freelancerUserId: String(freelancerUserId), reason: eligibility.reason });
    throw authError("You are not allowed to take this order.", 403, eligibility.reason || "subscription_ineligible");
  }
  try {
    const membershipsService = require("./marketplaceMembershipsService");
    const membershipEligibility = require("./marketplaceMembershipEligibilityService");
    const membership = await membershipsService.resolveCurrentMarketplaceMembershipForFreelancer(
      freelancerUserId,
      { client: clientMaybe || null },
    );
    if (membership) {
      await membershipEligibility.assertMarketplaceApplyGates(clientMaybe || null, freelancerUserId, {
        membership,
      });
    }
  } catch (gateErr) {
    if (gateErr?.statusCode) throw gateErr;
    if (gateErr?.code === "42P01" || gateErr?.code === "42703") {
      // schema missing
    } else {
      throw gateErr;
    }
  }
  const order = await assertFreelancerCanAccessPoolOrder(freelancerUserId, orderOrId, clientMaybe);
  return order;
}

/**
 * Client (owner), assigned/accepted freelancer, or staff may access order-scoped resources.
 */
async function assertOrderParticipant({ auth, orderId }, clientMaybe) {
  if (!auth?.userId) throw authError("يجب تسجيل الدخول.", 401, "unauthorized");
  if (isStaffAuth(auth)) {
    const order = await loadOrderRow(orderId, clientMaybe);
    if (!order) throw notFoundError();
    return { order, role: "staff" };
  }
  const uid = requireAuthenticatedUserId(auth);
  const order = await loadOrderRow(orderId, clientMaybe);
  if (!order) throw notFoundError();
  if (isClientAuth(auth) && order.source_type === "client_created" && Number(order.created_by_user_id) === uid) {
    return { order, role: "client" };
  }
  const assigned = order.assigned_freelancer_id ? Number(order.assigned_freelancer_id) : null;
  const accepted = order.accepted_freelancer_id ? Number(order.accepted_freelancer_id) : null;
  if (isFreelancerAuth(auth) && (assigned === uid || accepted === uid)) {
    return { order, role: "freelancer" };
  }
  logBlockedAccess("order_participant", { orderId: String(orderId), userId: String(uid) });
  throw notFoundError();
}

async function assertCanAccessOrderFile({ auth, orderId, fileId }, clientMaybe) {
  const uid = requireAuthenticatedUserId(auth);
  const oid = Number(orderId);
  const fid = Number(fileId);
  if (!Number.isInteger(oid) || oid < 1 || !Number.isInteger(fid) || fid < 1) {
    throw authError("معرّف غير صالح.", 400, "invalid_id");
  }

  if (isStaffAuth(auth)) {
    return { mode: "staff", orderId: oid, fileId: fid };
  }

  const { rows: fr } = await dbPool(clientMaybe).query(
    `SELECT id, order_id, purpose FROM order_files WHERE id = $1 AND order_id = $2 LIMIT 1`,
    [fid, oid],
  );
  const fileRow = fr[0];
  if (!fileRow) throw notFoundError("الملف غير موجود.");

  const order = await loadOrderRow(oid, clientMaybe);
  if (!order) throw notFoundError();

  if (isClientAuth(auth)) {
    await assertClientOwnsOrder(uid, oid, clientMaybe);
    return { mode: "client", order, fileRow };
  }

  if (isFreelancerAuth(auth)) {
    const assignedId = order.assigned_freelancer_id ? Number(order.assigned_freelancer_id) : null;
    const acceptedId = order.accepted_freelancer_id ? Number(order.accepted_freelancer_id) : null;
    if (assignedId === uid || acceptedId === uid) {
      return { mode: "freelancer_assigned", order, fileRow };
    }
    const purpose = String(fileRow.purpose || "brief").trim();
    if (purpose !== "brief") {
      logBlockedAccess("file_purpose", { orderId: String(oid), fileId: String(fid), userId: String(uid) });
      throw authError("لا يمكنك الوصول إلى هذا الملف.", 403, "file_purpose_denied");
    }
    await assertFreelancerCanAccessPoolOrder(uid, order, clientMaybe);
    return { mode: "freelancer_pool_brief", order, fileRow };
  }

  logBlockedAccess("file_access", { orderId: String(oid), fileId: String(fid), userId: String(uid) });
  throw notFoundError();
}

module.exports = {
  STAFF_ORDER_ROLES,
  authError,
  notFoundError,
  isStaffAuth,
  isFreelancerAuth,
  isClientAuth,
  collectRoleNames,
  requireAuthenticatedUserId,
  logBlockedAccess,
  loadOrderRow,
  assertClientOwnsOrder,
  assertFreelancerAssignedToOrder,
  assertFreelancerCanAccessPoolOrder,
  assertFreelancerCanClaimOrder,
  assertFreelancerCanBidOrder,
  assertOrderParticipant,
  assertCanAccessOrderFile,
};
