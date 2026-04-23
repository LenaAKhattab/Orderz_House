const subSubcategoriesService = require("../services/subSubcategoriesService");

const listSubSubcategoriesByCategory = async (req, res, next) => {
  try {
    const subSubcategories = await subSubcategoriesService.listActiveByCategory(req.params.categoryId);
    return res.status(200).json({ success: true, data: { subSubcategories } });
  } catch (err) {
    return next(err);
  }
};

const listSubSubcategoriesBySubcategory = async (req, res, next) => {
  try {
    const subSubcategories = await subSubcategoriesService.listActiveBySubcategory(req.params.subcategoryId);
    return res.status(200).json({ success: true, data: { subSubcategories } });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listSubSubcategoriesByCategory,
  listSubSubcategoriesBySubcategory,
};

