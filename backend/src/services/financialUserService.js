const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");
const { roundMoney, toNum } = require("../utils/moneyMath");

async function resolvePersonForUser(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) {
    throw createPublicApiError("جلسة غير صالحة.", 401, "UNAUTHORIZED");
  }
  const { rows } = await pool.query(
    `SELECT p.id, p.full_name, p.user_id, u.is_active
     FROM financial_people p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1 AND u.role = 'financial_user'
     LIMIT 1`,
    [uid],
  );
  const row = rows[0];
  if (!row) {
    throw createPublicApiError("لا يوجد ملف مالي مرتبط بهذا الحساب.", 403, "FORBIDDEN");
  }
  if (!row.is_active) {
    throw createPublicApiError("تم إيقاف هذا الحساب، يرجى التواصل مع الإدارة.", 403, "ACCOUNT_SUSPENDED");
  }
  return row;
}

async function getMySummary(userId) {
  const person = await resolvePersonForUser(userId);
  const personId = Number(person.id);

  const { rows } = await pool.query(
    `SELECT
      COALESCE(SUM(a.calculated_amount), 0)::numeric AS total_bonus,
      COALESCE(SUM(a.calculated_amount) FILTER (WHERE a.paid_status = 'paid'), 0)::numeric AS total_paid,
      COALESCE(SUM(a.calculated_amount) FILTER (WHERE a.paid_status != 'paid'), 0)::numeric AS total_unpaid,
      COALESCE(SUM(a.calculated_amount) FILTER (
        WHERE br.month_key = to_char(now(), 'YYYY-MM')
      ), 0)::numeric AS month_bonus,
      MAX(a.paid_at) FILTER (WHERE a.paid_status = 'paid') AS last_paid_at
     FROM financial_bonus_allocations a
     JOIN financial_bonus_rows br ON br.id = a.bonus_row_id
     WHERE a.person_id = $1 AND br.status != 'cancelled'`,
    [personId],
  );
  const s = rows[0] || {};
  return {
    fullName: person.full_name,
    totalBonus: roundMoney(s.total_bonus),
    totalPaid: roundMoney(s.total_paid),
    totalUnpaid: roundMoney(s.total_unpaid),
    monthBonus: roundMoney(s.month_bonus),
    lastPaidAt: s.last_paid_at || null,
  };
}

async function listMyBonuses(userId, { month = "" } = {}) {
  const person = await resolvePersonForUser(userId);
  const personId = Number(person.id);
  const params = [personId];
  let monthClause = "";
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) {
    params.push(String(month));
    monthClause = `AND br.month_key = $2`;
  }

  const { rows } = await pool.query(
    `SELECT
      a.id AS allocation_id,
      br.id AS bonus_row_id,
      br.month_key,
      br.title,
      br.source_type,
      br.bonus_pool_amount,
      a.percentage_share,
      a.calculated_amount,
      a.paid_status,
      a.paid_at,
      a.note
     FROM financial_bonus_allocations a
     JOIN financial_bonus_rows br ON br.id = a.bonus_row_id
     WHERE a.person_id = $1 AND br.status != 'cancelled' ${monthClause}
     ORDER BY br.month_key DESC, br.created_at DESC, a.id DESC`,
    params,
  );

  return rows.map((r) => ({
    allocationId: String(r.allocation_id),
    monthKey: r.month_key,
    title: r.title,
    sourceType: r.source_type,
    bonusPoolAmount: roundMoney(r.bonus_pool_amount),
    percentageShare: roundMoney(r.percentage_share),
    myAmount: roundMoney(r.calculated_amount),
    paidStatus: r.paid_status,
    paidAt: r.paid_at || null,
    note: r.note || null,
  }));
}

module.exports = {
  resolvePersonForUser,
  getMySummary,
  listMyBonuses,
};
