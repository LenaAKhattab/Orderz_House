const { listFreelancerMyArticles } = require("../services/freelancerMyArticlesService");

async function listMyArticles(req, res, next) {
  try {
    const data = await listFreelancerMyArticles(req.user.id, {
      statusFilter: req.query.status || null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listMyArticles,
};
