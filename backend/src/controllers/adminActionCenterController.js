const adminActionCenterSummaryService = require("../services/adminActionCenterSummaryService");

async function getSummary(req, res, next) {
  try {
    const userId = req.user?.id || req.auth?.userId || null;
    let data;
    try {
      data = await adminActionCenterSummaryService.getActionCenterSummary({ userId });
    } catch (err) {
      data = adminActionCenterSummaryService.buildEmptySummary([
        { key: "summary", error: err?.message || String(err) },
      ]);
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSummary,
};
