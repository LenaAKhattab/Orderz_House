const financialUserService = require("../services/financialUserService");

async function getMySummary(req, res, next) {
  try {
    const summary = await financialUserService.getMySummary(req.auth.userId);
    return res.status(200).json({ success: true, data: { summary } });
  } catch (err) {
    return next(err);
  }
}

async function listMyBonuses(req, res, next) {
  try {
    const items = await financialUserService.listMyBonuses(req.auth.userId, { month: req.query.month });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMySummary,
  listMyBonuses,
};
