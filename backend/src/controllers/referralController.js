const { pool } = require("../config/db");
const { captureVisit, COOKIE_NAME } = require("../services/referralAttributionService");
const { getUserDashboard } = require("../services/referralReadService");
const { requestWithdrawal } = require("../services/referralWithdrawalService");
const {
  getCurrentPolicy,
  listPolicyHistory,
  createPolicyVersion,
  regenerateReferralCode,
} = require("../services/referralPolicyService");
const { adminOverview, topReferrers, referralDetail } = require("../services/referralReadService");
const { reviewWithdrawal } = require("../services/referralWithdrawalService");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");

function sendError(next, error) {
  if (!error.status && error.publicCode) error.status = 400;
  return next(error);
}

const capture = async (req, res, next) => {
  try {
    const result = await captureVisit({
      code: req.body?.code || req.params?.code,
      cookieToken: req.cookies?.[COOKIE_NAME],
      utmSource: req.body?.utmSource,
      utmMedium: req.body?.utmMedium,
      utmCampaign: req.body?.utmCampaign,
    });
    if (!result.ok) {
      return res.status(404).json({ success: false, code: "INVALID_REFERRAL_CODE" });
    }
    if (result.cookie) res.cookie(result.cookie.name, result.cookie.value, result.cookie.options);
    return res.json({
      success: true,
      data: { preserved: Boolean(result.preserved), programEnabled: Boolean(result.programEnabled) },
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const data = await getUserDashboard(req.user.id, req.user.role);
    if (!data.link) return res.status(403).json({ success: false, code: "REFERRAL_ROLE_EXCLUDED" });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const withdraw = async (req, res, next) => {
  try {
    const amount = amountMajorToStripeMinor(req.body?.amountJod, "JOD");
    const row = await requestWithdrawal(req.user.id, amount);
    return res.status(201).json({ success: true, data: { id: Number(row.id), status: row.status, amountMinor: Number(row.amount_minor) } });
  } catch (error) {
    return sendError(next, error);
  }
};

const settings = async (req, res, next) => {
  try {
    const current = await getCurrentPolicy();
    return res.json({ success: true, data: current });
  } catch (error) {
    return next(error);
  }
};

const saveSettings = async (req, res, next) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ success: false, code: "CONFIRMATION_REQUIRED" });
    }
    const percentage = req.body.percentage != null ? Math.round(Number(req.body.percentage) * 100) : null;
    const fixed = req.body.fixedAmountJod != null ? amountMajorToStripeMinor(req.body.fixedAmountJod, "JOD") : null;
    const minimum = req.body.minimumWithdrawalJod != null ? amountMajorToStripeMinor(req.body.minimumWithdrawalJod, "JOD") : 0;
    const discountFixed = req.body.discountFixedJod != null ? amountMajorToStripeMinor(req.body.discountFixedJod, "JOD") : null;
    const discountBps = req.body.discountPercentage != null ? Math.round(Number(req.body.discountPercentage) * 100) : null;
    const created = await createPolicyVersion(
      {
        enabled: Boolean(req.body.enabled),
        calculationMode: req.body.calculationMode,
        percentageBps: percentage,
        fixedAmountMinor: fixed,
        commissionHoldDays: Number(req.body.commissionHoldDays),
        minimumWithdrawalMinor: minimum,
        eligiblePaymentTypes: req.body.eligiblePaymentTypes,
        discountEnabled: Boolean(req.body.discountEnabled),
        discountMode: req.body.discountMode,
        discountPercentageBps: discountBps,
        discountFixedMinor: discountFixed,
      },
      req.user.id,
    );
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return sendError(next, error);
  }
};

const history = async (_req, res, next) => {
  try {
    return res.json({ success: true, data: await listPolicyHistory() });
  } catch (error) {
    return next(error);
  }
};

const overview = async (req, res, next) => {
  try {
    return res.json({ success: true, data: await adminOverview(req.query) });
  } catch (error) {
    return next(error);
  }
};

const top = async (_req, res, next) => {
  try {
    return res.json({ success: true, data: await topReferrers() });
  } catch (error) {
    return next(error);
  }
};

const detail = async (req, res, next) => {
  try {
    const data = await referralDetail(req.params.id);
    if (!data) return res.status(404).json({ success: false, code: "NOT_FOUND" });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const listSimple = (sql) => async (req, res, next) => {
  try {
    const { rows } = await pool.query(sql);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
};

const review = async (req, res, next) => {
  try {
    await reviewWithdrawal({
      withdrawalId: req.params.id,
      adminId: req.user.id,
      action: req.body?.action,
      payoutReference: req.body?.payoutReference,
      note: req.body?.note,
    });
    return res.json({ success: true });
  } catch (error) {
    return sendError(next, error);
  }
};

const createBonus = async (req, res, next) => {
  try {
    const amount = amountMajorToStripeMinor(req.body?.bonusAmountJod, "JOD");
    const threshold = Math.trunc(Number(req.body?.thresholdPaidReferrals));
    if (!amount || !threshold || threshold < 1) {
      return res.status(400).json({ success: false, code: "INVALID_BONUS_RULE" });
    }
    const { rows } = await pool.query(
      `INSERT INTO referral_bonus_rules (threshold_paid_referrals, bonus_amount_minor, enabled, created_by_admin_id)
       VALUES ($1,$2,TRUE,$3) RETURNING *`,
      [threshold, amount, req.user.id],
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ success: false, code: "BONUS_THRESHOLD_EXISTS" });
    return next(error);
  }
};

const regenerate = async (req, res, next) => {
  try {
    const row = await regenerateReferralCode(req.params.userId, req.user.id);
    if (!row) return res.status(404).json({ success: false, code: "NOT_FOUND" });
    return res.json({ success: true, data: { code: row.code } });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  capture,
  me,
  withdraw,
  settings,
  saveSettings,
  history,
  overview,
  top,
  detail,
  listReferrals: listSimple(
    `SELECT r.id, r.registered_at, r.attribution_source, r.policy_version_id,
            ru.first_name AS referrer_first_name, ru.family_name AS referrer_family_name,
            du.first_name AS referred_first_name, du.family_name AS referred_family_name
       FROM user_referrals r
       JOIN users ru ON ru.id = r.referrer_user_id
       JOIN users du ON du.id = r.referred_user_id
      ORDER BY r.registered_at DESC
      LIMIT 200`,
  ),
  listCommissions: listSimple(
    `SELECT id, created_at, payment_source_type, payment_base_minor, commission_minor, status, policy_version_id, calculation_mode, percentage_bps, fixed_amount_minor
       FROM referral_commissions ORDER BY created_at DESC LIMIT 200`,
  ),
  listWithdrawals: listSimple(
    `SELECT id, user_id, amount_minor, status, payout_reference, admin_note, created_at, paid_at
       FROM referral_withdrawal_requests ORDER BY created_at DESC LIMIT 200`,
  ),
  listRewards: listSimple(
    `SELECT id, threshold_paid_referrals, bonus_amount_minor, enabled, effective_from, created_at
       FROM referral_bonus_rules ORDER BY threshold_paid_referrals`,
  ),
  review,
  createBonus,
  regenerate,
};
