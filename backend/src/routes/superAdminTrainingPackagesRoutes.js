const express = require("express");
const trainingPackagesController = require("../controllers/trainingPackagesController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const {
  createTrainingPackageValidators,
  updateTrainingPackageValidators,
  reorderTrainingPackagesValidators,
} = require("../validators/trainingPackagesValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get("/training-packages", ...guard, trainingPackagesController.listAdmin);

router.post(
  "/training-packages",
  ...guard,
  createTrainingPackageValidators,
  validateRequest,
  trainingPackagesController.create,
);

router.patch(
  "/training-packages/reorder",
  ...guard,
  reorderTrainingPackagesValidators,
  validateRequest,
  trainingPackagesController.reorder,
);

router.patch(
  "/training-packages/:code",
  ...guard,
  updateTrainingPackageValidators,
  validateRequest,
  trainingPackagesController.update,
);

module.exports = router;
