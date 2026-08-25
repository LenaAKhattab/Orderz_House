/**
 * Phase E1 — daily Bid spend gate (business-day counter).
 * Timezone: marketplace_economy_settings.marketplace_membership_business_timezone (default Asia/Amman).
 * Gates ALL Bid-requiring opportunities before FEFO consume (unified wallet).
 */

const { createAppError } = require("../utils/AppError");
const { DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE } = require("../constants/marketplaceMembershipPlans");

function resolveBusinessSpendDate(now = new Date(), timeZone = DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE) {
  const tz = String(timeZone || DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE).trim() || DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE;
  // en-CA yields YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(now));
}

async function resolveBusinessTimezone(client) {
  try {
    const { rows } = await client.query(
      `SELECT marketplace_membership_business_timezone AS tz
         FROM marketplace_economy_settings WHERE id = 1`,
    );
    return rows[0]?.tz || DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE;
  } catch {
    return DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE;
  }
}

/**
 * Resolve daily limit from current benefit-usable Marketplace Membership plan.
 * Returns null when no membership / no limit configured (gate skipped).
 */
async function resolveDailyBidSpendLimit(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT p.daily_bid_spend_limit, p.tier_code, p.monthly_bid_allowance
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
      WHERE m.freelancer_user_id = $1
        AND m.is_current = TRUE
        AND m.status IN ('active', 'cancel_at_period_end', 'purchased_pending_start')
      LIMIT 1`,
    [Number(freelancerUserId)],
  );
  const row = rows[0];
  if (!row) return { limit: null, tierCode: null };
  const limit = row.daily_bid_spend_limit != null ? Number(row.daily_bid_spend_limit) : null;
  if (!Number.isInteger(limit) || limit < 0) return { limit: null, tierCode: row.tier_code };
  return { limit, tierCode: row.tier_code };
}

/**
 * Atomically reserve `amount` against today's daily Bid spend limit.
 * Concurrent third request fails when limit=2 and two already reserved 1 each.
 */
async function assertAndConsumeDailyBidSpend({
  client,
  freelancerUserId,
  amount = 1,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("assertAndConsumeDailyBidSpend requires a transaction client.", 500);
  }
  const qty = Number(amount);
  if (!Number.isInteger(qty) || qty < 1) {
    throw createAppError("Daily Bid spend amount must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_DAILY_BID_SPEND_AMOUNT",
    });
  }

  const { limit, tierCode } = await resolveDailyBidSpendLimit(client, freelancerUserId);
  if (limit == null) {
    return { gated: false, skipped: true, reason: "NO_DAILY_LIMIT" };
  }

  const tz = await resolveBusinessTimezone(client);
  const spendDate = resolveBusinessSpendDate(now, tz);

  // Lock / upsert counter row
  await client.query(
    `INSERT INTO marketplace_freelancer_daily_bid_spend (freelancer_user_id, spend_date, amount_spent)
     VALUES ($1, $2::date, 0)
     ON CONFLICT (freelancer_user_id, spend_date) DO NOTHING`,
    [Number(freelancerUserId), spendDate],
  );
  const { rows: locked } = await client.query(
    `SELECT amount_spent FROM marketplace_freelancer_daily_bid_spend
      WHERE freelancer_user_id = $1 AND spend_date = $2::date
      FOR UPDATE`,
    [Number(freelancerUserId), spendDate],
  );
  const current = Number(locked[0]?.amount_spent) || 0;
  if (current + qty > limit) {
    throw createAppError(
      `Daily Bid limit reached for your membership (${limit} per day). Unused days do not reduce your remaining Bids.`,
      409,
      {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_DAILY_BID_LIMIT_REACHED",
        meta: { limit, spent: current, requested: qty, spendDate, tierCode, timeZone: tz },
      },
    );
  }

  const { rows: updated } = await client.query(
    `UPDATE marketplace_freelancer_daily_bid_spend
        SET amount_spent = amount_spent + $3,
            updated_at = NOW()
      WHERE freelancer_user_id = $1
        AND spend_date = $2::date
        AND amount_spent + $3 <= $4
      RETURNING amount_spent`,
    [Number(freelancerUserId), spendDate, qty, limit],
  );
  if (!updated[0]) {
    throw createAppError("Daily Bid limit reached (concurrent).", 409, {
      exposeToClient: true,
      publicCode: "MEMBERSHIP_DAILY_BID_LIMIT_REACHED",
      meta: { limit, spendDate, tierCode },
    });
  }

  return {
    gated: true,
    spendDate,
    timeZone: tz,
    limit,
    amountSpent: Number(updated[0].amount_spent),
    tierCode,
  };
}

  async function releaseDailyBidSpend({
  client,
  freelancerUserId,
  amount = 1,
  spendDate,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("releaseDailyBidSpend requires a transaction client.", 500);
  }
  const qty = Number(amount);
  if (!Number.isInteger(qty) || qty < 1) {
    throw createAppError("Daily Bid release amount must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_DAILY_BID_SPEND_AMOUNT",
    });
  }
  const tz = await resolveBusinessTimezone(client);
  const today = resolveBusinessSpendDate(now, tz);
  const day = spendDate ? String(spendDate) : today;
  // Preferred product: restore capacity only for same business day.
  if (day !== today) {
    return { restored: false, reason: "NOT_SAME_BUSINESS_DAY", spendDate: day, today, timeZone: tz };
  }
  const { rows } = await client.query(
    `UPDATE marketplace_freelancer_daily_bid_spend
        SET amount_spent = GREATEST(0, amount_spent - $3),
            updated_at = NOW()
      WHERE freelancer_user_id = $1 AND spend_date = $2::date
      RETURNING amount_spent`,
    [Number(freelancerUserId), day, qty],
  );
  if (!rows[0]) {
    return { restored: false, reason: "NO_DAILY_ROW", spendDate: day, timeZone: tz };
  }
  return {
    restored: true,
    spendDate: day,
    timeZone: tz,
    amountSpent: Number(rows[0].amount_spent),
  };
}

module.exports = {
  resolveBusinessSpendDate,
  resolveBusinessTimezone,
  resolveDailyBidSpendLimit,
  assertAndConsumeDailyBidSpend,
  releaseDailyBidSpend,
  DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE,
};
