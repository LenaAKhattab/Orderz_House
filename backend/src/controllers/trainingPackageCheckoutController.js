const checkoutService = require("../services/trainingPackageCheckoutService");

function freelancerId(req) {
  return req.auth?.userId ?? req.user?.sub ?? req.user?.id;
}

async function getMine(req, res, next) {
  try {
    const data = await checkoutService.getMyTrainingPackages(freelancerId(req));
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function createCheckout(req, res, next) {
  try {
    const data = await checkoutService.createTrainingPackageCheckoutSession({
      freelancerUserId: freelancerId(req),
      packageCode: req.body?.packageCode ?? req.body?.code,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function cancelCheckout(req, res, next) {
  try {
    const data = await checkoutService.cancelTrainingPackageCheckout({
      freelancerUserId: freelancerId(req),
      sessionId: req.body?.sessionId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMine,
  createCheckout,
  cancelCheckout,
};
