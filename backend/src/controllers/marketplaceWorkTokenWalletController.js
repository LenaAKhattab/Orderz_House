const marketplaceWorkTokenWalletService = require("../services/marketplaceWorkTokenWalletService");

async function getMyWorkTokenWallet(req, res, next) {
  try {
    const freelancerUserId = req.auth?.userId || req.user?.sub;
    const snapshot = await marketplaceWorkTokenWalletService.getWorkTokenWalletSnapshot(
      freelancerUserId,
    );
    let totalConsumedTokens = 0;
    if (snapshot.exists) {
      totalConsumedTokens = await marketplaceWorkTokenWalletService.getTotalConsumedTokens(
        freelancerUserId,
      );
    }
    return res.json({
      success: true,
      data: {
        availableTokens: snapshot.availableTokens,
        reservedTokens: snapshot.reservedTokens,
        totalConsumedTokens,
        engineAvailable: snapshot.engineAvailable,
        workTokensEnabled: snapshot.workTokensEnabled,
        exists: snapshot.exists,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getMyWorkTokenTransactions(req, res, next) {
  try {
    const freelancerUserId = req.auth?.userId || req.user?.sub;
    const limit = req.query.limit;
    const offset = req.query.offset;
    const rows = await marketplaceWorkTokenWalletService.listWorkTokenLedgerForFreelancer(
      freelancerUserId,
      { limit, offset },
    );
    const publicRows = rows.map((row) => ({
      id: row.id,
      type: row.eventType,
      amountTokens: row.amountTokens,
      direction: row.direction,
      balanceEffect: row.balanceEffect,
      referenceType: row.referenceType,
      createdAt: row.createdAt,
    }));
    return res.json({ success: true, data: publicRows });
  } catch (err) {
    return next(err);
  }
}

async function listAdminWorkTokenWallets(req, res, next) {
  try {
    const rows = await marketplaceWorkTokenWalletService.listWorkTokenWalletsForAdmin({
      freelancerUserId: req.query.freelancerUserId || null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
}

async function getAdminWorkTokenWallet(req, res, next) {
  try {
    const detail = await marketplaceWorkTokenWalletService.getWorkTokenWalletDetailForAdmin(
      req.params.id,
    );
    if (!detail) {
      return res.status(404).json({
        success: false,
        code: "WORK_TOKEN_WALLET_NOT_FOUND",
        message: "Work Token wallet not found.",
      });
    }
    return res.json({ success: true, data: detail });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyWorkTokenWallet,
  getMyWorkTokenTransactions,
  listAdminWorkTokenWallets,
  getAdminWorkTokenWallet,
};
