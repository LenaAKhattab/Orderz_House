const { pool } = require("../config/db");
const { promoteMaturedCommissions } = require("./referralCommissionService");
const { getOwnReferralLink } = require("./referralAttributionService");

function maskUser(row) {
  const first = String(row?.first_name || "").trim();
  const family = String(row?.family_name || "").trim();
  const initial = family ? `${family.slice(0, 1)}.` : "";
  return [first, initial].filter(Boolean).join(" ") || "—";
}

function minor(value) {
  return Number(value || 0);
}

async function bucketSums(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT bucket, COALESCE(SUM(amount_minor), 0)::bigint AS n
       FROM referral_wallet_ledger
      WHERE user_id = $1
      GROUP BY bucket`,
    [userId],
  );
  const out = { pending: 0, available: 0, reserved: 0, paid: 0 };
  for (const row of rows) out[row.bucket] = minor(row.n);
  return out;
}

async function getUserDashboard(userId, role) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await promoteMaturedCommissions(db, userId);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }

  const link = await getOwnReferralLink(userId, role);
  const buckets = await bucketSums(userId);
  const visits = await pool.query(
    `SELECT COALESCE(SUM(hit_count), 0)::int AS hits, COUNT(*)::int AS unique_hits
       FROM referral_visits WHERE referrer_user_id = $1`,
    [userId],
  );
  const registrations = await pool.query(
    `SELECT COUNT(*)::int AS n FROM user_referrals WHERE referrer_user_id = $1`,
    [userId],
  );
  const paid = await pool.query(
    `SELECT COUNT(DISTINCT referred_user_id) FILTER (WHERE status NOT IN ('reversed','cancelled'))::int AS n,
            COALESCE(SUM(payment_base_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')), 0)::bigint AS revenue,
            COALESCE(SUM(commission_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')), 0)::bigint AS commissions
       FROM referral_commissions
      WHERE referrer_user_id = $1`,
    [userId],
  );
  const referrals = await pool.query(
    `SELECT r.registered_at, u.first_name, u.family_name,
            COUNT(c.id)::int AS payments,
            COALESCE(SUM(c.commission_minor) FILTER (WHERE c.status NOT IN ('reversed','cancelled')), 0)::bigint AS commission_minor,
            BOOL_OR(c.id IS NOT NULL AND c.status NOT IN ('cancelled')) AS has_payment
       FROM user_referrals r
       JOIN users u ON u.id = r.referred_user_id
       LEFT JOIN referral_commissions c ON c.user_referral_id = r.id
      WHERE r.referrer_user_id = $1
      GROUP BY r.id, u.first_name, u.family_name
      ORDER BY r.registered_at DESC
      LIMIT 100`,
    [userId],
  );
  const commissions = await pool.query(
    `SELECT created_at, payment_source_type, payment_base_minor, calculation_mode,
            percentage_bps, fixed_amount_minor, commission_minor, status, policy_version_id
       FROM referral_commissions
      WHERE referrer_user_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [userId],
  );
  return {
    link,
    balances: {
      pendingMinor: buckets.pending,
      availableMinor: buckets.available,
      paidMinor: buckets.paid,
      totalCommissionMinor: minor(paid.rows[0]?.commissions),
    },
    stats: {
      linkVisits: Number(visits.rows[0]?.hits || 0),
      uniqueVisits: Number(visits.rows[0]?.unique_hits || 0),
      registrations: Number(registrations.rows[0]?.n || 0),
      paidReferrals: Number(paid.rows[0]?.n || 0),
      attributedRevenueMinor: minor(paid.rows[0]?.revenue),
    },
    referrals: referrals.rows.map((row) => ({
      displayName: maskUser(row),
      registeredAt: row.registered_at,
      paymentStatus: row.has_payment ? "paid" : "registered",
      eligiblePayments: Number(row.payments || 0),
      commissionMinor: minor(row.commission_minor),
    })),
    commissions: commissions.rows.map((row) => ({
      createdAt: row.created_at,
      paymentType: row.payment_source_type,
      paymentBaseMinor: minor(row.payment_base_minor),
      calculationMode: row.calculation_mode,
      percentageBps: row.percentage_bps == null ? null : Number(row.percentage_bps),
      fixedAmountMinor: row.fixed_amount_minor == null ? null : Number(row.fixed_amount_minor),
      commissionMinor: minor(row.commission_minor),
      status: row.status,
      policyVersionId: Number(row.policy_version_id),
    })),
  };
}

function dateRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

async function adminOverview(query) {
  const { from, to } = dateRange(query);
  const params = [from.toISOString(), to.toISOString()];
  const visits = await pool.query(
    `SELECT COALESCE(SUM(hit_count),0)::int AS hits, COUNT(*)::int AS unique_hits
       FROM referral_visits WHERE landing_at >= $1 AND landing_at < $2`,
    params,
  );
  const regs = await pool.query(
    `SELECT COUNT(*)::int AS n FROM user_referrals WHERE registered_at >= $1 AND registered_at < $2`,
    params,
  );
  const money = await pool.query(
    `SELECT COUNT(DISTINCT referred_user_id)::int AS paid,
            COALESCE(SUM(payment_base_minor),0)::bigint AS revenue,
            COALESCE(SUM(commission_minor) FILTER (WHERE status = 'pending'),0)::bigint AS pending,
            COALESCE(SUM(commission_minor) FILTER (WHERE status = 'available'),0)::bigint AS available,
            COALESCE(SUM(commission_minor) FILTER (WHERE status = 'paid'),0)::bigint AS paid_commission
       FROM referral_commissions
      WHERE created_at >= $1 AND created_at < $2 AND status <> 'cancelled'`,
    params,
  );
  const withdrawals = await pool.query(
    `SELECT COUNT(*)::int AS n FROM referral_withdrawal_requests WHERE status = 'pending'`,
  );
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    visits: Number(visits.rows[0]?.hits || 0),
    uniqueVisits: Number(visits.rows[0]?.unique_hits || 0),
    registrations: Number(regs.rows[0]?.n || 0),
    paidReferrals: Number(money.rows[0]?.paid || 0),
    attributedRevenueMinor: minor(money.rows[0]?.revenue),
    pendingMinor: minor(money.rows[0]?.pending),
    availableMinor: minor(money.rows[0]?.available),
    paidMinor: minor(money.rows[0]?.paid_commission),
    pendingWithdrawals: Number(withdrawals.rows[0]?.n || 0),
    definitions: {
      linkVisit: "A valid referral route visit.",
      registration: "A new account permanently linked to a referrer.",
      paidReferral: "A unique referred account with at least one confirmed eligible payment.",
      attributedRevenue: "Sum of eligible payment bases.",
      available: "Currently withdrawable referral balance.",
      paid: "Referral withdrawals marked paid.",
    },
  };
}

async function topReferrers() {
  const { rows } = await pool.query(
    `SELECT u.id, u.first_name, u.family_name, u.account_id,
            COUNT(DISTINCT r.id)::int AS referrals,
            COUNT(DISTINCT c.referred_user_id) FILTER (WHERE c.status NOT IN ('cancelled'))::int AS paid_referrals,
            COALESCE(SUM(c.payment_base_minor) FILTER (WHERE c.status <> 'cancelled'),0)::bigint AS revenue,
            COALESCE(SUM(c.commission_minor) FILTER (WHERE c.status NOT IN ('reversed','cancelled')),0)::bigint AS commissions
       FROM user_referrals r
       JOIN users u ON u.id = r.referrer_user_id
       LEFT JOIN referral_commissions c ON c.user_referral_id = r.id
      GROUP BY u.id
      ORDER BY commissions DESC
      LIMIT 50`,
  );
  const withBalances = [];
  for (const row of rows) {
    const buckets = await bucketSums(row.id);
    withBalances.push({
      userId: Number(row.id),
      displayName: maskUser(row),
      accountId: row.account_id,
      referrals: Number(row.referrals),
      paidReferrals: Number(row.paid_referrals || 0),
      attributedRevenueMinor: minor(row.revenue),
      totalCommissionMinor: minor(row.commissions),
      availableMinor: buckets.available,
      paidMinor: buckets.paid,
    });
  }
  return withBalances;
}

async function referralDetail(id) {
  const { rows } = await pool.query(
    `SELECT r.id, r.registered_at, r.policy_version_id, rc.code,
            p.calculation_mode, p.percentage_bps, p.fixed_amount_minor,
            p.eligible_payment_types, p.commission_hold_days,
            ru.first_name AS referrer_first, ru.family_name AS referrer_family,
            du.first_name AS referred_first, du.family_name AS referred_family
       FROM user_referrals r
       JOIN referral_commission_policy_versions p ON p.id = r.policy_version_id
       JOIN referral_codes rc ON rc.id = r.referral_code_id
       JOIN users ru ON ru.id = r.referrer_user_id
       JOIN users du ON du.id = r.referred_user_id
      WHERE r.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const payments = await pool.query(
    `SELECT id, payment_source_type, payment_base_minor, commission_minor, status, created_at, calculation_mode, percentage_bps, fixed_amount_minor
       FROM referral_commissions WHERE user_referral_id = $1 ORDER BY created_at`,
    [id],
  );
  return {
    id: Number(row.id),
    referrer: maskUser({ first_name: row.referrer_first, family_name: row.referrer_family }),
    referred: maskUser({ first_name: row.referred_first, family_name: row.referred_family }),
    registeredAt: row.registered_at,
    code: row.code,
    policyVersionId: Number(row.policy_version_id),
    calculationMode: row.calculation_mode,
    percentageBps: row.percentage_bps == null ? null : Number(row.percentage_bps),
    fixedAmountMinor: row.fixed_amount_minor == null ? null : Number(row.fixed_amount_minor),
    eligiblePaymentTypes: row.eligible_payment_types,
    commissionHoldDays: Number(row.commission_hold_days),
    payments: payments.rows,
  };
}

module.exports = {
  maskUser,
  getUserDashboard,
  adminOverview,
  topReferrers,
  referralDetail,
};
