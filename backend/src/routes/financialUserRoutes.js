const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const controller = require("../controllers/financialUserController");
const validators = require("../validators/financialCenterValidators");

const router = express.Router();

const guard = [requireAuth, requireRole("financial_user")];

router.get("/summary", ...guard, validators.listQueryValidators, validateRequest, controller.getMySummary);
router.get("/my-bonuses", ...guard, validators.listQueryValidators, validateRequest, controller.listMyBonuses);

module.exports = router;
