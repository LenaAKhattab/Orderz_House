const feedbackCategoriesService = require("../services/feedbackCategoriesService");

async function listActiveCategories(req, res, next) {
  try {
    const items = await feedbackCategoriesService.listActiveCategories();
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function adminListCategories(req, res, next) {
  try {
    const items = await feedbackCategoriesService.listAllCategories();
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function adminCreateCategory(req, res, next) {
  try {
    const item = await feedbackCategoriesService.createCategory({
      label: req.body.label,
      isActive: req.body.isActive,
    });
    return res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function adminUpdateCategory(req, res, next) {
  try {
    const item = await feedbackCategoriesService.updateCategory(req.params.id, {
      label: req.body.label,
      isActive: req.body.isActive,
    });
    return res.status(200).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function adminDeleteCategory(req, res, next) {
  try {
    const result = await feedbackCategoriesService.deleteCategory(req.params.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function adminReorderCategories(req, res, next) {
  try {
    const items = await feedbackCategoriesService.reorderCategories({
      orderedIds: req.body.orderedIds,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listActiveCategories,
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminReorderCategories,
};
