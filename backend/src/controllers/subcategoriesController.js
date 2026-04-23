const subcategoriesService = require("../services/subcategoriesService");

const listSubcategoriesByCategory = async (req, res, next) => {
  try {
    const subcategories = await subcategoriesService.listActiveSubcategoriesByCategory(req.params.categoryId);
    return res.status(200).json({ success: true, data: { subcategories } });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listSubcategoriesByCategory,
};

