const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const marketplaceWorkTokenWalletController = require("../controllers/marketplaceWorkTokenWalletController");

const router = express.Router();

const guard = [requireAuth, requireSuperAdmin];

/**
 * Super Admin read-only Work Token wallet inspection.
 * No balance mutation endpoints in Phase 4.
 */
router.get(
  "/work-token-wallets",
  ...guard,
  marketplaceWorkTokenWalletController.listAdminWorkTokenWallets,
);

router.get(
  "/work-token-wallets/:id",
  ...guard,
  marketplaceWorkTokenWalletController.getAdminWorkTokenWallet,
);

module.exports = router;
