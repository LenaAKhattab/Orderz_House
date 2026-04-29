const { pool } = require("../config/db");
const notificationService = require("./notificationService");

function getRunner(client) {
  return client || pool;
}

async function getRoleUserIds(roleNames = [], client) {
  const roles = [...new Set((Array.isArray(roleNames) ? roleNames : []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (!roles.length) return [];
  const runner = getRunner(client);
  const { rows } = await runner.query(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.is_active = TRUE
       AND (
         u.role = ANY($1::text[])
         OR r.name = ANY($1::text[])
       )`,
    [roles],
  );
  return rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
}

async function notifyUsers({
  userIds = [],
  recipientRole = null,
  actorUserId = null,
  type,
  title,
  message,
  entityType,
  entityId = null,
  link = null,
  priority = "medium",
  metadata = {},
  dedupeKey = null,
}, client) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return [];
  const runner = getRunner(client);
  if (dedupeKey) {
    const out = [];
    for (const uid of ids) {
      // Per-recipient dedupe avoids collisions across different recipients.
      // eslint-disable-next-line no-await-in-loop
      const n = await notificationService.createIfNotExists(
        {
          recipientUserId: uid,
          recipientRole,
          actorUserId,
          type,
          title,
          message,
          entityType,
          entityId,
          link,
          priority,
          metadata,
        },
        `${dedupeKey}_u${uid}`,
        runner,
      );
      if (n) out.push(n);
    }
    return out;
  }
  return notificationService.createManyNotifications(
    ids.map((uid) => ({
      recipientUserId: uid,
      recipientRole,
      actorUserId,
      type,
      title,
      message,
      entityType,
      entityId,
      link,
      priority,
      metadata,
    })),
    runner,
  );
}

async function notifyOrderOwner({
  order,
  actorUserId = null,
  type,
  title,
  message,
  priority = "medium",
  metadata = {},
  dedupeKey = null,
}, client) {
  if (!order?.created_by_user_id) return null;
  const ownerRole = String(order.created_by_role || "").trim() || null;
  const link =
    order.source_type === "client_created"
      ? "/dashboard/client/my-orders"
      : `/dashboard/${ownerRole === "super_admin" ? "super-admin" : "admin"}/orders`;
  return notificationService.createIfNotExists(
    {
      recipientUserId: Number(order.created_by_user_id),
      recipientRole: ownerRole,
      actorUserId,
      type,
      title,
      message,
      entityType: "order",
      entityId: Number(order.id),
      link,
      priority,
      metadata,
    },
    dedupeKey,
    client,
  );
}

async function notifyAssignedFreelancer({
  order,
  freelancerUserId = null,
  actorUserId = null,
  type,
  title,
  message,
  priority = "high",
  metadata = {},
  dedupeKey = null,
}, client) {
  const uid = Number(freelancerUserId || order?.assigned_freelancer_id);
  if (!Number.isInteger(uid) || uid < 1) return null;
  return notificationService.createIfNotExists(
    {
      recipientUserId: uid,
      recipientRole: "freelancer",
      actorUserId,
      type,
      title,
      message,
      entityType: "order",
      entityId: Number(order?.id),
      link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(order?.id || ""))}`,
      priority,
      metadata,
    },
    dedupeKey,
    client,
  );
}

async function notifyAdmins(payload, client) {
  const ids = await getRoleUserIds(["admin"], client);
  return notifyUsers({ ...payload, userIds: ids }, client);
}

async function notifySuperAdmins(payload, client) {
  const ids = await getRoleUserIds(["super_admin"], client);
  return notifyUsers({ ...payload, userIds: ids }, client);
}

async function notifyOrderParticipants({ order, actorUserId = null, includeOwner = true, includeAssignedFreelancer = true, ...payload }, client) {
  const ids = [];
  if (includeOwner && order?.created_by_user_id) ids.push(Number(order.created_by_user_id));
  if (includeAssignedFreelancer && order?.assigned_freelancer_id) ids.push(Number(order.assigned_freelancer_id));
  const link =
    order?.source_type === "client_created"
      ? "/dashboard/client/my-orders"
      : `/dashboard/${String(order?.created_by_role || "").trim() === "super_admin" ? "super-admin" : "admin"}/orders`;
  return notifyUsers(
    {
      ...payload,
      userIds: ids,
      actorUserId,
      entityType: "order",
      entityId: Number(order?.id),
      link,
    },
    client,
  );
}

async function notifyFinancialClaimOwner({
  claim,
  actorUserId = null,
  type,
  title,
  message,
  priority = "high",
  dedupeKey = null,
  metadata = {},
}, client) {
  const uid = Number(claim?.freelancer_id || claim?.freelancerId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  return notificationService.createIfNotExists(
    {
      recipientUserId: uid,
      recipientRole: "freelancer",
      actorUserId,
      type,
      title,
      message,
      entityType: "financial_claim",
      entityId: Number(claim?.id),
      link: "/dashboard/freelancer/financial-claims",
      priority,
      metadata,
    },
    dedupeKey,
    client,
  );
}

async function notifySubscriptionOwner({
  subscription,
  actorUserId = null,
  type,
  title,
  message,
  priority = "high",
  dedupeKey = null,
  metadata = {},
}, client) {
  const uid = Number(subscription?.freelancer_user_id || subscription?.freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  return notificationService.createIfNotExists(
    {
      recipientUserId: uid,
      recipientRole: "freelancer",
      actorUserId,
      type,
      title,
      message,
      entityType: "subscription",
      entityId: Number(subscription?.id),
      link: "/plans",
      priority,
      metadata,
    },
    dedupeKey,
    client,
  );
}

module.exports = {
  getRoleUserIds,
  notifyUsers,
  notifyOrderOwner,
  notifyAssignedFreelancer,
  notifyAdmins,
  notifySuperAdmins,
  notifyOrderParticipants,
  notifyFinancialClaimOwner,
  notifySubscriptionOwner,
};
