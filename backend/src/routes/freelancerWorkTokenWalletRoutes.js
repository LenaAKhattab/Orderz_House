const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const marketplaceWorkTokenWalletController = require("../controllers/marketplaceWorkTokenWalletController");

const router = express.Router();

router.use(requireAuth, requireRole("freelancer"));

/**
 * GET /api/freelancer/work-token-wallet
 * Read-only snapshot. Does not create a wallet row when absent.
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
