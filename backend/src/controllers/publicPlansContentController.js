const publicPlansContentService = require("../services/publicPlansContentService");

async function getPublic(req, res, next) {
  try {
    const data = await publicPlansContentService.getPublicPlansContent();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getAdmin(req, res, next) {
  try {
    const data = await publicPlansContentService.getAdminPublicPlansContent();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function updateAdmin(req, res, next) {
  try {
    const data = await publicPlansContentService.setPublicPlansContent(
      {
        badgeText: req.body?.badgeText,
        title: req.body?.title,
        description: req.body?.description,
        defaultSection: req.body?.defaultSection,
        trainingTabLabel: req.body?.trainingTabLabel,
        workTabLabel: req.body?.workTabLabel,
      },
      { updatedByUserId: req.auth?.userId ?? null },
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublic,
  getAdmin,
  updateAdmin,
};
