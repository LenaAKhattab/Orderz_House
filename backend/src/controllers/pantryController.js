const pantryService = require("../services/pantryService");
const { actorId, requireActorId } = require("../constants/pantry");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function actorRole(req) {
  return (
    req.auth?.primaryRole ||
    req.auth?.legacyRole ||
    req.user?.role ||
    null
  );
}

const listAdminRequests = asyncHandler(async (req, res) => {
  const [requests, stats] = await Promise.all([
    pantryService.listAdminRequests({ status: req.query.status || undefined }),
    pantryService.getStats(),
  ]);
  return res.json({ success: true, data: { requests, stats } });
});

const createRequest = asyncHandler(async (req, res) => {
  const adminUserId = requireActorId(req);
  // eslint-disable-next-line no-console
  console.info("[pantry] createRequest", {
    actorIdPresent: true,
    actorId: adminUserId,
    role: actorRole(req),
  });
  const request = await pantryService.createRequest(adminUserId, req.body || {});
  return res.status(201).json({ success: true, data: { request } });
});

const getAdminRequest = asyncHandler(async (req, res) => {
  const data = await pantryService.getRequestById(req.params.id, {
    includeBids: true,
    includeDeliveries: true,
  });
  if (!data) {
    return res.status(404).json({ success: false, message: "طلب بيت المونة غير موجود.", code: "NOT_FOUND" });
  }
  return res.json({ success: true, data });
});

const patchRequest = asyncHandler(async (req, res) => {
  const request = await pantryService.updateRequest(req.params.id, req.body || {});
  return res.json({ success: true, data: { request } });
});

const publishRequest = asyncHandler(async (req, res) => {
  const request = await pantryService.publishRequest(req.params.id);
  return res.json({ success: true, data: { request }, message: "تم نشر الطلب للعروض." });
});

const listBids = asyncHandler(async (req, res) => {
  const bids = await pantryService.listBidsForRequest(req.params.id);
  return res.json({ success: true, data: { bids } });
});

const acceptBid = asyncHandler(async (req, res) => {
  const request = await pantryService.acceptBid(req.params.id, req.params.bidId, requireActorId(req));
  return res.json({ success: true, data: { request }, message: "تم قبول العرض." });
});

const rejectBid = asyncHandler(async (req, res) => {
  const bid = await pantryService.rejectBid(req.params.id, req.params.bidId);
  return res.json({ success: true, data: { bid }, message: "تم رفض العرض." });
});

const listDeliveries = asyncHandler(async (req, res) => {
  const deliveries = await pantryService.listDeliveries({ status: req.query.status || undefined });
  return res.json({ success: true, data: { deliveries } });
});

const approveDelivery = asyncHandler(async (req, res) => {
  const delivery = await pantryService.approveDelivery(req.params.deliveryId, requireActorId(req), {
    archive: Boolean(req.body?.archive),
  });
  return res.json({
    success: true,
    data: { delivery },
    message: req.body?.archive ? "تمت الأرشفة." : "تم الاعتماد — جاهز في بيت المونة.",
  });
});

const requestRevision = asyncHandler(async (req, res) => {
  const delivery = await pantryService.requestRevision(
    req.params.deliveryId,
    requireActorId(req),
    req.body?.feedback || req.body?.adminFeedback,
  );
  return res.json({ success: true, data: { delivery }, message: "تم طلب التعديل." });
});

const listOpenForFreelancer = asyncHandler(async (req, res) => {
  const requests = await pantryService.listOpenRequestsForFreelancer();
  return res.json({ success: true, data: { requests } });
});

const getFreelancerRequest = asyncHandler(async (req, res) => {
  const data = await pantryService.getFreelancerRequest(req.params.id, requireActorId(req));
  return res.json({ success: true, data });
});

const submitBid = asyncHandler(async (req, res) => {
  const bid = await pantryService.submitBid(req.params.id, requireActorId(req), req.body || {});
  return res.status(201).json({ success: true, data: { bid }, message: "تم تقديم العرض." });
});

const listMyWork = asyncHandler(async (req, res) => {
  const requests = await pantryService.listMyWork(requireActorId(req));
  return res.json({ success: true, data: { requests } });
});

const submitDelivery = asyncHandler(async (req, res) => {
  const delivery = await pantryService.submitDelivery(req.params.id, requireActorId(req), req.body || {});
  return res.status(201).json({ success: true, data: { delivery }, message: "تم تسليم العمل." });
});

module.exports = {
  listAdminRequests,
  createRequest,
  getAdminRequest,
  patchRequest,
  publishRequest,
  listBids,
  acceptBid,
  rejectBid,
  listDeliveries,
  approveDelivery,
  requestRevision,
  listOpenForFreelancer,
  getFreelancerRequest,
  submitBid,
  listMyWork,
  submitDelivery,
  actorId,
  requireActorId,
};
