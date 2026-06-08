const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const superAdminAdminsController = require("../controllers/superAdminAdminsController");
const {
  adminIdParam,
  createAdminValidators,
  updateAdminValidators,
} = require("../validators/superAdminAdminsValidators");

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/admin-permissions", superAdminAdminsController.listAdminPermissions);
router.get("/admins", superAdminAdminsController.listAdmins);
router.post("/admins", createAdminValidators, validateRequest, superAdminAdminsController.createAdmin);
router.patch("/admins/:id", updateAdminValidators, validateRequest, superAdminAdminsController.updateAdmin);

module.exports = router;
