const { pool } = require("../config/db");
const { captureVisit, COOKIE_NAME } = require("../services/referralAttributionService");
const {
  getUserDashboard,
  adminOverview,
  topReferrers,
  referralDetail,
  listRelationships,
  listCommissions,
  listWithdrawals,
  listBonusRules,
} = require("../services/referralReadService");
const { requestWithdrawal, reviewWithdrawal, cancelOwnWithdrawal } = require("../services/referralWithdrawalService");
const {
  getCurrentPolicy,
  listPolicyHistory,
  createPolicyVersion,
  regenerateReferralCode,
} = require("../services/referralPolicyService");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");

// errorMiddleware reads `statusCode`; referral services set `status` + `publicCode`.
function sendError(next, error) {
  if (error.publicCode) {
    error.statusCode = error.statusCode || error.status || 400;
    error.exposeToClient = true;
  }
  return next(error);
}

function jodToMinor(value) {
  if (value == null || value === "") return null;
  return amountMajorToStripeMinor(value, "JOD");
}

function percentToBps(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function positiveId(value) {
  const n = Math.trunc(Number(value));
  return Number.isInteger(n) && n > 0 ? n : null;
}

const capture = async (req, res, next) => {
  try {
    const result = await captureVisit({
      code: req.body?.code || req.params?.code,
      cookieToken: req.cookies?.[COOKIE_NAME],
      utmSource: String(req.body?.utmSource || "").slice(0, 100) || null,
      utmMedium: String(req.body?.utmMedium || "").slice(0, 100) || null,
      utmCampaign: String(req.body?.utmCampaign || "").slice(0, 100) || null,
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
    const amount = jodToMinor(req.body?.amountJod);
    if (!amount) return res.status(400).json({ success: false, code: "INVALID_AMOUNT" });
    const row = await requestWithdrawal(req.user.id, amount);
    return res.status(201).json({ success: true, data: { id: Number(row.id), status: row.status, amountMinor: Number(row.amount_minor) } });
  } catch (error) {
    return sendError(next, error);
  }
};

const cancelWithdrawal = async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(404).json({ success: false, code: "NOT_FOUND" });
    await cancelOwnWithdrawal(req.user.id, id);
    return res.json({ success: true });
  } catch (error) {
    return sendError(next, error);
  }
};

const settings = async (_req, res, next) => {
  try {
    return res.json({ success: true, data: await getCurrentPolicy() });
  } catch (error) {
    return next(error);
  }
};

const saveSettings = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.confirm !== true) {
      return res.status(400).json({ success: false, code: "CONFIRMATION_REQUIRED" });
    }
    const created = await createPolicyVersion(
      {
        enabled: Boolean(body.enabled),
        calculationMode: body.calculationMode,
        percentageBps: percentToBps(body.percentage),
        fixedAmountMinor: jodToMinor(body.fixedAmountJod),
        commissionHoldDays: Number(body.commissionHoldDays),
        minimumWithdrawalMinor: jodToMinor(body.minimumWithdrawalJod) ?? 0,
        eligiblePaymentTypes: Array.isArray(body.eligiblePaymentTypes) ? body.eligiblePaymentTypes : [],
        discountEnabled: Boolean(body.discountEnabled),
        discountMode: body.discountMode,
        discountPercentageBps: percentToBps(body.discountPercentage),
        discountFixedMinor: jodToMinor(body.discountFixedJod),
        discountPaymentTypes: Array.isArray(body.discountPaymentTypes) ? body.discountPaymentTypes : [],
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

const top = async (req, res, next) => {
  try {
    return res.json({ success: true, data: await topReferrers(req.query) });
  } catch (error) {
    return next(error);
  }
};

const detail = async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    const data = id ? await referralDetail(id) : null;
    if (!data) return res.status(404).json({ success: false, code: "NOT_FOUND" });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const paged = (loader) => async (req, res, next) => {
  try {
    return res.json({ success: true, data: await loader(req.query) });
  } catch (error) {
    return next(error);
  }
};

const review = async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(404).json({ success: false, code: "NOT_FOUND" });
    if (!["approve", "reject", "paid"].includes(req.body?.action)) {
      return res.status(400).json({ success: false, code: "INVALID_ACTION" });
    }
    await reviewWithdrawal({
      withdrawalId: id,
      adminId: req.user.id,
      action: req.body.action,
      payoutReference: req.body?.payoutReference,
      note: req.body?.note,
    });
    return res.json({ success: true });
  } catch (error) {
    return sendError(next, error);
  }
};

async function auditRule(client, adminId, action, rule) {
  await client.query(
    `INSERT INTO referral_admin_audit (admin_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'referral_bonus_rule', $3, $4::jsonb)`,
    [adminId, action, String(rule.id), JSON.stringify(rule)],
  );
}

function parseEffectiveFrom(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const createBonus = async (req, res, next) => {
  try {
    const amount = jodToMinor(req.body?.bonusAmountJod);
    const threshold = Math.trunc(Number(req.body?.thresholdPaidReferrals));
    const effectiveFrom = parseEffectiveFrom(req.body?.effectiveFrom);
    const label = String(req.body?.label || "").trim().slice(0, 120) || null;
    if (!amount || !Number.isInteger(threshold) || threshold < 1 || effectiveFrom === undefined) {
      return res.status(400).json({ success: false, code: "INVALID_BONUS_RULE" });
    }
    const { rows } = await pool.query(
      `INSERT INTO referral_bonus_rules (threshold_paid_referrals, bonus_amount_minor, enabled, effective_from, label, created_by_admin_id)
       VALUES ($1,$2,$3,COALESCE($4::timestamptz, NOW()),$5,$6) RETURNING *`,
      [threshold, amount, req.body?.enabled !== false, effectiveFrom, label, req.user.id],
    );
    await auditRule(pool, req.user.id, "create_bonus_rule", rows[0]);
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ success: false, code: "BONUS_THRESHOLD_EXISTS" });
    return next(error);
  }
};

/**
 * Rules are never deleted. Once awarded, only `enabled` and `label` may change so the
 * historical award still matches its rule.
 */
const updateBonus = async (req, res, next) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(404).json({ success: false, code: "NOT_FOUND" });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      `SELECT r.*, (SELECT COUNT(*)::int FROM referral_bonus_awards a WHERE a.rule_id = r.id) AS awards
         FROM referral_bonus_rules r WHERE r.id = $1 FOR UPDATE`,
      [id],
    );
    const rule = rows[0];
    if (!rule) {
      await db.query("ROLLBACK");
      return res.status(404).json({ success: false, code: "NOT_FOUND" });
    }
    const body = req.body || {};
    const awarded = Number(rule.awards) > 0;
    const changesTerms =
      body.thresholdPaidReferrals != null || body.bonusAmountJod != null || body.effectiveFrom != null;
    if (awarded && changesTerms) {
      await db.query("ROLLBACK");
      return res.status(409).json({ success: false, code: "BONUS_RULE_ALREADY_AWARDED" });
    }
    const threshold = body.thresholdPaidReferrals != null ? Math.trunc(Number(body.thresholdPaidReferrals)) : Number(rule.threshold_paid_referrals);
    const amount = body.bonusAmountJod != null ? jodToMinor(body.bonusAmountJod) : Number(rule.bonus_amount_minor);
    const effectiveFrom = body.effectiveFrom != null ? parseEffectiveFrom(body.effectiveFrom) : rule.effective_from;
    if (!amount || !Number.isInteger(threshold) || threshold < 1 || effectiveFrom === undefined) {
      await db.query("ROLLBACK");
      return res.status(400).json({ success: false, code: "INVALID_BONUS_RULE" });
    }
    const enabled = body.enabled != null ? Boolean(body.enabled) : Boolean(rule.enabled);
    const label = body.label !== undefined ? String(body.label || "").trim().slice(0, 120) || null : rule.label;
    const updated = await db.query(
      `UPDATE referral_bonus_rules
          SET threshold_paid_referrals = $2, bonus_amount_minor = $3, effective_from = $4,
              enabled = $5, label = $6, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, threshold, amount, effectiveFrom, enabled, label],
    );
    await auditRule(db, req.user.id, "update_bonus_rule", { ...updated.rows[0], previous: rule });
    await db.query("COMMIT");
    return res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (error?.code === "23505") return res.status(409).json({ success: false, code: "BONUS_THRESHOLD_EXISTS" });
    return next(error);
  } finally {
    db.release();
  }
};

const rewards = async (_req, res, next) => {
  try {
    return res.json({ success: true, data: await listBonusRules() });
  } catch (error) {
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
  cancelWithdrawal,
  settings,
  saveSettings,
  history,
  overview,
  top,
  detail,
  listReferrals: paged(listRelationships),
  listCommissions: paged(listCommissions),
  listWithdrawals: paged(listWithdrawals),
  listRewards: rewards,
  review,
  createBonus,
  updateBonus,
  regenerate,
};
