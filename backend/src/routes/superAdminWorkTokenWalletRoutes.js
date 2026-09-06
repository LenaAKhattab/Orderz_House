const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const marketplaceWorkTokenWalletController = require("../controllers/marketplaceWorkTokenWalletController");

const router = express.Router();

const guard = [requireAuth, requireSuperAdmin];

/**
 * LEGACY_DEPRECATED_WORK_TOKEN_MODEL — Phase B7B Super Admin read-only audit.
 * No balance mutation endpoints.
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
