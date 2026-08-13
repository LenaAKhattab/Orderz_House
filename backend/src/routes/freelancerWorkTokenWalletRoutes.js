const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const marketplaceWorkTokenWalletController = require("../controllers/marketplaceWorkTokenWalletController");

const router = express.Router();

router.use(requireAuth, requireRole("freelancer"));

/**
 * LEGACY_DEPRECATED_WORK_TOKEN_MODEL — Phase B7B read-only audit retention.
 * GET /api/freelancer/work-token-wallet
 * Read-only snapshot. Does not create a wallet row when absent. No mutations.
 */
router.get("/work-token-wallet", marketplaceWorkTokenWalletController.getMyWorkTokenWallet);

/**
 * GET /api/freelancer/work-token-wallet/transactions
 * Own-wallet ledger history only (paginated).
 */
router.get(
  "/work-token-wallet/transactions",
  marketplaceWorkTokenWalletController.getMyWorkTokenTransactions,
);

module.exports = router;
