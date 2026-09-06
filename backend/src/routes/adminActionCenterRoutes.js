const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/rbacMiddleware");
const adminActionCenterController = require("../controllers/adminActionCenterController");

const router = express.Router();

const guard = [requireAuth, requireAdmin];

router.get("/action-center/summary", ...guard, adminActionCenterController.getSummary);

module.exports = router;
