const express = require("express");
const publicPlansContentController = require("../controllers/publicPlansContentController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const { updatePublicPlansContentValidators } = require("../validators/publicPlansContentValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get("/public-plans-content", ...guard, publicPlansContentController.getAdmin);

router.patch(
  "/public-plans-content",
  ...guard,
  updatePublicPlansContentValidators,
  validateRequest,
  publicPlansContentController.updateAdmin,
);

module.exports = router;
