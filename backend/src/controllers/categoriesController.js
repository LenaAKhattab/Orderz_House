const categoriesService = require("../services/categoriesService");

const listCategories = async (req, res, next) => {
  try {
    const categories = await categoriesService.listCategories();
    return res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listCategories,
};

