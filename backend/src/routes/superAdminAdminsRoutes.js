const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const superAdminAdminsController = require("../controllers/superAdminAdminsController");
const {
  adminIdParam,
  createAdminValidators,
  updateAdminValidators,
} = require("../validators/superAdminAdminsValidators");

const router = express.Router();

const adminsManageGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.ADMINS_MANAGE),
];

router.get("/admin-permissions", ...adminsManageGuard, superAdminAdminsController.listAdminPermissions);
router.get("/admins", ...adminsManageGuard, superAdminAdminsController.listAdmins);
router.post("/admins", ...adminsManageGuard, createAdminValidators, validateRequest, superAdminAdminsController.createAdmin);
router.patch("/admins/:id", ...adminsManageGuard, updateAdminValidators, validateRequest, superAdminAdminsController.updateAdmin);

module.exports = router;
