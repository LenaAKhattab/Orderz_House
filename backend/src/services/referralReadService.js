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

function pageParams(query = {}) {
  const limit = Math.min(Math.max(Math.trunc(Number(query.limit)) || 25, 1), 100);
  const page = Math.max(Math.trunc(Number(query.page)) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

/** Single serializer for commission rows so user and admin views agree field by field. */
function mapCommission(row) {
  const commission = minor(row.commission_minor);
  const reversed = minor(row.reversed_minor);
  return {
    id: Number(row.id),
    createdAt: row.created_at,
    paymentType: row.payment_source_type,
    listAmountMinor: row.list_amount_minor == null ? minor(row.payment_base_minor) : minor(row.list_amount_minor),
    discountMinor: minor(row.discount_minor),
    paymentBaseMinor: minor(row.payment_base_minor),
    refundedBaseMinor: minor(row.refunded_base_minor),
    calculationMode: row.calculation_mode,
    percentageBps: row.percentage_bps == null ? null : Number(row.percentage_bps),
    fixedAmountMinor: row.fixed_amount_minor == null ? null : Number(row.fixed_amount_minor),
    commissionMinor: commission,
    reversedMinor: reversed,
    netCommissionMinor: commission - reversed,
    status: row.status,
    holdUntil: row.hold_until,
    availableAt: row.available_at,
    policyVersionId: Number(row.policy_version_id),
  };
}

const COMMISSION_COLUMNS = `c.id, c.created_at, c.payment_source_type, c.list_amount_minor, c.discount_minor,
  c.payment_base_minor, c.refunded_base_minor, c.calculation_mode, c.percentage_bps, c.fixed_amount_minor,
  c.commission_minor, c.reversed_minor, c.status, c.hold_until, c.available_at, c.policy_version_id`;

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
  const link = await getOwnReferralLink(userId, role);
  if (!link) return { link: null };
  // One pooled client, sequential queries, always released.
  const db = await pool.connect();
  let buckets;
  let visits;
  let registrations;
  let paid;
  let referrals;
  let commissions;
  let withdrawals;
  let policy;
  try {
    await db.query("BEGIN");
    await promoteMaturedCommissions(db, userId);
    await db.query("COMMIT");
    buckets = await bucketSums(userId, db);
    visits = await db.query(
      `SELECT COALESCE(SUM(hit_count), 0)::int AS hits, COUNT(*)::int AS unique_hits
         FROM referral_visits WHERE referrer_user_id = $1`,
      [userId],
    );
    registrations = await db.query(`SELECT COUNT(*)::int AS n FROM user_referrals WHERE referrer_user_id = $1`, [userId]);
    paid = await db.query(
      `SELECT COUNT(DISTINCT referred_user_id) FILTER (WHERE status NOT IN ('reversed','cancelled'))::int AS n,
              COALESCE(SUM(payment_base_minor - refunded_base_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')), 0)::bigint AS revenue,
              COALESCE(SUM(commission_minor - reversed_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')), 0)::bigint AS commissions
         FROM referral_commissions
        WHERE referrer_user_id = $1`,
      [userId],
    );
    referrals = await db.query(
      `SELECT r.id, r.registered_at, r.attribution_source, u.first_name, u.family_name,
              COUNT(c.id) FILTER (WHERE c.status NOT IN ('reversed','cancelled'))::int AS payments,
              COALESCE(SUM(c.commission_minor - c.reversed_minor) FILTER (WHERE c.status NOT IN ('reversed','cancelled')), 0)::bigint AS commission_minor
         FROM user_referrals r
         JOIN users u ON u.id = r.referred_user_id
         LEFT JOIN referral_commissions c ON c.user_referral_id = r.id
        WHERE r.referrer_user_id = $1
        GROUP BY r.id, u.first_name, u.family_name
        ORDER BY r.registered_at DESC
        LIMIT 100`,
      [userId],
    );
    commissions = await db.query(
      `SELECT ${COMMISSION_COLUMNS}
         FROM referral_commissions c
        WHERE c.referrer_user_id = $1
        ORDER BY c.created_at DESC
        LIMIT 100`,
      [userId],
    );
    withdrawals = await db.query(
      `SELECT id, amount_minor, status, payout_reference, created_at, reviewed_at, paid_at
         FROM referral_withdrawal_requests
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [userId],
    );
    policy = await db.query(
      `SELECT minimum_withdrawal_minor FROM referral_commission_policy_versions ORDER BY id DESC LIMIT 1`,
    );
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    db.release();
  }
  return {
    link,
    balances: {
      pendingMinor: buckets.pending,
      availableMinor: buckets.available,
      reservedMinor: buckets.reserved,
      paidMinor: buckets.paid,
      totalCommissionMinor: minor(paid.rows[0]?.commissions),
      minimumWithdrawalMinor: minor(policy.rows[0]?.minimum_withdrawal_minor),
    },
    stats: {
      linkVisits: Number(visits.rows[0]?.hits || 0),
      uniqueVisits: Number(visits.rows[0]?.unique_hits || 0),
      registrations: Number(registrations.rows[0]?.n || 0),
      paidReferrals: Number(paid.rows[0]?.n || 0),
      attributedRevenueMinor: minor(paid.rows[0]?.revenue),
    },
    referrals: referrals.rows.map((row) => ({
      id: Number(row.id),
      displayName: maskUser(row),
      registeredAt: row.registered_at,
      source: row.attribution_source,
      paymentStatus: Number(row.payments || 0) > 0 ? "paid" : "registered",
      eligiblePayments: Number(row.payments || 0),
      commissionMinor: minor(row.commission_minor),
    })),
    commissions: commissions.rows.map(mapCommission),
    withdrawals: withdrawals.rows.map((row) => ({
      id: Number(row.id),
      amountMinor: minor(row.amount_minor),
      status: row.status,
      payoutReference: row.status === "paid" ? row.payout_reference : null,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      paidAt: row.paid_at,
    })),
  };
}

function dateRange(query) {
  const parsedTo = query.to ? new Date(query.to) : new Date();
  const to = Number.isNaN(parsedTo.getTime()) ? new Date() : parsedTo;
  const parsedFrom = query.from ? new Date(query.from) : null;
  const from = parsedFrom && !Number.isNaN(parsedFrom.getTime())
    ? parsedFrom
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
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
  const regs = await pool.query(`SELECT COUNT(*)::int AS n FROM user_referrals WHERE registered_at >= $1 AND registered_at < $2`, params);
  const money = await pool.query(
    `SELECT COUNT(DISTINCT referred_user_id) FILTER (WHERE status NOT IN ('reversed','cancelled'))::int AS paid,
            COALESCE(SUM(payment_base_minor - refunded_base_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')),0)::bigint AS revenue,
            COALESCE(SUM(commission_minor - reversed_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')),0)::bigint AS commissions
       FROM referral_commissions
      WHERE created_at >= $1 AND created_at < $2`,
    params,
  );
  // Balances are point-in-time and come from the same ledger the user wallet uses.
  const balances = await pool.query(
    `SELECT bucket, COALESCE(SUM(amount_minor),0)::bigint AS n FROM referral_wallet_ledger GROUP BY bucket`,
  );
  const withdrawals = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
       FROM referral_withdrawal_requests WHERE status IN ('pending','approved')`,
  );
  const ledger = { pending: 0, available: 0, reserved: 0, paid: 0 };
  for (const row of balances.rows) ledger[row.bucket] = minor(row.n);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    visits: Number(visits.rows[0]?.hits || 0),
    uniqueVisits: Number(visits.rows[0]?.unique_hits || 0),
    registrations: Number(regs.rows[0]?.n || 0),
    paidReferrals: Number(money.rows[0]?.paid || 0),
    attributedRevenueMinor: minor(money.rows[0]?.revenue),
    commissionMinor: minor(money.rows[0]?.commissions),
    pendingMinor: ledger.pending,
    availableMinor: ledger.available,
    reservedMinor: ledger.reserved,
    paidMinor: ledger.paid,
    pendingWithdrawals: Number(withdrawals.rows[0]?.pending || 0),
    approvedWithdrawals: Number(withdrawals.rows[0]?.approved || 0),
  };
}

const TOP_SORTS = {
  paid_referrals: "paid_referrals DESC, commissions DESC",
  revenue: "revenue DESC, paid_referrals DESC",
  commission: "commissions DESC, paid_referrals DESC",
};

async function topReferrers(query = {}) {
  const order = TOP_SORTS[query.sort] || TOP_SORTS.commission;
  const { rows } = await pool.query(
    `WITH refs AS (
       SELECT referrer_user_id, COUNT(*)::int AS referrals FROM user_referrals GROUP BY referrer_user_id
     ),
     comm AS (
       SELECT referrer_user_id,
              COUNT(DISTINCT referred_user_id) FILTER (WHERE status NOT IN ('reversed','cancelled'))::int AS paid_referrals,
              COALESCE(SUM(payment_base_minor - refunded_base_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')),0)::bigint AS revenue,
              COALESCE(SUM(commission_minor - reversed_minor) FILTER (WHERE status NOT IN ('reversed','cancelled')),0)::bigint AS commissions
         FROM referral_commissions GROUP BY referrer_user_id
     ),
     led AS (
       SELECT user_id,
              COALESCE(SUM(amount_minor) FILTER (WHERE bucket = 'available'),0)::bigint AS available,
              COALESCE(SUM(amount_minor) FILTER (WHERE bucket = 'paid'),0)::bigint AS paid
         FROM referral_wallet_ledger GROUP BY user_id
     )
     SELECT u.id, u.first_name, u.family_name, u.account_id, u.role, refs.referrals,
            COALESCE(comm.paid_referrals,0) AS paid_referrals, COALESCE(comm.revenue,0) AS revenue,
            COALESCE(comm.commissions,0) AS commissions,
            COALESCE(led.available,0) AS available, COALESCE(led.paid,0) AS paid
       FROM refs
       JOIN users u ON u.id = refs.referrer_user_id AND u.role IN ('client','freelancer')
       LEFT JOIN comm ON comm.referrer_user_id = refs.referrer_user_id
       LEFT JOIN led ON led.user_id = refs.referrer_user_id
      ORDER BY ${order}, u.id
      LIMIT 50`,
  );
  return rows.map((row) => ({
    userId: Number(row.id),
    displayName: maskUser(row),
    accountId: row.account_id,
    role: row.role,
    referrals: Number(row.referrals || 0),
    paidReferrals: Number(row.paid_referrals || 0),
    attributedRevenueMinor: minor(row.revenue),
    totalCommissionMinor: minor(row.commissions),
    availableMinor: minor(row.available),
    paidMinor: minor(row.paid),
  }));
}

async function listRelationships(query = {}) {
  const { limit, offset, page } = pageParams(query);
  const { rows } = await pool.query(
    `SELECT r.id, r.registered_at, r.attribution_source, r.policy_version_id, rc.code,
            ru.first_name AS referrer_first, ru.family_name AS referrer_family, ru.account_id AS referrer_account,
            du.first_name AS referred_first, du.family_name AS referred_family, du.account_id AS referred_account,
            du.role AS referred_role,
            (SELECT COUNT(*)::int FROM referral_commissions c
              WHERE c.user_referral_id = r.id AND c.status NOT IN ('reversed','cancelled')) AS payments,
            COUNT(*) OVER()::int AS total
       FROM user_referrals r
       JOIN referral_codes rc ON rc.id = r.referral_code_id
       JOIN users ru ON ru.id = r.referrer_user_id
       JOIN users du ON du.id = r.referred_user_id
      ORDER BY r.registered_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return {
    page,
    limit,
    total: Number(rows[0]?.total || 0),
    items: rows.map((row) => ({
      id: Number(row.id),
      registeredAt: row.registered_at,
      source: row.attribution_source,
      policyVersionId: Number(row.policy_version_id),
      code: row.code,
      referrer: maskUser({ first_name: row.referrer_first, family_name: row.referrer_family }),
      referrerAccountId: row.referrer_account,
      referred: maskUser({ first_name: row.referred_first, family_name: row.referred_family }),
      referredAccountId: row.referred_account,
      referredRole: row.referred_role,
      payments: Number(row.payments || 0),
    })),
  };
}

async function listCommissions(query = {}) {
  const { limit, offset, page } = pageParams(query);
  const status = ["pending", "available", "paid", "reversed", "cancelled"].includes(query.status) ? query.status : null;
  const { rows } = await pool.query(
    `SELECT ${COMMISSION_COLUMNS},
            ru.first_name AS referrer_first, ru.family_name AS referrer_family, ru.account_id AS referrer_account,
            du.first_name AS referred_first, du.family_name AS referred_family,
            COUNT(*) OVER()::int AS total
       FROM referral_commissions c
       JOIN users ru ON ru.id = c.referrer_user_id
       JOIN users du ON du.id = c.referred_user_id
      WHERE ($3::text IS NULL OR c.status = $3)
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset, status],
  );
  return {
    page,
    limit,
    total: Number(rows[0]?.total || 0),
    items: rows.map((row) => ({
      ...mapCommission(row),
      referrer: maskUser({ first_name: row.referrer_first, family_name: row.referrer_family }),
      referrerAccountId: row.referrer_account,
      referred: maskUser({ first_name: row.referred_first, family_name: row.referred_family }),
    })),
  };
}

async function listWithdrawals(query = {}) {
  const { limit, offset, page } = pageParams(query);
  const status = ["pending", "approved", "paid", "rejected", "cancelled"].includes(query.status) ? query.status : null;
  const { rows } = await pool.query(
    `SELECT w.id, w.user_id, w.amount_minor, w.status, w.payout_reference, w.admin_note, w.created_at,
            w.reviewed_at, w.paid_at, w.cancelled_by_user,
            u.first_name, u.family_name, u.account_id, u.email, u.role,
            a.first_name AS admin_first, a.family_name AS admin_family,
            COUNT(*) OVER()::int AS total
       FROM referral_withdrawal_requests w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN users a ON a.id = w.reviewed_by_admin_id
      WHERE ($3::text IS NULL OR w.status = $3)
      ORDER BY (w.status IN ('pending','approved')) DESC, w.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset, status],
  );
  const userIds = [...new Set(rows.map((row) => Number(row.user_id)))];
  const balances = new Map();
  if (userIds.length) {
    const { rows: sums } = await pool.query(
      `SELECT user_id, bucket, COALESCE(SUM(amount_minor),0)::bigint AS n
         FROM referral_wallet_ledger WHERE user_id = ANY($1::bigint[])
        GROUP BY user_id, bucket`,
      [userIds],
    );
    for (const row of sums) {
      const key = Number(row.user_id);
      if (!balances.has(key)) balances.set(key, { pending: 0, available: 0, reserved: 0, paid: 0 });
      balances.get(key)[row.bucket] = minor(row.n);
    }
  }
  return {
    page,
    limit,
    total: Number(rows[0]?.total || 0),
    items: rows.map((row) => {
      const b = balances.get(Number(row.user_id)) || { pending: 0, available: 0, reserved: 0, paid: 0 };
      return {
        id: Number(row.id),
        userId: Number(row.user_id),
        user: [row.first_name, row.family_name].filter(Boolean).join(" ") || "—",
        accountId: row.account_id,
        email: row.email,
        role: row.role,
        amountMinor: minor(row.amount_minor),
        status: row.status,
        payoutReference: row.payout_reference,
        adminNote: row.admin_note,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
        paidAt: row.paid_at,
        cancelledByUser: Boolean(row.cancelled_by_user),
        reviewedBy: maskUser({ first_name: row.admin_first, family_name: row.admin_family }),
        balances: {
          pendingMinor: b.pending,
          availableMinor: b.available,
          reservedMinor: b.reserved,
          paidMinor: b.paid,
        },
      };
    }),
  };
}

async function listBonusRules() {
  const { rows } = await pool.query(
    `SELECT r.*, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.family_name)), '') AS created_by_name,
            (SELECT COUNT(*)::int FROM referral_bonus_awards a WHERE a.rule_id = r.id) AS awards
       FROM referral_bonus_rules r
       LEFT JOIN users u ON u.id = r.created_by_admin_id
      ORDER BY r.threshold_paid_referrals`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    thresholdPaidReferrals: Number(row.threshold_paid_referrals),
    bonusAmountMinor: minor(row.bonus_amount_minor),
    enabled: Boolean(row.enabled),
    effectiveFrom: row.effective_from,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name,
    awards: Number(row.awards || 0),
  }));
}

async function referralDetail(id) {
  const { rows } = await pool.query(
    `SELECT r.id, r.registered_at, r.policy_version_id, r.attribution_source, rc.code,
            p.calculation_mode, p.percentage_bps, p.fixed_amount_minor,
            p.eligible_payment_types, p.commission_hold_days,
            p.discount_enabled, p.discount_mode, p.discount_percentage_bps, p.discount_fixed_minor, p.discount_payment_types,
            ru.first_name AS referrer_first, ru.family_name AS referrer_family, ru.account_id AS referrer_account,
            du.first_name AS referred_first, du.family_name AS referred_family, du.account_id AS referred_account,
            (SELECT json_agg(f.reason) FROM referral_review_flags f WHERE f.referred_user_id = r.referred_user_id) AS flags
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
    `SELECT ${COMMISSION_COLUMNS} FROM referral_commissions c WHERE c.user_referral_id = $1 ORDER BY c.created_at`,
    [id],
  );
  return {
    id: Number(row.id),
    referrer: maskUser({ first_name: row.referrer_first, family_name: row.referrer_family }),
    referrerAccountId: row.referrer_account,
    referred: maskUser({ first_name: row.referred_first, family_name: row.referred_family }),
    referredAccountId: row.referred_account,
    registeredAt: row.registered_at,
    source: row.attribution_source,
    code: row.code,
    policyVersionId: Number(row.policy_version_id),
    calculationMode: row.calculation_mode,
    percentageBps: row.percentage_bps == null ? null : Number(row.percentage_bps),
    fixedAmountMinor: row.fixed_amount_minor == null ? null : Number(row.fixed_amount_minor),
    eligiblePaymentTypes: row.eligible_payment_types,
    commissionHoldDays: Number(row.commission_hold_days),
    discountEnabled: Boolean(row.discount_enabled),
    discountMode: row.discount_mode,
    discountPercentageBps: row.discount_percentage_bps == null ? null : Number(row.discount_percentage_bps),
    discountFixedMinor: row.discount_fixed_minor == null ? null : Number(row.discount_fixed_minor),
    discountPaymentTypes: row.discount_payment_types || [],
    flags: row.flags || [],
    payments: payments.rows.map(mapCommission),
  };
}

module.exports = {
  maskUser,
  mapCommission,
  bucketSums,
  getUserDashboard,
  adminOverview,
  topReferrers,
  listRelationships,
  listCommissions,
  listWithdrawals,
  listBonusRules,
  referralDetail,
};
