const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const controller = require("../controllers/superAdminFazatSettlementsController");

const router = express.Router();

const financeGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.FINANCIAL_CLAIMS),
];

const superAdminOnly = [requireAuth, requireAnyRole(["super_admin"])];

router.get("/fazat-settlements", ...financeGuard, controller.listSettlements);
router.get("/fazat-settlements/:id", ...financeGuard, controller.getSettlement);
router.post("/fazat-settlements/:id/approve", ...financeGuard, controller.approveSettlement);
router.post("/fazat-settlements/:id/reject", ...financeGuard, controller.rejectSettlement);
router.post("/fazat-settlements/:id/adjust", ...superAdminOnly, controller.adjustSettlement);
router.post(
  "/fazat-settlements/:id/adjust-and-approve",
  ...superAdminOnly,
  controller.adjustAndApproveSettlement,
);

module.exports = router;
