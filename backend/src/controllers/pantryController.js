const pantryService = require("../services/pantryService");
const { actorId, requireActorId } = require("../constants/pantry");
const { pantryIntegrationApiFields } = require("../constants/pantryMembershipBid");

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
  const [requests, stats, integration] = await Promise.all([
    pantryService.listAdminRequests({ status: req.query.status || undefined }),
    pantryService.getStats(),
    pantryService.getPantryMembershipBidIntegrationState(),
  ]);
  return res.json({
    success: true,
    data: {
      requests,
      stats,
      ...pantryIntegrationApiFields(integration),
    },
  });
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
  const integration = await pantryService.getPantryMembershipBidIntegrationState();
  let fairRanking = null;
  try {
    const fairAdapter = require("../services/pantryFairDistributionAdapterService");
    fairRanking = await fairAdapter.getPantryFairRanking(req.params.id);
  } catch (err) {
    if (err?.statusCode === 404) throw err;
    fairRanking = null;
  }
  return res.json({
    success: true,
    data: { ...data, fairRanking, ...pantryIntegrationApiFields(integration) },
  });
});

const patchRequest = asyncHandler(async (req, res) => {
  const request = await pantryService.updateRequest(req.params.id, req.body || {});
  return res.json({ success: true, data: { request } });
});

const publishRequest = asyncHandler(async (req, res) => {
  const request = await pantryService.publishRequest(req.params.id);
  return res.json({ success: true, data: { request }, message: "تم نشر الطلب للعروض." });
});

const relistBidCollection = asyncHandler(async (req, res) => {
  const data = await pantryService.relistBidCollection(req.params.id);
  return res.json({
    success: true,
    data,
    message: "تم فتح جولة مناقصات جديدة لطلب بيت المونة.",
  });
});

const listBids = asyncHandler(async (req, res) => {
  const bids = await pantryService.listBidsForRequest(req.params.id);
  const fairAdapter = require("../services/pantryFairDistributionAdapterService");
  const fairRanking = await fairAdapter.getPantryFairRanking(req.params.id);
  return res.json({ success: true, data: { bids, fairRanking } });
});

const getFairRanking = asyncHandler(async (req, res) => {
  const fairAdapter = require("../services/pantryFairDistributionAdapterService");
  const fairRanking = await fairAdapter.getPantryFairRanking(req.params.id);
  return res.status(200).json({ success: true, data: { fairRanking } });
});

const acceptBid = asyncHandler(async (req, res) => {
  const request = await pantryService.acceptBid(req.params.id, req.params.bidId, requireActorId(req), {
    overrideReason: req.body?.overrideReason ?? req.body?.override_reason,
  });
  return res.json({
    success: true,
    data: { request, overrideRecorded: Boolean(request.overrideRecorded) },
    message: "تم قبول العرض.",
  });
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
  const listed = await pantryService.listOpenRequestsForFreelancer(requireActorId(req));
  return res.json({
    success: true,
    data: {
      requests: listed.requests,
      pantryMembershipBidIntegrationActive: Boolean(listed.pantryMembershipBidIntegrationActive),
      pantryMembershipBidIntegrationMode: listed.pantryMembershipBidIntegrationMode || "legacy",
    },
  });
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
  const [requests, integration] = await Promise.all([
    pantryService.listMyWork(requireActorId(req)),
    pantryService.getPantryMembershipBidIntegrationState(),
  ]);
  return res.json({
    success: true,
    data: {
      requests,
      ...pantryIntegrationApiFields(integration),
    },
  });
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
  relistBidCollection,
  listBids,
  getFairRanking,
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
