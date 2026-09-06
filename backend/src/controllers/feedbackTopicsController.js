const feedbackTopicsService = require("../services/feedbackTopicsService");

async function listActiveTopics(req, res, next) {
  try {
    const items = await feedbackTopicsService.listActiveTopicsByCategory({
      categoryId: req.query.categoryId || null,
      type: req.query.type || null,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function adminListTopics(req, res, next) {
  try {
    const items = await feedbackTopicsService.listAllTopics({
      categoryId: req.query.categoryId || null,
      type: req.query.type || null,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function adminCreateTopic(req, res, next) {
  try {
    const item = await feedbackTopicsService.createTopic({
      categoryId: req.body.categoryId,
      type: req.body.type,
      label: req.body.label,
      isActive: req.body.isActive,
    });
    return res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function adminUpdateTopic(req, res, next) {
  try {
    const item = await feedbackTopicsService.updateTopic(req.params.id, {
      label: req.body.label,
      isActive: req.body.isActive,
    });
    return res.status(200).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function adminDeleteTopic(req, res, next) {
  try {
    const result = await feedbackTopicsService.deleteTopic(req.params.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function adminReorderTopics(req, res, next) {
  try {
    const items = await feedbackTopicsService.reorderTopics({
      categoryId: req.body.categoryId,
      type: req.body.type,
      orderedIds: req.body.orderedIds,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listActiveTopics,
  adminListTopics,
  adminCreateTopic,
  adminUpdateTopic,
  adminDeleteTopic,
  adminReorderTopics,
};
