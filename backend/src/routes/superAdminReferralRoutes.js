const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/referralController");

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

router.get("/overview", controller.overview);
router.get("/top", controller.top);
router.get("/relationships", controller.listReferrals);
router.get("/relationships/:id", controller.detail);
router.get("/commissions", controller.listCommissions);
router.get("/withdrawals", controller.listWithdrawals);
router.post("/withdrawals/:id/review", controller.review);
router.get("/rewards", controller.listRewards);
router.post("/rewards", controller.createBonus);
router.get("/settings", controller.settings);
router.post("/settings", controller.saveSettings);
router.get("/policy-history", controller.history);
router.post("/codes/:userId/regenerate", controller.regenerate);

module.exports = router;
