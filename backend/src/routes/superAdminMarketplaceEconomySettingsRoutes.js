const express = require("express");
const marketplaceEconomySettingsController = require("../controllers/marketplaceEconomySettingsController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const {
  updateMarketplaceEconomySettingsValidators,
} = require("../validators/marketplaceEconomySettingsValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get(
  "/marketplace-economy-settings",
  ...guard,
  marketplaceEconomySettingsController.getSettings,
);

router.put(
  "/marketplace-economy-settings",
  ...guard,
  updateMarketplaceEconomySettingsValidators,
  validateRequest,
  marketplaceEconomySettingsController.updateSettings,
);

module.exports = router;
