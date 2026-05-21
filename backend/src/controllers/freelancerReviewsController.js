const freelancerReviewsService = require("../services/freelancerReviewsService");

async function getClientOrderReviewStatus(req, res, next) {
  try {
    const data = await freelancerReviewsService.getClientReviewStatusForOrder({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function submitClientOrderReview(req, res, next) {
  try {
    const review = await freelancerReviewsService.createClientReviewForOrder({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      payload: req.body,
    });
    return res.status(201).json({ success: true, data: { review } });
  } catch (err) {
    return next(err);
  }
}

async function updateClientOrderReview(req, res, next) {
  try {
    const review = await freelancerReviewsService.updateClientReviewForOrder({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      payload: req.body,
    });
    return res.status(200).json({ success: true, data: { review } });
  } catch (err) {
    return next(err);
  }
}

async function listMyFreelancerReviews(req, res, next) {
  try {
    const result = await freelancerReviewsService.listFreelancerReviews({
      freelancerUserId: req.auth.userId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function getMyFreelancerReviewsSummary(req, res, next) {
  try {
    const summary = await freelancerReviewsService.getFreelancerReviewAggregates(req.auth.userId);
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getClientOrderReviewStatus,
  submitClientOrderReview,
  updateClientOrderReview,
  listMyFreelancerReviews,
  getMyFreelancerReviewsSummary,
};
