const websiteFaqService = require("../services/websiteFaqService");

async function listPublicFaq(req, res, next) {
  try {
    const items = await websiteFaqService.listActiveFaqItems();
    return res.json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPublicFaq,
};
