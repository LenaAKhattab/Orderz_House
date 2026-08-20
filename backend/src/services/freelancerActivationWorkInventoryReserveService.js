/**
 * Phase A8 — Work Inventory Reserve (internal accounting only).
 *
 * Allocates a configured % of catalog marketplace plan price when a freelancer
 * is confirmed paid Silver/Pro/Elite. Does not move money, create claims/wallet
 * rows, or call payment providers.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { millisToJodString, parseJodToMillis } = require("../utils/marketplaceBidPoolMoney");
const { E1_PLAN_SPECS } = require("../constants/marketplaceMembershipPlans");
const {
  FREELANCER_ACTIVATION_EVENT_TYPES,
  FREELANCER_ACTIVATION_PAID_TIER_CODES,
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
} = require("../constants/freelancerActivationEngine");
const engine = require("./freelancerActivationEngineService");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function reserveIdempotencyKey(membershipId) {
  return `work_inventory_reserve:${Number(membershipId)}`;
}

function mapReserveEntry(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    freelancerUserId: Number(row.freelancer_user_id),
    trialId: row.trial_id != null ? Number(row.trial_id) : null,
    membershipId: row.membership_id != null ? Number(row.membership_id) : null,
    activationRequestId:
      row.activation_request_id != null ? Number(row.activation_request_id) : null,
    campaignId: row.campaign_id != null ? Number(row.campaign_id) : null,
    waveId: row.wave_id != null ? Number(row.wave_id) : null,
    planCode: row.plan_code || null,
    planPriceJod: String(row.plan_price_jod),
    reservePercentage: Number(row.reserve_percentage),
    reserveAmountJod: String(row.reserve_amount_jod),
    currency: row.currency || "JOD",
    entryType: row.entry_type,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    metadata: row.metadata || null,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function computeReserveAmountJod(planPriceJod, percentage) {
  const priceMillis = parseJodToMillis(String(planPriceJod), { label: "planPriceJod" });
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw createAppError("Invalid reserve percentage.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_WORK_INVENTORY_PERCENTAGE",
    });
  }
  const reserveMillis = Math.round((priceMillis * pct) / 100);
  return millisToJodString(reserveMillis);
}

function resolveCatalogPlanPrice(tierCode, monthlyPriceJod) {
  if (monthlyPriceJod != null && String(monthlyPriceJod).trim() !== "") {
    try {
      const millis = parseJodToMillis(String(monthlyPriceJod), { label: "monthlyPriceJod" });
      return {
        planPriceJod: millisToJodString(millis),
        amountSource: "catalog_plan_price",
      };
    } catch {
      /* fall through to E1 specs */
    }
  }
  const code = String(tierCode || "").toLowerCase();
  const spec = E1_PLAN_SPECS[code];
  if (spec && spec.priceJod != null) {
    return {
      planPriceJod: millisToJodString(
        parseJodToMillis(String(spec.priceJod), { label: "catalog" }),
      ),
      amountSource: "catalog_plan_price",
    };
  }
  return null;
}

/**
 * Placeholder for future cancellation/refund reversal. Not wired to payment webhooks.
 */
async function reverseWorkInventoryReserveForMembership(_membershipId, _options = {}) {
  return {
    reversed: false,
    deferred: true,
    reason: "Automatic reserve reversal is deferred until safe membership cancellation/refund integration exists.",
  };
}

/**
 * Allocate Work Inventory Reserve for a paid Silver/Pro/Elite marketplace membership.
 * Idempotent per membership_id.
 */
async function allocateWorkInventoryReserveForPaidMembership(
  userId,
  { client = null, now = new Date(), actorUserId = null, paid = null } = {},
) {
  const runner = client || pool;
  const freelancerUserId = Number(userId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    return { allocated: false, skipped: true, reason: "invalid_user" };
  }

  let settings;
  try {
    settings = await engine.getActivationEngineSettings(runner);
  } catch (err) {
    if (isMissingSchema(err)) return { allocated: false, skipped: true, reason: "schema_missing" };
    throw err;
  }

  if (!settings.engineEnabled) {
    return { allocated: false, skipped: true, reason: "engine_disabled" };
  }
  if (!settings.workInventoryEnabled) {
    return { allocated: false, skipped: true, reason: "reserve_disabled" };
  }

  let membership = paid;
  if (!membership?.hasActivePaidSilver || !membership.currentMembershipId) {
    membership = await engine.loadPaidMembership(runner, freelancerUserId);
  }
  if (!membership?.hasActivePaidSilver || !membership.currentMembershipId) {
    return { allocated: false, skipped: true, reason: "not_paid_active" };
  }
  if (!FREELANCER_ACTIVATION_PAID_TIER_CODES.includes(String(membership.currentTierCode || ""))) {
    return { allocated: false, skipped: true, reason: "tier_not_eligible" };
  }

  const priceResolved = resolveCatalogPlanPrice(
    membership.currentTierCode,
    membership.monthlyPriceJod,
  );
  if (!priceResolved) {
    return { allocated: false, skipped: true, reason: "plan_price_unavailable" };
  }

  const percentage =
    settings.workInventoryPercentage ??
    FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.workInventoryPercentage;
  const reserveAmountJod = computeReserveAmountJod(priceResolved.planPriceJod, percentage);
  const key = reserveIdempotencyKey(membership.currentMembershipId);

  try {
    const existing = await runner.query(
      `SELECT * FROM freelancer_activation_work_inventory_reserve_entries
        WHERE idempotency_key = $1
        LIMIT 1`,
      [key],
    );
    if (existing.rows[0]) {
      return {
        allocated: false,
        idempotent: true,
        entry: mapReserveEntry(existing.rows[0]),
      };
    }

    const trialRow = await engine.loadTrialRow(runner, freelancerUserId);
    const trial = engine.mapTrialRow(trialRow);

    const { rows } = await runner.query(
      `INSERT INTO freelancer_activation_work_inventory_reserve_entries (
         freelancer_user_id, trial_id, membership_id, plan_code,
         plan_price_jod, reserve_percentage, reserve_amount_jod, currency,
         entry_type, status, idempotency_key, metadata, created_by_user_id
       ) VALUES (
         $1, $2, $3, $4,
         $5::numeric, $6::numeric, $7::numeric, 'JOD',
         'membership_reserve_allocated', 'active', $8, $9::jsonb, $10
       )
       RETURNING *`,
      [
        freelancerUserId,
        trial?.id || null,
        membership.currentMembershipId,
        membership.currentTierCode,
        priceResolved.planPriceJod,
        percentage,
        reserveAmountJod,
        key,
        JSON.stringify({
          amountSource: priceResolved.amountSource,
          allocatedAt: now.toISOString(),
          planId: membership.currentPlanId,
        }),
        actorUserId != null ? Number(actorUserId) : null,
      ],
    );

    const entry = mapReserveEntry(rows[0]);

    await engine.insertEvent(runner, {
      freelancerUserId,
      trialId: trial?.id || null,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.WORK_INVENTORY_RESERVE_ALLOCATED,
      metadata: {
        membershipId: membership.currentMembershipId,
        planCode: membership.currentTierCode,
        planPriceJod: priceResolved.planPriceJod,
        reservePercentage: percentage,
        reserveAmountJod,
        amountSource: priceResolved.amountSource,
        idempotencyKey: key,
      },
    });

    return {
      allocated: true,
      idempotent: false,
      entry,
    };
  } catch (err) {
    if (err && err.code === "23505") {
      const { rows } = await runner.query(
        `SELECT * FROM freelancer_activation_work_inventory_reserve_entries
          WHERE idempotency_key = $1 LIMIT 1`,
        [key],
      );
      return {
        allocated: false,
        idempotent: true,
        entry: mapReserveEntry(rows[0]),
      };
    }
    if (isMissingSchema(err)) {
      return { allocated: false, skipped: true, reason: "schema_missing" };
    }
    throw err;
  }
}

async function getSuperAdminWorkInventoryReserveSummary({
  client = null,
  dateFrom = null,
  dateTo = null,
  planCode = null,
  recentLimit = 25,
} = {}) {
  const runner = client || pool;
  const empty = {
    schemaReady: true,
    settings: {
      workInventoryEnabled: FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.workInventoryEnabled,
      workInventoryPercentage: FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.workInventoryPercentage,
    },
    totalReserveAllocatedJod: "0.000",
    totalReserveActiveJod: "0.000",
    totalReserveReversedJod: "0.000",
    recentEntries: [],
  };

  let settings;
  try {
    settings = await engine.getActivationEngineSettings(runner);
  } catch (err) {
    if (isMissingSchema(err)) {
      return { ...empty, schemaReady: false };
    }
    throw err;
  }

  try {
    const params = [];
    const where = [];
    if (dateFrom) {
      params.push(new Date(dateFrom).toISOString());
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      params.push(new Date(dateTo).toISOString());
      where.push(`created_at <= $${params.length}::timestamptz`);
    }
    if (planCode) {
      params.push(String(planCode).trim().toLowerCase());
      where.push(`LOWER(plan_code) = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totals = await runner.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'membership_reserve_allocated' THEN reserve_amount_jod ELSE 0 END), 0) AS allocated,
         COALESCE(SUM(CASE WHEN status = 'active' AND entry_type = 'membership_reserve_allocated' THEN reserve_amount_jod ELSE 0 END), 0) AS active,
         COALESCE(SUM(CASE WHEN status = 'reversed' OR entry_type = 'membership_reserve_reversed' THEN reserve_amount_jod ELSE 0 END), 0) AS reversed
         FROM freelancer_activation_work_inventory_reserve_entries
         ${whereSql}`,
      params,
    );

    const limit = Math.min(Math.max(Number(recentLimit) || 25, 1), 100);
    const recentParams = [...params, limit];
    const recent = await runner.query(
      `SELECT id, freelancer_user_id, trial_id, membership_id, plan_code,
              plan_price_jod, reserve_percentage, reserve_amount_jod, currency,
              entry_type, status, idempotency_key, metadata, created_at, updated_at
         FROM freelancer_activation_work_inventory_reserve_entries
         ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT $${recentParams.length}`,
      recentParams,
    );

    const row = totals.rows[0] || {};
    return {
      schemaReady: true,
      settings: {
        workInventoryEnabled: Boolean(settings.workInventoryEnabled),
        workInventoryPercentage: Number(settings.workInventoryPercentage),
        engineEnabled: Boolean(settings.engineEnabled),
      },
      totalReserveAllocatedJod: millisToJodString(
        parseJodToMillis(String(row.allocated ?? "0"), { label: "allocated" }),
      ),
      totalReserveActiveJod: millisToJodString(
        parseJodToMillis(String(row.active ?? "0"), { label: "active" }),
      ),
      totalReserveReversedJod: millisToJodString(
        parseJodToMillis(String(row.reversed ?? "0"), { label: "reversed" }),
      ),
      recentEntries: (recent.rows || []).map((r) => {
        let meta = r.metadata;
        if (typeof meta === "string") {
          try {
            meta = JSON.parse(meta);
          } catch {
            meta = null;
          }
        }
        return {
          id: Number(r.id),
          freelancerUserId: Number(r.freelancer_user_id),
          membershipId: r.membership_id != null ? Number(r.membership_id) : null,
          planCode: r.plan_code || null,
          planPriceJod: String(r.plan_price_jod),
          reservePercentage: Number(r.reserve_percentage),
          reserveAmountJod: String(r.reserve_amount_jod),
          entryType: r.entry_type,
          status: r.status,
          createdAt: r.created_at || null,
          amountSource: meta?.amountSource || meta?.amount_source || null,
        };
      }),
      noteAr:
        "هذا سجل داخلي لتخصيص جزء من الاشتراكات لتمويل فرص العمل المستقبلية، ولا يمثل رصيدًا قابلًا للسحب.",
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return {
        ...empty,
        schemaReady: false,
        settings: {
          workInventoryEnabled: Boolean(settings.workInventoryEnabled),
          workInventoryPercentage: Number(settings.workInventoryPercentage),
          engineEnabled: Boolean(settings.engineEnabled),
        },
      };
    }
    throw err;
  }
}

async function sumActiveReserveJod({ client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT COALESCE(SUM(reserve_amount_jod), 0) AS active
         FROM freelancer_activation_work_inventory_reserve_entries
        WHERE status = 'active'
          AND entry_type = 'membership_reserve_allocated'`,
    );
    return millisToJodString(
      parseJodToMillis(String(rows[0]?.active ?? "0"), { label: "kpiActiveReserve" }),
    );
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

async function sumAllocatedReserveJod({ client = null } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT COALESCE(SUM(reserve_amount_jod), 0) AS allocated
         FROM freelancer_activation_work_inventory_reserve_entries
        WHERE entry_type = 'membership_reserve_allocated'`,
    );
    return millisToJodString(
      parseJodToMillis(String(rows[0]?.allocated ?? "0"), { label: "kpiAllocatedReserve" }),
    );
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

module.exports = {
  reserveIdempotencyKey,
  mapReserveEntry,
  computeReserveAmountJod,
  resolveCatalogPlanPrice,
  allocateWorkInventoryReserveForPaidMembership,
  reverseWorkInventoryReserveForMembership,
  getSuperAdminWorkInventoryReserveSummary,
  sumActiveReserveJod,
  sumAllocatedReserveJod,
};
