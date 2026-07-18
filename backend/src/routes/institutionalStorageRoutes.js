const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const controller = require("../controllers/institutionalStorageController");
const { adminWriteLimiter, adminOrderCreateLimiter } = require("../middleware/orderWriteRateLimiters");
const uploadMw = require("../middleware/ordersUploadMiddleware");

const router = express.Router();

const staff = [requireAuth, requireAnyRole(["admin", "super_admin"])];
const superAdminOnly = [requireAuth, requireAnyRole(["super_admin"])];

const viewStorage = [...staff, requirePermission(PERMISSION_KEYS.INSTITUTIONAL_ORDER_STORAGE)];
const manageStorage = [...staff, requirePermission(PERMISSION_KEYS.INSTITUTIONAL_ORDER_STORAGE)];
const approvePerm = [...staff, requirePermission(PERMISSION_KEYS.INSTITUTIONAL_STORAGE_APPROVE)];
const transferPerm = [...staff, requirePermission(PERMISSION_KEYS.INSTITUTIONAL_STORAGE_TRANSFER)];
const institutionsPerm = [...staff, requirePermission(PERMISSION_KEYS.INSTITUTIONS)];

// Institutions catalog
router.get("/institutions", ...institutionsPerm, controller.listInstitutions);
router.post("/institutions", ...institutionsPerm, adminWriteLimiter, controller.createInstitution);
router.get("/institutions/users/search", ...institutionsPerm, controller.searchUsersForMembership);
router.get("/institutions/:id", ...institutionsPerm, controller.getInstitution);
router.patch("/institutions/:id", ...institutionsPerm, adminWriteLimiter, controller.patchInstitution);
router.get("/institutions/:id/statistics", ...institutionsPerm, controller.getInstitutionStatistics);
router.post(
  "/institutions/:id/freeze",
  ...superAdminOnly,
  requirePermission(PERMISSION_KEYS.INSTITUTIONS),
  adminWriteLimiter,
  controller.freezeInstitution,
);
router.post(
  "/institutions/:id/unfreeze",
  ...superAdminOnly,
  requirePermission(PERMISSION_KEYS.INSTITUTIONS),
  adminWriteLimiter,
  controller.unfreezeInstitution,
);
router.get(
  "/institutions/:id/deactivation-impact",
  ...institutionsPerm,
  controller.getInstitutionDeactivationImpact,
);
router.get("/institutions/:id/storages", ...institutionsPerm, controller.listInstitutionStorages);
router.get("/institutions/:id/members", ...institutionsPerm, controller.listMembers);
router.post("/institutions/:id/members", ...institutionsPerm, adminWriteLimiter, controller.addMember);
router.delete("/institutions/:id/members/:userId", ...institutionsPerm, adminWriteLimiter, controller.removeMember);

// Institutional order storage — static paths before :storageId
router.get("/institutional-order-storage", ...viewStorage, controller.listStorages);
router.post("/institutional-order-storage", ...manageStorage, adminWriteLimiter, controller.createStorage);
router.get("/institutional-order-storage/pending-approvals", ...approvePerm, controller.listPending);
router.get("/institutional-order-storage/scheduler/health", ...viewStorage, controller.getSchedulerHealth);
router.post(
  "/institutional-order-storage/release-tick",
  ...staff,
  requirePermission(PERMISSION_KEYS.INSTITUTIONAL_STORAGE_RETRY_RELEASE),
  adminWriteLimiter,
  controller.runReleaseTick,
);

router.get("/institutional-order-storage/orders/:orderId", ...viewStorage, controller.getOrder);
router.post(
  "/institutional-order-storage/orders/:orderId/submit",
  ...manageStorage,
  adminWriteLimiter,
  controller.submitOrder,
);
router.post(
  "/institutional-order-storage/orders/:orderId/approve",
  ...approvePerm,
  adminWriteLimiter,
  controller.approveOrder,
);
router.post(
  "/institutional-order-storage/orders/:orderId/transfer-to-training",
  ...transferPerm,
  adminWriteLimiter,
  controller.transferOrder,
);
router.post(
  "/institutional-order-storage/orders/:orderId/archive",
  ...manageStorage,
  adminWriteLimiter,
  controller.archiveOrder,
);
router.delete(
  "/institutional-order-storage/orders/:orderId",
  ...manageStorage,
  adminWriteLimiter,
  controller.deleteOrder,
);
router.post(
  "/institutional-order-storage/orders/:orderId/move-to-batch",
  ...manageStorage,
  adminWriteLimiter,
  controller.moveOrderToBatch,
);

router.post(
  "/institutional-order-storage/batches/:batchId/retry",
  ...staff,
  requirePermission(PERMISSION_KEYS.INSTITUTIONAL_STORAGE_RETRY_RELEASE),
  adminWriteLimiter,
  controller.retryBatch,
);
router.get("/institutional-order-storage/batches/:batchId/orders", ...viewStorage, controller.listBatchOrders);
router.patch(
  "/institutional-order-storage/batches/:batchId",
  ...manageStorage,
  adminWriteLimiter,
  controller.updateBatchReleaseAt,
);
router.post(
  "/institutional-order-storage/batches/:batchId/cancel",
  ...manageStorage,
  adminWriteLimiter,
  controller.cancelBatch,
);
router.delete(
  "/institutional-order-storage/batches/:batchId/orders/:orderId",
  ...manageStorage,
  adminWriteLimiter,
  controller.removeOrderFromBatch,
);

router.get("/institutional-order-storage/:storageId", ...viewStorage, controller.getStorage);
router.patch("/institutional-order-storage/:storageId", ...manageStorage, adminWriteLimiter, controller.patchStorage);
router.post(
  "/institutional-order-storage/:storageId/status",
  ...manageStorage,
  adminWriteLimiter,
  controller.transitionStorageStatus,
);

router.get("/institutional-order-storage/:storageId/orders", ...viewStorage, controller.listOrders);
router.post(
  "/institutional-order-storage/:storageId/orders",
  ...manageStorage,
  adminOrderCreateLimiter,
  uploadMw.uploadOrderFiles,
  uploadMw.handleOrderUploadErrors,
  uploadMw.enforceOrderUploadTotalSize,
  controller.createOrder,
);

router.get("/institutional-order-storage/:storageId/schedule", ...viewStorage, controller.getSchedule);
router.post(
  "/institutional-order-storage/:storageId/schedule/generate",
  ...manageStorage,
  adminWriteLimiter,
  controller.generateSchedule,
);
router.get("/institutional-order-storage/:storageId/release-logs", ...viewStorage, controller.listReleaseLogs);

module.exports = router;
