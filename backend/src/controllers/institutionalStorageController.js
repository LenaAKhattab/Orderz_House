const institutionsService = require("../services/institutionsService");
const storageService = require("../services/institutionalStorageService");
const storedOrdersService = require("../services/institutionalStoredOrdersService");
const adminUsersService = require("../services/adminUsersService");
const scheduleService = require("../services/institutionalScheduleService");

function actorId(req) {
  return Number(req.auth?.userId);
}

const listInstitutions = async (req, res, next) => {
  try {
    const data = await institutionsService.listInstitutions({
      q: req.query.q,
      status: req.query.status || null,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const createInstitution = async (req, res, next) => {
  try {
    const institution = await institutionsService.createInstitution({
      actorUserId: actorId(req),
      name: req.body.name,
      description: req.body.description,
      slug: req.body.slug,
      status: req.body.status,
    });
    return res.status(201).json({ success: true, data: { institution } });
  } catch (e) {
    return next(e);
  }
};

const getInstitution = async (req, res, next) => {
  try {
    const bundle = String(req.query.bundle || "") === "1";
    if (bundle) {
      const data = await institutionsService.getInstitutionDetailBundle(req.params.id, {
        membersPage: req.query.membersPage,
        membersLimit: req.query.membersLimit || 20,
        storagesPage: req.query.storagesPage,
        storagesLimit: req.query.storagesLimit || 20,
      });
      if (!data) {
        const err = new Error("المؤسسة غير موجودة.");
        err.statusCode = 404;
        throw err;
      }
      return res.json({ success: true, data });
    }
    const institution = await institutionsService.getInstitutionById(req.params.id);
    if (!institution) {
      const err = new Error("المؤسسة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    return res.json({ success: true, data: { institution } });
  } catch (e) {
    return next(e);
  }
};

const patchInstitution = async (req, res, next) => {
  try {
    const result = await institutionsService.updateInstitution({
      id: req.params.id,
      patch: req.body || {},
      actorUserId: actorId(req),
    });
    return res.json({
      success: true,
      data: {
        institution: result.institution,
        deactivationImpact: result.deactivationImpact || null,
      },
    });
  } catch (e) {
    return next(e);
  }
};

const getInstitutionStatistics = async (req, res, next) => {
  try {
    const institution = await institutionsService.getInstitutionById(req.params.id);
    if (!institution) {
      const err = new Error("المؤسسة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const statistics = await institutionsService.getInstitutionStatistics(req.params.id);
    return res.json({ success: true, data: { statistics } });
  } catch (e) {
    return next(e);
  }
};

const freezeInstitution = async (req, res, next) => {
  try {
    const data = await institutionsService.freezeInstitution({
      id: req.params.id,
      actorUserId: actorId(req),
      reason: req.body?.reason || null,
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const unfreezeInstitution = async (req, res, next) => {
  try {
    const data = await institutionsService.unfreezeInstitution({
      id: req.params.id,
      actorUserId: actorId(req),
      reason: req.body?.reason || null,
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const getInstitutionDeactivationImpact = async (req, res, next) => {
  try {
    const institution = await institutionsService.getInstitutionById(req.params.id);
    if (!institution) {
      const err = new Error("المؤسسة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    const impact = await institutionsService.getDeactivationImpact(req.params.id);
    return res.json({ success: true, data: { impact, institution } });
  } catch (e) {
    return next(e);
  }
};

const listInstitutionStorages = async (req, res, next) => {
  try {
    const data = await institutionsService.listStoragesForInstitution(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const listMembers = async (req, res, next) => {
  try {
    const data = await institutionsService.listMembers(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const addMember = async (req, res, next) => {
  try {
    const result = await institutionsService.addMember({
      institutionId: req.params.id,
      userId: req.body.userId,
      memberRole: req.body.memberRole,
      actorUserId: actorId(req),
    });
    return res.status(201).json({
      success: true,
      data: { member: result.member, reactivated: Boolean(result.reactivated) },
    });
  } catch (e) {
    return next(e);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const result = await institutionsService.removeMember({
      institutionId: req.params.id,
      userId: req.params.userId,
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return next(e);
  }
};

const listStorages = async (req, res, next) => {
  try {
    const data = await storageService.listStorages({
      q: req.query.q,
      status: req.query.status || null,
      institutionId: req.query.institutionId || null,
      startDateFrom: req.query.startDateFrom || null,
      startDateTo: req.query.startDateTo || null,
      sort: req.query.sort || "created_at_desc",
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const createStorage = async (req, res, next) => {
  try {
    const storage = await storageService.createStorage({
      actorUserId: actorId(req),
      payload: req.body || {},
    });
    return res.status(201).json({ success: true, data: { storage } });
  } catch (e) {
    return next(e);
  }
};

const getStorage = async (req, res, next) => {
  try {
    const storage = await storageService.getStorageMetrics(req.params.storageId);
    return res.json({ success: true, data: { storage } });
  } catch (e) {
    return next(e);
  }
};

const patchStorage = async (req, res, next) => {
  try {
    const storage = await storageService.updateStorage({
      actorUserId: actorId(req),
      storageId: req.params.storageId,
      patch: req.body || {},
    });
    return res.json({ success: true, data: { storage } });
  } catch (e) {
    return next(e);
  }
};

const listOrders = async (req, res, next) => {
  try {
    const data = await storedOrdersService.listStoredOrders({
      storageId: req.params.storageId,
      lifecycleStatus: req.query.status || null,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const order = await storedOrdersService.createStoredOrder({
      actorUserId: actorId(req),
      storageId: req.params.storageId,
      body: req.body || {},
      uploadedFiles: req.files || [],
    });
    return res.status(201).json({ success: true, data: { order } });
  } catch (e) {
    return next(e);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await storedOrdersService.getStoredOrder(req.params.orderId);
    return res.json({ success: true, data: { order } });
  } catch (e) {
    return next(e);
  }
};

const submitOrder = async (req, res, next) => {
  try {
    const order = await storedOrdersService.submitForApproval({
      actorUserId: actorId(req),
      storedOrderId: req.params.orderId,
    });
    return res.json({ success: true, data: { order } });
  } catch (e) {
    return next(e);
  }
};

const approveOrder = async (req, res, next) => {
  try {
    const order = await storedOrdersService.approveStoredOrder({
      actorUserId: actorId(req),
      storedOrderId: req.params.orderId,
      reason: req.body?.reason,
    });
    return res.json({ success: true, data: { order } });
  } catch (e) {
    return next(e);
  }
};

const transferOrder = async (req, res, next) => {
  try {
    const order = await storedOrdersService.transferToTraining({
      actorUserId: actorId(req),
      storedOrderId: req.params.orderId,
      reason: req.body?.reason,
    });
    return res.json({ success: true, data: { order } });
  } catch (e) {
    return next(e);
  }
};

const archiveOrder = async (req, res, next) => {
  try {
    const order = await storedOrdersService.archiveStoredOrder({
      actorUserId: actorId(req),
      storedOrderId: req.params.orderId,
      reason: req.body?.reason,
    });
    return res.json({ success: true, data: { order } });
  } catch (e) {
    return next(e);
  }
};

const deleteOrder = async (req, res, next) => {
  try {
    const result = await storedOrdersService.deleteStoredOrder({
      actorUserId: actorId(req),
      storedOrderId: req.params.orderId,
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return next(e);
  }
};

const listPending = async (req, res, next) => {
  try {
    const data = await storedOrdersService.listPendingApprovals({
      page: req.query.page,
      limit: req.query.limit,
      storageId: req.query.storageId || null,
      institutionId: req.query.institutionId || null,
      q: req.query.q || "",
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const generateSchedule = async (req, res, next) => {
  try {
    const schedule = await storedOrdersService.generateSchedule({
      actorUserId: actorId(req),
      storageId: req.params.storageId,
      regenerate: Boolean(req.body?.regenerate),
    });
    return res.json({ success: true, data: { schedule } });
  } catch (e) {
    return next(e);
  }
};

const getSchedule = async (req, res, next) => {
  try {
    const schedule = await storedOrdersService.getSchedule(req.params.storageId);
    return res.json({ success: true, data: { schedule } });
  } catch (e) {
    return next(e);
  }
};

const retryBatch = async (req, res, next) => {
  try {
    const result = await storedOrdersService.retryBatch({
      actorUserId: actorId(req),
      batchId: req.params.batchId,
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return next(e);
  }
};

const runReleaseTick = async (req, res, next) => {
  try {
    const result = await storedOrdersService.processDueReleaseBatches({
      limit: req.body?.limit || 10,
      actorUserId: actorId(req),
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return next(e);
  }
};

const listInstitutionPool = async (req, res, next) => {
  try {
    const data = await storedOrdersService.listInstitutionalPoolForUser({
      userId: actorId(req),
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q || req.query.search || "",
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
};

const searchUsersForMembership = async (req, res, next) => {
  try {
    const users = await adminUsersService.searchUsers({
      search: req.query.q || req.query.search,
      limit: req.query.limit,
      role: req.query.role || null,
    });
    return res.json({ success: true, data: { users } });
  } catch (e) {
    return next(e);
  }
};

const transitionStorageStatus = async (req, res, next) => {
  try {
    const storage = await scheduleService.transitionStorageStatus({
      actorUserId: actorId(req),
      storageId: req.params.storageId,
      status: req.body?.status,
      allowPastBatches: Boolean(req.body?.allowPastBatches),
      confirmPastBatches: Boolean(req.body?.confirmPastBatches),
    });
    return res.json({ success: true, data: { storage } });
  } catch (e) {
    return next(e);
  }
};

const updateBatchReleaseAt = async (req, res, next) => {
  try {
    const batch = await scheduleService.updateBatchReleaseAt({
      actorUserId: actorId(req),
      batchId: req.params.batchId,
      scheduledReleaseAt: req.body?.scheduledReleaseAt,
    });
    return res.json({ success: true, data: { batch } });
  } catch (e) {
    return next(e);
  }
};

const cancelBatch = async (req, res, next) => {
  try {
    const result = await scheduleService.cancelBatch({
      actorUserId: actorId(req),
      batchId: req.params.batchId,
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return next(e);
  }
};

const listBatchOrders = async (req, res, next) => {
  try {
    const orders = await scheduleService.listBatchOrders(req.params.batchId);
    return res.json({ success: true, data: { orders } });
  } catch (e) {
    return next(e);
  }
};

const removeOrderFromBatch = async (req, res, next) => {
  try {
    const result = await scheduleService.removeOrderFromBatch({
      actorUserId: actorId(req),
      batchId: req.params.batchId,
      storedOrderId: req.params.orderId,
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return next(e);
  }
};

const moveOrderToBatch = async (req, res, next) => {
  try {
    const result = await scheduleService.moveOrderToBatch({
      actorUserId: actorId(req),
      storedOrderId: req.params.orderId,
      targetBatchId: req.body?.targetBatchId,
    });
    return res.json({ success: true, data: result });
  } catch (e) {
    return next(e);
  }
};

const listReleaseLogs = async (req, res, next) => {
  try {
    const logs = await scheduleService.listReleaseLogs({
      storageId: req.params.storageId,
      limit: req.query.limit,
    });
    return res.json({ success: true, data: { logs } });
  } catch (e) {
    return next(e);
  }
};

const getSchedulerHealth = async (req, res, next) => {
  try {
    const health = await scheduleService.getSchedulerHealth();
    return res.json({ success: true, data: { health } });
  } catch (e) {
    return next(e);
  }
};

const getMyInstitutionMembership = async (req, res, next) => {
  try {
    const ids = await institutionsService.listActiveInstitutionIdsForUser(actorId(req));
    return res.json({
      success: true,
      data: { institutionIds: ids.map(String), isMember: ids.length > 0 },
    });
  } catch (e) {
    return next(e);
  }
};

module.exports = {
  listInstitutions,
  createInstitution,
  getInstitution,
  patchInstitution,
  getInstitutionStatistics,
  freezeInstitution,
  unfreezeInstitution,
  getInstitutionDeactivationImpact,
  listInstitutionStorages,
  listMembers,
  addMember,
  removeMember,
  searchUsersForMembership,
  listStorages,
  createStorage,
  getStorage,
  patchStorage,
  transitionStorageStatus,
  listOrders,
  createOrder,
  getOrder,
  submitOrder,
  approveOrder,
  transferOrder,
  archiveOrder,
  deleteOrder,
  listPending,
  generateSchedule,
  getSchedule,
  listBatchOrders,
  updateBatchReleaseAt,
  cancelBatch,
  removeOrderFromBatch,
  moveOrderToBatch,
  listReleaseLogs,
  retryBatch,
  runReleaseTick,
  getSchedulerHealth,
  listInstitutionPool,
  getMyInstitutionMembership,
};
