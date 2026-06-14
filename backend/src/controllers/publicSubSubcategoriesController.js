const subSubcategoriesService = require("../services/subSubcategoriesService");

const listPublicPaginated = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 16;
    const payload = await subSubcategoriesService.listActivePaginated({ page, limit });
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listPublicPaginated,
};
