/**
 * Smart Orders S1 — customer linkage endpoints (Admin panel + public claim preview + client claim).
 * Actor ids always come from req.auth, never from the request body.
 */
const orderCustomerService = require("../services/orderCustomerService");

function actor(req) {
  return {
    actorUserId: req.auth.userId,
    actorRole: req.auth?.primaryRole || req.auth?.legacyRole || req.user?.role || "admin",
  };
}

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const searchCustomers = wrap(async (req, res) => {
  const customers = await orderCustomerService.searchCustomerAccounts({ q: req.query.q });
  res.status(200).json({ success: true, data: { customers } });
});

const checkPhone = wrap(async (req, res) => {
  const result = await orderCustomerService.phoneMatchesExistingClient(req.body?.phone);
  res.status(200).json({ success: true, data: result });
});

const listAccountManagers = wrap(async (req, res) => {
  const managers = await orderCustomerService.listAccountManagers();
  res.status(200).json({ success: true, data: { managers, currentUserId: String(req.auth.userId) } });
});

const getSummary = wrap(async (req, res) => {
  const summary = await orderCustomerService.getCustomerModeSummary();
  res.status(200).json({ success: true, data: { summary } });
});

const getOrderCustomer = wrap(async (req, res) => {
  const customer = await orderCustomerService.getAdminOrderCustomer(req.params.id);
  res.status(200).json({ success: true, data: { customer } });
});

const revealContact = wrap(async (req, res) => {
  const result = await orderCustomerService.revealGuestContact({ orderId: req.params.id, ...actor(req) });
  res.set("Cache-Control", "no-store");
  res.status(200).json({ success: true, data: result });
});

const updateAccountManager = wrap(async (req, res) => {
  const customer = await orderCustomerService.setAccountManager({
    orderId: req.params.id,
    accountManagerAdminId: req.body?.accountManagerAdminId,
    ...actor(req),
  });
  res.status(200).json({ success: true, data: { customer } });
});

const updatePricing = wrap(async (req, res) => {
  const customer = await orderCustomerService.setCustomerPricing({
    orderId: req.params.id,
    priceAmount: req.body?.priceAmount,
    priceCurrency: req.body?.priceCurrency,
    ...actor(req),
  });
  res.status(200).json({ success: true, data: { customer } });
});

function linkPayload(link) {
  return { claimUrl: link.claimUrl, expiresAt: link.expiresAt };
}

const regenerateActivationLink = wrap(async (req, res) => {
  const link = await orderCustomerService.regenerateActivationLink({ orderId: req.params.id, ...actor(req) });
  const customer = await orderCustomerService.getAdminOrderCustomer(req.params.id);
  res.set("Cache-Control", "no-store");
  res.status(201).json({ success: true, data: { customerLink: linkPayload(link), customer } });
});

const createConversionLink = wrap(async (req, res) => {
  const link = await orderCustomerService.createGuestConversionLink({
    orderId: req.params.id,
    evidence: req.body?.evidence,
    ...actor(req),
  });
  const customer = await orderCustomerService.getAdminOrderCustomer(req.params.id);
  res.set("Cache-Control", "no-store");
  res.status(201).json({ success: true, data: { customerLink: linkPayload(link), customer } });
});

const revokeLink = wrap(async (req, res) => {
  const customer = await orderCustomerService.revokeInvitation({ orderId: req.params.id, ...actor(req) });
  res.status(200).json({ success: true, data: { customer } });
});

const previewClaim = wrap(async (req, res) => {
  const claim = await orderCustomerService.previewClaim(String(req.body?.token || ""));
  res.set("Cache-Control", "no-store");
  res.status(200).json({ success: true, data: { claim } });
});

const claimOrder = wrap(async (req, res) => {
  const result = await orderCustomerService.claimOrder({ token: String(req.body?.token || ""), userId: req.auth.userId });
  res.status(200).json({ success: true, data: result });
});

module.exports = {
  searchCustomers,
  checkPhone,
  listAccountManagers,
  getSummary,
  getOrderCustomer,
  revealContact,
  updateAccountManager,
  updatePricing,
  regenerateActivationLink,
  createConversionLink,
  revokeLink,
  previewClaim,
  claimOrder,
};
