/**
 * Phase E3 — Normal Order Admin rules: validation, snapshot, applicant caps,
 * deadline reconcile, economic-field lock. Does NOT enable Bid Credits engine.
 *
 * بيت المونة / pantry_house: PRESERVED — this module does not touch it.
 * E1 membership value gate remains canonical (orderAuthorizationService).
 * E2 Article economy untouched.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
} = require("./marketplaceEconomySettingsService");
const {
  NORMAL_ORDER_RULES_VERSION,
  NORMAL_ORDER_RULES_DEFAULTS,
  NORMAL_ORDER_DEADLINE_INCOMPLETE_TARGET_POLICIES,
  NORMAL_ORDER_VALID_APPLICATION_STATUSES,
  NORMAL_ORDER_ERROR_CODES,
  ORDER_ECONOMIC_LOCK_FIELDS,
} = require("../constants/marketplaceNormalOrderRules");
const { NORMAL_APPLICATION_BID_COST } = require("../constants/marketplaceBidCredits");

let e3OrdersSchemaReadyCache = null;

async function normalOrderRulesSchemaReady(db = pool) {
  if (e3OrdersSchemaReadyCache === true) return true;
  if (e3OrdersSchemaReadyCache === false) return false;
  const { rows } = await db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'application_bid_cost'
      LIMIT 1`,
  );
  e3OrdersSchemaReadyCache = Boolean(rows[0]);
  return e3OrdersSchemaReadyCache;
}

function clearNormalOrderRulesSchemaCache() {
  e3OrdersSchemaReadyCache = null;
}

function mapNormalOrderRulesFromSettings(settings) {
  const s = settings || {};
  return {
    minValueJod: Number(s.normalOrderMinValueJod ?? NORMAL_ORDER_RULES_DEFAULTS.minValueJod),
    maxValueJod: Number(s.normalOrderMaxValueJod ?? NORMAL_ORDER_RULES_DEFAULTS.maxValueJod),
    minTargetApplicants: Number(
      s.normalOrderMinTargetApplicants ?? NORMAL_ORDER_RULES_DEFAULTS.minTargetApplicants,
    ),
    maxTargetApplicants: Number(
      s.normalOrderMaxTargetApplicants ?? NORMAL_ORDER_RULES_DEFAULTS.maxTargetApplicants,
    ),
    defaultTargetApplicants: Number(
      s.normalOrderDefaultTargetApplicants ?? NORMAL_ORDER_RULES_DEFAULTS.defaultTargetApplicants,
    ),
    minBidCost: Number(s.normalOrderMinBidCost ?? NORMAL_ORDER_RULES_DEFAULTS.minBidCost),
    maxBidCost: Number(s.normalOrderMaxBidCost ?? NORMAL_ORDER_RULES_DEFAULTS.maxBidCost),
    defaultBidCost: Number(
      s.normalOrderDefaultBidCost ?? NORMAL_ORDER_RULES_DEFAULTS.defaultBidCost,
    ),
    minApplicationPeriodHours: Number(
      s.normalOrderMinApplicationPeriodHours ??
        NORMAL_ORDER_RULES_DEFAULTS.minApplicationPeriodHours,
    ),
    maxApplicationPeriodHours: Number(
      s.normalOrderMaxApplicationPeriodHours ??
        NORMAL_ORDER_RULES_DEFAULTS.maxApplicationPeriodHours,
    ),
    defaultApplicationPeriodHours: Number(
      s.normalOrderDefaultApplicationPeriodHours ??
        NORMAL_ORDER_RULES_DEFAULTS.defaultApplicationPeriodHours,
    ),
    minExecutionDurationHours: Number(
      s.normalOrderMinExecutionDurationHours ??
        NORMAL_ORDER_RULES_DEFAULTS.minExecutionDurationHours,
    ),
    maxExecutionDurationHours: Number(
      s.normalOrderMaxExecutionDurationHours ??
        NORMAL_ORDER_RULES_DEFAULTS.maxExecutionDurationHours,
    ),
    defaultExecutionDurationHours: Number(
      s.normalOrderDefaultExecutionDurationHours ??
        NORMAL_ORDER_RULES_DEFAULTS.defaultExecutionDurationHours,
    ),
    deadlineIncompleteTargetPolicy:
      s.normalOrderDeadlineIncompleteTargetPolicy ||
      NORMAL_ORDER_RULES_DEFAULTS.deadlineIncompleteTargetPolicy,
    refundClientCancelBeforeSelection:
      s.normalOrderRefundClientCancelBeforeSelection ||
      NORMAL_ORDER_RULES_DEFAULTS.refundClientCancelBeforeSelection,
    refundSystemCancel:
      s.normalOrderRefundSystemCancel || NORMAL_ORDER_RULES_DEFAULTS.refundSystemCancel,
    refundDeadlineNoSelection:
      s.normalOrderRefundDeadlineNoSelection ||
      NORMAL_ORDER_RULES_DEFAULTS.refundDeadlineNoSelection,
    refundNoFreelancerSelected:
      s.normalOrderRefundNoFreelancerSelected ||
      NORMAL_ORDER_RULES_DEFAULTS.refundNoFreelancerSelected,
    refundFreelancerWithdrawal:
      s.normalOrderRefundFreelancerWithdrawal ||
      NORMAL_ORDER_RULES_DEFAULTS.refundFreelancerWithdrawal,
    refundRejectedApplication:
      s.normalOrderRefundRejectedApplication ||
      NORMAL_ORDER_RULES_DEFAULTS.refundRejectedApplication,
    refundLosingApplicant:
      s.normalOrderRefundLosingApplicant || NORMAL_ORDER_RULES_DEFAULTS.refundLosingApplicant,
    refundPostAwardCancel:
      s.normalOrderRefundPostAwardCancel || NORMAL_ORDER_RULES_DEFAULTS.refundPostAwardCancel,
    businessTimezone:
      s.normalOrderBusinessTimezone || NORMAL_ORDER_RULES_DEFAULTS.businessTimezone,
  };
}

async function getNormalOrderRules(client) {
  const settings = await getMarketplaceEconomySettings(client);
  return mapNormalOrderRulesFromSettings(settings);
}

/**
 * Authoritative Bid cost for an Order row.
 * Legacy NULL → B2 default 1 (behavior-preserving).
 */
function resolveOrderApplicationBidCost(orderRow, rules = null) {
  if (orderRow?.application_bid_cost != null && Number.isInteger(Number(orderRow.application_bid_cost))) {
    const n = Number(orderRow.application_bid_cost);
    if (n >= 1) return n;
  }
  if (rules?.defaultBidCost != null && Number.isInteger(Number(rules.defaultBidCost))) {
    return Number(rules.defaultBidCost);
  }
  return NORMAL_APPLICATION_BID_COST;
}

function assertIntInRange(name, value, { min, max }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw createAppError(`${name} must be an integer between ${min} and ${max}.`, 400, {
      exposeToClient: true,
      publicCode: NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_BID_COST_OUT_OF_RANGE,
      details: { field: name, min, max, value },
    });
  }
  return n;
}

function assertMoneyInRange(name, value, { min, max }, publicCode) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw createAppError(`${name} must be between ${min} and ${max}.`, 400, {
      exposeToClient: true,
      publicCode,
      details: { field: name, min, max, value },
    });
  }
  return n;
}

/**
 * Validate + build snapshotted E3 fields for a new published bidding Order.
 * Fixed/direct-assigned Orders skip Bid/applicant snapshots (null).
 */
function buildOrderRulesSnapshotForCreate({ payload, rules, projectType, isBidding }) {
  const r = rules || NORMAL_ORDER_RULES_DEFAULTS;
  if (!isBidding) {
    return {
      applicationBidCost: null,
      targetApplicantCount: null,
      applicationDeadlineAt: null,
      deadlineIncompleteTargetPolicy: null,
      e3RulesVersion: null,
      e3RulesSnapshot: {},
    };
  }

  const bidCostRaw =
    payload.applicationBidCost != null ? payload.applicationBidCost : r.defaultBidCost;
  const bidCost = assertIntInRange("applicationBidCost", bidCostRaw, {
    min: r.minBidCost,
    max: r.maxBidCost,
  });

  const targetRaw =
    payload.targetApplicantCount != null
      ? payload.targetApplicantCount
      : r.defaultTargetApplicants;
  const target = assertIntInRange("targetApplicantCount", targetRaw, {
    min: r.minTargetApplicants,
    max: r.maxTargetApplicants,
  });

  // Project value (bidding uses max budget as eligibility/value signal)
  const valueCandidates = [
    payload.bidBudgetMax,
    payload.bidBudgetMin,
    payload.budget,
    payload.projectValueJod,
  ]
    .map((x) => (x != null ? Number(x) : null))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (valueCandidates.length) {
    const maxVal = Math.max(...valueCandidates);
    assertMoneyInRange(
      "projectValue",
      maxVal,
      { min: r.minValueJod, max: r.maxValueJod },
      NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_VALUE_OUT_OF_RANGE,
    );
  }

  let applicationDeadlineAt = null;
  if (payload.applicationDeadlineAt != null && payload.applicationDeadlineAt !== "") {
    const d = new Date(payload.applicationDeadlineAt);
    if (Number.isNaN(d.getTime())) {
      throw createAppError("Invalid applicationDeadlineAt.", 400, { exposeToClient: true });
    }
    applicationDeadlineAt = d.toISOString();
  } else if (payload.applicationPeriodHours != null) {
    const hours = assertIntInRange("applicationPeriodHours", payload.applicationPeriodHours, {
      min: r.minApplicationPeriodHours,
      max: r.maxApplicationPeriodHours,
    });
    applicationDeadlineAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  } else {
    const hours = r.defaultApplicationPeriodHours;
    applicationDeadlineAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  // Validate deadline window length vs Admin range (hours from now)
  {
    const hoursFromNow =
      (new Date(applicationDeadlineAt).getTime() - Date.now()) / 3600000;
    if (
      hoursFromNow < r.minApplicationPeriodHours - 0.01 ||
      hoursFromNow > r.maxApplicationPeriodHours + 0.01
    ) {
      throw createAppError(
        `Application period must be between ${r.minApplicationPeriodHours} and ${r.maxApplicationPeriodHours} hours.`,
        400,
        {
          exposeToClient: true,
          publicCode: NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_APPLICATION_PERIOD_OUT_OF_RANGE,
        },
      );
    }
  }

  if (payload.durationValue != null && payload.durationUnit) {
    const unit = String(payload.durationUnit).toLowerCase();
    let hours = Number(payload.durationValue);
    if (unit === "days") hours *= 24;
    else if (unit === "minutes") hours /= 60;
    if (Number.isFinite(hours)) {
      assertMoneyInRange(
        "executionDurationHours",
        hours,
        { min: r.minExecutionDurationHours, max: r.maxExecutionDurationHours },
        NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_EXECUTION_DURATION_OUT_OF_RANGE,
      );
    }
  }

  const policy =
    payload.deadlineIncompleteTargetPolicy ||
    r.deadlineIncompleteTargetPolicy ||
    "continue_with_received";
  if (!NORMAL_ORDER_DEADLINE_INCOMPLETE_TARGET_POLICIES.includes(policy)) {
    throw createAppError("Invalid deadlineIncompleteTargetPolicy.", 400, {
      exposeToClient: true,
    });
  }

  const snapshot = {
    rulesVersion: NORMAL_ORDER_RULES_VERSION,
    publishedAt: new Date().toISOString(),
    projectType: projectType || "bidding",
    applicationBidCost: bidCost,
    targetApplicantCount: target,
    applicationDeadlineAt,
    deadlineIncompleteTargetPolicy: policy,
    adminLimits: {
      minValueJod: r.minValueJod,
      maxValueJod: r.maxValueJod,
      minTargetApplicants: r.minTargetApplicants,
      maxTargetApplicants: r.maxTargetApplicants,
      minBidCost: r.minBidCost,
      maxBidCost: r.maxBidCost,
      minApplicationPeriodHours: r.minApplicationPeriodHours,
      maxApplicationPeriodHours: r.maxApplicationPeriodHours,
      minExecutionDurationHours: r.minExecutionDurationHours,
      maxExecutionDurationHours: r.maxExecutionDurationHours,
    },
    refundPolicies: {
      clientCancelBeforeSelection: r.refundClientCancelBeforeSelection,
      systemCancel: r.refundSystemCancel,
      deadlineNoSelection: r.refundDeadlineNoSelection,
      noFreelancerSelected: r.refundNoFreelancerSelected,
      freelancerWithdrawal: r.refundFreelancerWithdrawal,
      rejectedApplication: r.refundRejectedApplication,
      losingApplicant: r.refundLosingApplicant,
      postAwardCancel: r.refundPostAwardCancel,
    },
    businessTimezone: r.businessTimezone,
  };

  return {
    applicationBidCost: bidCost,
    targetApplicantCount: target,
    applicationDeadlineAt,
    deadlineIncompleteTargetPolicy: policy,
    e3RulesVersion: NORMAL_ORDER_RULES_VERSION,
    e3RulesSnapshot: snapshot,
  };
}

async function countValidApplicants(client, orderId) {
  const statuses = NORMAL_ORDER_VALID_APPLICATION_STATUSES;
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c
       FROM order_freelancer_bids
      WHERE order_id = $1
        AND COALESCE(is_fake_bid, FALSE) = FALSE
        AND status = ANY($2::text[])`,
    [Number(orderId), statuses],
  );
  return Number(rows[0]?.c) || 0;
}

function applicantCapacityView(orderRow, currentCount) {
  const target =
    orderRow?.target_applicant_count != null
      ? Number(orderRow.target_applicant_count)
      : null;
  const current = Number(currentCount) || 0;
  const remaining =
    target != null && Number.isInteger(target) ? Math.max(0, target - current) : null;
  return {
    currentApplicantCount: current,
    targetApplicantCount: target,
    remainingApplicantSlots: remaining,
    applicationsClosedAt: orderRow?.applications_closed_at || null,
    applicationsCloseReason: orderRow?.applications_close_reason || null,
  };
}

async function assertOrderAcceptsApplications(client, order, { now = new Date() } = {}) {
  if (order.applications_closed_at) {
    throw createAppError("Order applications are closed.", 409, {
      exposeToClient: true,
      publicCode: NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_APPLICATIONS_CLOSED,
      details: { reason: order.applications_close_reason || null },
    });
  }
  if (order.application_deadline_at && new Date(order.application_deadline_at) <= new Date(now)) {
    throw createAppError("Order application deadline has passed.", 409, {
      exposeToClient: true,
      publicCode: NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_APPLICATION_DEADLINE_PASSED,
    });
  }
  if (order.target_applicant_count != null) {
    const count = await countValidApplicants(client, order.id);
    if (count >= Number(order.target_applicant_count)) {
      throw createAppError("Order applicant target has been reached.", 409, {
        exposeToClient: true,
        publicCode: NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_APPLICANT_TARGET_REACHED,
      });
    }
  }
}

async function closeOrderApplications(client, orderId, reason, { now = new Date() } = {}) {
  const { rows } = await client.query(
    `UPDATE orders
        SET is_open_for_pool = FALSE,
            applications_closed_at = COALESCE(applications_closed_at, $2::timestamptz),
            applications_close_reason = COALESCE(applications_close_reason, $3),
            updated_at = NOW()
      WHERE id = $1
        AND applications_closed_at IS NULL
      RETURNING *`,
    [Number(orderId), new Date(now).toISOString(), reason],
  );
  return rows[0] || null;
}

/**
 * After a successful first application, auto-close if target reached.
 * Caller must hold FOR UPDATE on the order row.
 */
async function maybeAutoCloseOnTargetReached(client, order, { now = new Date() } = {}) {
  if (order.target_applicant_count == null) return { closed: false };
  const count = await countValidApplicants(client, order.id);
  if (count < Number(order.target_applicant_count)) {
    return { closed: false, currentApplicantCount: count };
  }
  const closed = await closeOrderApplications(client, order.id, "target_reached", { now });
  return {
    closed: Boolean(closed),
    currentApplicantCount: count,
    order: closed,
  };
}

async function orderHasValidApplications(client, orderId) {
  const count = await countValidApplicants(client, orderId);
  return count > 0;
}

/**
 * Freeze economic fields after first valid application.
 */
async function assertOrderEconomicFieldsMutable(client, orderId, patch = {}) {
  const hasApps = await orderHasValidApplications(client, orderId);
  if (!hasApps) return;

  const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1`, [Number(orderId)]);
  const existing = rows[0];
  if (!existing) return;

  const frozenKeys = [];
  const check = (patchKey, col) => {
    if (patch[patchKey] === undefined && patch[col] === undefined) return;
    const next = patch[patchKey] !== undefined ? patch[patchKey] : patch[col];
    const prev = existing[col];
    if (next == null && prev == null) return;
    // Normalize dates for deadline comparison
    if (col === "application_deadline_at" && next != null && prev != null) {
      if (new Date(next).getTime() === new Date(prev).getTime()) return;
    }
    if (String(next) !== String(prev)) frozenKeys.push(col);
  };

  for (const col of ORDER_ECONOMIC_LOCK_FIELDS) {
    const camel = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    check(camel, col);
  }
  // Snapshot JSON must not be rewritten under applicants
  if (patch.e3RulesSnapshot !== undefined || patch.e3_rules_snapshot !== undefined) {
    const next = patch.e3RulesSnapshot !== undefined ? patch.e3RulesSnapshot : patch.e3_rules_snapshot;
    const prev = existing.e3_rules_snapshot || {};
    if (JSON.stringify(next || {}) !== JSON.stringify(prev || {})) {
      frozenKeys.push("e3_rules_snapshot");
    }
  }

  if (frozenKeys.length) {
    throw createAppError(
      "Order economic fields are locked after the first application.",
      409,
      {
        exposeToClient: true,
        publicCode: NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_ECONOMIC_FIELDS_FROZEN,
        details: { frozenKeys },
      },
    );
  }
}

/**
 * Canonical mutation path for published Order economics.
 * BEFORE first valid application: allowed (with Admin range validation when rules present).
 * AFTER first valid application: rejected by assertOrderEconomicFieldsMutable.
 */
async function patchPublishedOrderEconomicFields({
  client: externalClient = null,
  orderId,
  patch = {},
  actorUserId = null,
} = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (!(await normalOrderRulesSchemaReady(client))) {
      throw createAppError("Normal Order rules schema is not applied yet.", 503, {
        exposeToClient: true,
        publicCode: NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_SCHEMA_NOT_READY,
      });
    }
    if (own) await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [
      Number(orderId),
    ]);
    const order = rows[0];
    if (!order) {
      throw createAppError("Order not found.", 404, { exposeToClient: true });
    }

    await assertOrderEconomicFieldsMutable(client, orderId, patch);

    const rules = await getNormalOrderRules(client);
    const next = { ...patch };

    if (next.applicationBidCost != null || next.application_bid_cost != null) {
      const v = next.applicationBidCost ?? next.application_bid_cost;
      next.application_bid_cost = assertIntInRange("applicationBidCost", v, {
        min: rules.minBidCost,
        max: rules.maxBidCost,
      });
    }
    if (next.targetApplicantCount != null || next.target_applicant_count != null) {
      const v = next.targetApplicantCount ?? next.target_applicant_count;
      next.target_applicant_count = assertIntInRange("targetApplicantCount", v, {
        min: rules.minTargetApplicants,
        max: rules.maxTargetApplicants,
      });
    }
    if (next.bidBudgetMin != null || next.bid_budget_min != null) {
      next.bid_budget_min = Number(next.bidBudgetMin ?? next.bid_budget_min);
    }
    if (next.bidBudgetMax != null || next.bid_budget_max != null) {
      next.bid_budget_max = Number(next.bidBudgetMax ?? next.bid_budget_max);
    }
    if (next.budget != null) {
      next.budget = Number(next.budget);
    }
    if (next.applicationDeadlineAt != null || next.application_deadline_at != null) {
      const d = new Date(next.applicationDeadlineAt ?? next.application_deadline_at);
      if (Number.isNaN(d.getTime())) {
        throw createAppError("Invalid applicationDeadlineAt.", 400, { exposeToClient: true });
      }
      next.application_deadline_at = d.toISOString();
    }
    if (next.deadlineIncompleteTargetPolicy != null || next.deadline_incomplete_target_policy != null) {
      const p =
        next.deadlineIncompleteTargetPolicy ?? next.deadline_incomplete_target_policy;
      if (!NORMAL_ORDER_DEADLINE_INCOMPLETE_TARGET_POLICIES.includes(p)) {
        throw createAppError("Invalid deadlineIncompleteTargetPolicy.", 400, {
          exposeToClient: true,
        });
      }
      next.deadline_incomplete_target_policy = p;
    }
    if (next.durationValue != null || next.duration_value != null || next.durationUnit != null || next.duration_unit != null) {
      const durationValue = next.durationValue ?? next.duration_value ?? order.duration_value;
      const durationUnit = String(
        (next.durationUnit ?? next.duration_unit ?? order.duration_unit) || "",
      ).toLowerCase();
      let hours = Number(durationValue);
      if (durationUnit === "days") hours *= 24;
      else if (durationUnit === "minutes") hours /= 60;
      if (Number.isFinite(hours)) {
        assertMoneyInRange(
          "executionDurationHours",
          hours,
          { min: rules.minExecutionDurationHours, max: rules.maxExecutionDurationHours },
          NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_EXECUTION_DURATION_OUT_OF_RANGE,
        );
      }
      next.duration_value = Number(durationValue);
      next.duration_unit = durationUnit || order.duration_unit;
    }

    const sets = [];
    const params = [Number(orderId)];
    const push = (col, val) => {
      if (val === undefined) return;
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    push("application_bid_cost", next.application_bid_cost);
    push("target_applicant_count", next.target_applicant_count);
    push("application_deadline_at", next.application_deadline_at);
    push("deadline_incomplete_target_policy", next.deadline_incomplete_target_policy);
    push("duration_value", next.duration_value);
    push("duration_unit", next.duration_unit);
    push("budget", next.budget);
    push("bid_budget_min", next.bid_budget_min);
    push("bid_budget_max", next.bid_budget_max);
    if (next.e3_rules_snapshot !== undefined || next.e3RulesSnapshot !== undefined) {
      push(
        "e3_rules_snapshot",
        JSON.stringify(next.e3_rules_snapshot ?? next.e3RulesSnapshot ?? {}),
      );
    }

    if (!sets.length) {
      if (own) await client.query("COMMIT");
      return order;
    }

    const { rows: updated } = await client.query(
      `UPDATE orders SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      params,
    );
    if (own) await client.query("COMMIT");
    return updated[0] || order;
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function notifyDeadlineReconcileOutcome({
  client,
  order,
  action,
  policy,
  refundResults = null,
  applicantUserIds = null,
}) {
  const notificationEventsService = require("./notificationEventsService");
  const orderId = Number(order.id);

  try {
    if (action === "close_applications_continue") {
      await notificationEventsService.notifyOrderOwner(
        {
          order,
          type: "order.applications.deadline_reached",
          title: "انتهى موعد التقديم",
          message: "تم إغلاق باب التقديم عند حلول الموعد. يمكنك المتابعة بالمتقدمين الحاليين.",
          priority: "high",
          dedupeKey: `order_apps_deadline_continue_${orderId}`,
          metadata: { orderId: String(orderId), policy, action },
        },
        client,
      );
    } else if (action === "close_require_admin_review") {
      await notificationEventsService.notifyOrderOwner(
        {
          order,
          type: "order.applications.admin_review_required",
          title: "مطلوب مراجعة الإدارة",
          message: "انتهى موعد التقديم قبل اكتمال العدد المطلوب. الطلب بانتظار مراجعة الإدارة.",
          priority: "high",
          dedupeKey: `order_apps_deadline_admin_review_${orderId}`,
          metadata: { orderId: String(orderId), policy, action },
        },
        client,
      );
      await notificationEventsService.notifySuperAdmins(
        {
          type: "order.applications.admin_review_required",
          title: "Normal Order needs Admin review",
          message: `Order #${orderId} deadline reached incomplete target — Admin review required.`,
          entityType: "order",
          entityId: orderId,
          priority: "high",
          dedupeKey: `order_apps_deadline_admin_review_sa_${orderId}`,
          metadata: { orderId: String(orderId), policy, action },
        },
        client,
      );
    } else if (action === "cancel_and_refund") {
      await notificationEventsService.notifyOrderOwner(
        {
          order,
          type: "order.applications.deadline_cancelled",
          title: "أُلغي الطلب بعد انتهاء الموعد",
          message: "انتهى موعد التقديم قبل اكتمال العدد وتم إلغاء الطلب وفق السياسة المعتمدة.",
          priority: "high",
          dedupeKey: `order_apps_deadline_cancel_${orderId}`,
          metadata: { orderId: String(orderId), policy, action },
        },
        client,
      );
      let applicantIds = Array.isArray(applicantUserIds) ? applicantUserIds : null;
      if (!applicantIds) {
        const { rows: applicants } = await client.query(
          `SELECT DISTINCT freelancer_user_id
             FROM order_freelancer_bids
            WHERE order_id = $1
              AND COALESCE(is_fake_bid, FALSE) = FALSE
              AND status = ANY($2::text[])`,
          [orderId, NORMAL_ORDER_VALID_APPLICATION_STATUSES],
        );
        applicantIds = applicants.map((row) => Number(row.freelancer_user_id));
      }
      for (const freelancerUserId of applicantIds) {
        // eslint-disable-next-line no-await-in-loop
        await notificationEventsService.notifyAssignedFreelancer(
          {
            order,
            freelancerUserId,
            type: "order.applications.deadline_cancelled",
            title: "أُلغي الطلب",
            message: "انتهى موعد التقديم وتم إلغاء الطلب. إن كنت مؤهلاً فسيتم استرجاع العروض المتاحة.",
            priority: "high",
            dedupeKey: `order_apps_deadline_cancel_fl_${orderId}_${freelancerUserId}`,
            metadata: { orderId: String(orderId), policy, action },
          },
          client,
        );
      }
    }
  } catch {
    /* never fail reconcile on notify */
  }

  // Freelancer refund notifies are emitted from Bid economics refund path (deduped).
  return { refundResults };
}

/**
 * Resolve refund mode (full|none) for an outcome using Order snapshot then Admin settings.
 */
function resolveRefundModeForOutcome(orderRow, outcomeKey, rules) {
  const snap = orderRow?.e3_rules_snapshot?.refundPolicies || {};
  const map = {
    client_cancel_before_selection:
      snap.clientCancelBeforeSelection || rules?.refundClientCancelBeforeSelection,
    system_cancel: snap.systemCancel || rules?.refundSystemCancel,
    deadline_no_selection: snap.deadlineNoSelection || rules?.refundDeadlineNoSelection,
    no_freelancer_selected: snap.noFreelancerSelected || rules?.refundNoFreelancerSelected,
    freelancer_withdrawal: snap.freelancerWithdrawal || rules?.refundFreelancerWithdrawal,
    rejected_application: snap.rejectedApplication || rules?.refundRejectedApplication,
    losing_applicant: snap.losingApplicant || rules?.refundLosingApplicant,
    post_award_cancel: snap.postAwardCancel || rules?.refundPostAwardCancel,
  };
  const mode = map[outcomeKey] || "none";
  return mode === "full" ? "full" : "none";
}

/**
 * Idempotent reconcile for deadline-reached Orders still open for applications.
 */
async function reconcileNormalOrderApplicationDeadlines({
  client: externalClient = null,
  now = new Date(),
  limit = 50,
} = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (!(await normalOrderRulesSchemaReady(client))) {
      return { processed: 0, schemaReady: false };
    }
    const { rows } = await client.query(
      `SELECT id FROM orders
        WHERE application_deadline_at IS NOT NULL
          AND application_deadline_at <= $1::timestamptz
          AND applications_closed_at IS NULL
          AND is_open_for_pool = TRUE
          AND order_status = 'open_for_bids'
        ORDER BY application_deadline_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [new Date(now).toISOString(), Number(limit) || 50],
    );

    const results = [];
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const out = await reconcileSingleOrderDeadline({
        client,
        orderId: row.id,
        now,
      });
      results.push(out);
    }
    return { processed: results.length, results, schemaReady: true };
  } finally {
    if (own) client.release();
  }
}

async function reconcileSingleOrderDeadline({ client, orderId, now = new Date() }) {
  const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [
    Number(orderId),
  ]);
  const order = rows[0];
  if (!order) return { orderId, skipped: true, reason: "not_found" };
  if (order.applications_closed_at) {
    return { orderId, skipped: true, reason: "already_closed", idempotent: true };
  }
  if (!order.application_deadline_at || new Date(order.application_deadline_at) > new Date(now)) {
    return { orderId, skipped: true, reason: "deadline_not_reached" };
  }

  const rules = await getNormalOrderRules(client);
  const policy =
    order.deadline_incomplete_target_policy ||
    order.e3_rules_snapshot?.deadlineIncompleteTargetPolicy ||
    rules.deadlineIncompleteTargetPolicy ||
    "continue_with_received";

  const count = await countValidApplicants(client, order.id);
  const target =
    order.target_applicant_count != null ? Number(order.target_applicant_count) : null;
  const incomplete = target == null || count < target;

  if (!incomplete || policy === "continue_with_received") {
    await closeOrderApplications(client, order.id, "deadline_reached", { now });
    const out = {
      orderId: Number(orderId),
      action: "close_applications_continue",
      policy,
      currentApplicantCount: count,
      targetApplicantCount: target,
    };
    await notifyDeadlineReconcileOutcome({
      client,
      order,
      action: out.action,
      policy,
    });
    return out;
  }

  if (policy === "require_admin_review") {
    await closeOrderApplications(client, order.id, "admin_review", { now });
    const out = {
      orderId: Number(orderId),
      action: "close_require_admin_review",
      policy,
      currentApplicantCount: count,
      targetApplicantCount: target,
    };
    await notifyDeadlineReconcileOutcome({
      client,
      order,
      action: out.action,
      policy,
    });
    return out;
  }

  // cancel_and_refund — snapshot applicants before status flips to rejected
  const { rows: cancelApplicants } = await client.query(
    `SELECT DISTINCT freelancer_user_id
       FROM order_freelancer_bids
      WHERE order_id = $1
        AND COALESCE(is_fake_bid, FALSE) = FALSE
        AND status = ANY($2::text[])`,
    [Number(orderId), NORMAL_ORDER_VALID_APPLICATION_STATUSES],
  );
  await closeOrderApplications(client, order.id, "deadline_reached", { now });
  const endSvc = require("./marketplaceNormalApplicationWorkTokenService");
  const refundMode = resolveRefundModeForOutcome(order, "deadline_no_selection", rules);
  let refund = null;
  if (refundMode === "full") {
    refund = await endSvc.endOpenBiddingOrderWithoutSelection({
      orderId,
      reason: "deadline_incomplete_target_cancel_and_refund",
      client,
    });
  } else {
    await client.query(
      `UPDATE orders
          SET order_status = 'cancelled',
              is_open_for_pool = FALSE,
              updated_at = NOW()
        WHERE id = $1
          AND order_status = 'open_for_bids'`,
      [Number(orderId)],
    );
  }
  const out = {
    orderId: Number(orderId),
    action: "cancel_and_refund",
    policy,
    refundMode,
    currentApplicantCount: count,
    targetApplicantCount: target,
    refund,
  };
  await notifyDeadlineReconcileOutcome({
    client,
    order,
    action: out.action,
    policy,
    refundResults: refund,
    applicantUserIds: cancelApplicants.map((r) => Number(r.freelancer_user_id)),
  });
  return out;
}

module.exports = {
  normalOrderRulesSchemaReady,
  clearNormalOrderRulesSchemaCache,
  mapNormalOrderRulesFromSettings,
  getNormalOrderRules,
  resolveOrderApplicationBidCost,
  buildOrderRulesSnapshotForCreate,
  countValidApplicants,
  applicantCapacityView,
  assertOrderAcceptsApplications,
  closeOrderApplications,
  maybeAutoCloseOnTargetReached,
  assertOrderEconomicFieldsMutable,
  patchPublishedOrderEconomicFields,
  resolveRefundModeForOutcome,
  reconcileNormalOrderApplicationDeadlines,
  reconcileSingleOrderDeadline,
  notifyDeadlineReconcileOutcome,
  NORMAL_ORDER_RULES_VERSION,
  NORMAL_ORDER_ERROR_CODES,
};
