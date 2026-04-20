const express = require("express");
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { registerValidators, loginValidators } = require("../validators/authValidators");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.post("/register", registerValidators, validateRequest, authController.register);
router.post("/login", loginValidators, validateRequest, authController.login);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);

/** Enforce role boundaries on the server (JWT + explicit role lists). */
router.get("/scope/super-admin", authenticate, authorizeRoles(ROLES.SUPER_ADMIN), authController.respondScope("super_admin"));
router.get(
  "/scope/admin",
  authenticate,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  authController.respondScope("admin"),
);
router.get(
  "/scope/freelancer",
  authenticate,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FREELANCER),
  authController.respondScope("freelancer"),
);
router.get(
  "/scope/client",
  authenticate,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CLIENT),
  authController.respondScope("client"),
);

module.exports = router;
