const feedbackService = require("../services/feedbackService");

async function createFeedback(req, res, next) {
  try {
    const feedback = await feedbackService.createFeedback(req.auth.userId, req.body || {});
    return res.status(201).json({ success: true, data: { feedback } });
  } catch (err) {
    return next(err);
  }
}

async function listMyFeedback(req, res, next) {
  try {
    const data = await feedbackService.listMyFeedback(req.auth.userId, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getMyFeedback(req, res, next) {
  try {
    const feedback = await feedbackService.getMyFeedbackById(req.auth.userId, req.params.id);
    return res.status(200).json({ success: true, data: { feedback } });
  } catch (err) {
    return next(err);
  }
}

async function adminListFeedback(req, res, next) {
  try {
    const data = await feedbackService.adminListFeedback({
      q: req.query.q,
      type: req.query.type || null,
      status: req.query.status || null,
      userRole: req.query.userRole || null,
      priority: req.query.priority || null,
      from: req.query.from || null,
      to: req.query.to || null,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function adminGetFeedback(req, res, next) {
  try {
    const feedback = await feedbackService.adminGetFeedbackById(req.params.id);
    return res.status(200).json({ success: true, data: { feedback } });
  } catch (err) {
    return next(err);
  }
}

async function adminUpdateFeedback(req, res, next) {
  try {
    const feedback = await feedbackService.adminUpdateFeedback(
      req.params.id,
      req.body || {},
      req.auth.userId,
    );
    return res.status(200).json({ success: true, data: { feedback } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createFeedback,
  listMyFeedback,
  getMyFeedback,
  adminListFeedback,
  adminGetFeedback,
  adminUpdateFeedback,
};
