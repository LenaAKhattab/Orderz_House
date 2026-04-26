const fs = require("node:fs");
const ordersService = require("../services/ordersService");

function parsePreferredSkills(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

const listMyClientOrders = async (req, res, next) => {
  try {
    const orders = await ordersService.listClientOrders({
      clientUserId: req.auth.userId,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { orders } });
  } catch (err) {
    return next(err);
  }
};

const createClientOrder = async (req, res, next) => {
  try {
    const type = String(req.body.projectType || "").trim();
    const currencyCode = String(req.body.currencyCode || "").trim().toUpperCase();
    const payload = {
      title: req.body.title,
      description: req.body.description,
      categoryId: req.body.categoryId,
      subcategoryId: req.body.subcategoryId || null,
      subSubcategoryId: req.body.subSubcategoryId || null,
      projectType: type,
      currencyCode,
      budget: type === "fixed" ? req.body.budget : null,
      bidBudgetMin: type === "bidding" ? req.body.bidBudgetMin : null,
      bidBudgetMax: type === "bidding" ? req.body.bidBudgetMax : null,
      durationValue: req.body.durationValue,
      durationUnit: req.body.durationUnit,
      preferredSkills: parsePreferredSkills(req.body.preferredSkills),
    };

    const order = await ordersService.createClientOrder({
      clientUserId: req.auth.userId,
      payload,
      uploadedFiles: req.files || [],
    });
    return res.status(201).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const listClaimsForOrder = async (req, res, next) => {
  try {
    const out = await ordersService.listOrderClaimsForClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const approveFreelancerClaim = async (req, res, next) => {
  try {
    const order = await ordersService.approvePoolClaimClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      claimId: req.body.claimId,
    });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const rejectFreelancerClaim = async (req, res, next) => {
  try {
    const out = await ordersService.rejectPoolClaimClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      claimId: req.body.claimId,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const listBidsForOrder = async (req, res, next) => {
  try {
    const out = await ordersService.listOrderBidsForClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const acceptFreelancerBid = async (req, res, next) => {
  try {
    const order = await ordersService.acceptFreelancerBidClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      bidId: req.body.bidId,
    });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const rejectFreelancerBid = async (req, res, next) => {
  try {
    const out = await ordersService.rejectFreelancerBidClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      bidId: req.body.bidId,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const approveDelivery = async (req, res, next) => {
  try {
    const order = await ordersService.clientApproveDelivery({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const requestDeliveryRevision = async (req, res, next) => {
  try {
    const order = await ordersService.clientRequestDeliveryRevision({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      note: req.body.note,
    });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const downloadOrderFile = async (req, res, next) => {
  try {
    const { absPath, downloadName, mimeType } = await ordersService.prepareClientOrderFileDownload({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      fileId: req.params.fileId,
    });
    const utf8Name = String(downloadName || "file");
    const encoded = encodeURIComponent(utf8Name);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encoded}`);
    const stream = fs.createReadStream(absPath);
    stream.on("error", (e) => {
      if (!res.headersSent) return next(e);
    });
    return stream.pipe(res);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listMyClientOrders,
  createClientOrder,
  listClaimsForOrder,
  approveFreelancerClaim,
  rejectFreelancerClaim,
  listBidsForOrder,
  acceptFreelancerBid,
  rejectFreelancerBid,
  approveDelivery,
  requestDeliveryRevision,
  downloadOrderFile,
};
