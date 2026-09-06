const financialClaimsService = require("../services/financialClaimsService");
const freelancerCashWalletService = require("../services/freelancerCashWalletService");
const { capture } = require("../config/posthog");

const listMyFinancialClaims = async (req, res, next) => {
  try {
    const claims = await financialClaimsService.listClaimsForFreelancer({
      freelancerUserId: req.auth.userId,
      status: req.query.status || null,
    });
    return res.status(200).json({ success: true, data: { claims } });
  } catch (err) {
    return next(err);
  }
};

const listMyDoneProjects = async (req, res, next) => {
  try {
    const projects = await financialClaimsService.listDoneProjectsForFreelancer({
      freelancerUserId: req.auth.userId,
      q: req.query.q || "",
      limit: req.query.limit || 50,
    });
    return res.status(200).json({ success: true, data: { projects } });
  } catch (err) {
    return next(err);
  }
};

const createMyFinancialClaim = async (req, res, next) => {
  try {
    const claim = await financialClaimsService.createFinancialClaimForFreelancer({
      freelancerUserId: req.auth.userId,
      payload: req.body,
    });
    capture(String(req.auth.userId), "financial_claim_submitted", {
      claimId: String(claim.id),
      orderId: req.body.orderId ? String(req.body.orderId) : undefined,
    });
    return res.status(201).json({ success: true, data: { claim } });
  } catch (err) {
    return next(err);
  }
};

/** White-label managed-order cash balance + ledger (no FAZAT branding). */
const getMyCashWallet = async (req, res, next) => {
  try {
    const wallet = await freelancerCashWalletService.getWalletSnapshot(req.auth.userId);
    const entries = await freelancerCashWalletService.listLedgerForFreelancer(req.auth.userId, {
      limit: req.query.limit || 50,
    });
    return res.status(200).json({
      success: true,
      data: {
        availableMinor: wallet.availableMinor,
        currency: wallet.currency || "JOD",
        entries,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listMyFinancialClaims,
  listMyDoneProjects,
  createMyFinancialClaim,
  getMyCashWallet,
};
