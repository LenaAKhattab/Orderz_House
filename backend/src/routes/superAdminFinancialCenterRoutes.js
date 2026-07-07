const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const controller = require("../controllers/superAdminFinancialCenterController");
const validators = require("../validators/financialCenterValidators");

const router = express.Router();

const guard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.FINANCIAL_CENTER),
];

router.get("/summary", ...guard, validators.listQueryValidators, validateRequest, controller.getSummary);

router.get("/departments", ...guard, validators.listQueryValidators, validateRequest, controller.listDepartments);
router.post("/departments", ...guard, validators.createDepartmentValidators, validateRequest, controller.createDepartment);

router.get("/people", ...guard, validators.listQueryValidators, validateRequest, controller.listPeople);
router.post("/people", ...guard, validators.createPersonValidators, validateRequest, controller.createPerson);
router.get("/people/:id", ...guard, validators.idParam, validateRequest, controller.getPerson);
router.patch("/people/:id", ...guard, validators.updatePersonValidators, validateRequest, controller.updatePerson);
router.post("/people/:id/deactivate", ...guard, validators.idParam, validateRequest, controller.deactivatePerson);
router.post(
  "/people/:id/create-account",
  ...guard,
  validators.createAccountValidators,
  validateRequest,
  controller.createPersonAccount,
);
router.post("/people/:id/suspend-account", ...guard, validators.idParam, validateRequest, controller.suspendPersonAccount);
router.post("/people/:id/activate-account", ...guard, validators.idParam, validateRequest, controller.activatePersonAccount);
router.get(
  "/people/:id/bonus-details",
  ...guard,
  validators.idParam,
  validators.listQueryValidators,
  validateRequest,
  controller.getPersonBonusDetails,
);

router.get("/bonus-rows", ...guard, validators.listQueryValidators, validateRequest, controller.listBonusRows);
router.post("/bonus-rows", ...guard, validators.createBonusRowValidators, validateRequest, controller.createBonusRow);
router.get("/bonus-rows/:id", ...guard, validators.idParam, validateRequest, controller.getBonusRow);
router.patch("/bonus-rows/:id", ...guard, validators.updateBonusRowValidators, validateRequest, controller.updateBonusRow);
router.post("/bonus-rows/:id/approve", ...guard, validators.idParam, validateRequest, controller.approveBonusRow);
router.post("/bonus-rows/:id/mark-received", ...guard, validators.markReceivedValidators, validateRequest, controller.markBonusRowReceived);
router.post("/bonus-rows/:id/mark-paid", ...guard, validators.idParam, validateRequest, controller.markBonusRowPaid);
router.post("/bonus-rows/:id/cancel", ...guard, validators.idParam, validateRequest, controller.cancelBonusRow);

router.patch(
  "/allocations/:allocationId",
  ...guard,
  validators.allocationIdParam,
  validateRequest,
  controller.updateAllocation,
);
router.post(
  "/allocations/:allocationId/mark-paid",
  ...guard,
  validators.allocationIdParam,
  validateRequest,
  controller.markAllocationPaid,
);
router.post(
  "/allocations/:allocationId/mark-unpaid",
  ...guard,
  validators.allocationIdParam,
  validateRequest,
  controller.markAllocationUnpaid,
);
router.post(
  "/allocations/:allocationId/mark-held",
  ...guard,
  validators.allocationIdParam,
  validateRequest,
  controller.markAllocationHeld,
);

router.get(
  "/source-payments/subscriptions",
  ...guard,
  validators.listQueryValidators,
  validateRequest,
  controller.listSubscriptionSourcePayments,
);
router.get(
  "/source-payments/orders",
  ...guard,
  validators.listQueryValidators,
  validateRequest,
  controller.listOrderSourcePayments,
);

module.exports = router;
