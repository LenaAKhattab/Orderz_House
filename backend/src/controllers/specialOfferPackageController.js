const specialOfferPackageService = require("../services/specialOfferPackageService");

async function getPublic(req, res, next) {
  try {
    const specialOfferPackage = await specialOfferPackageService.getPublicSpecialOfferPackage();
    return res.status(200).json({ success: true, data: { specialOfferPackage } });
  } catch (err) {
    return next(err);
  }
}

async function getAdmin(req, res, next) {
  try {
    const specialOfferPackage = await specialOfferPackageService.getSpecialOfferPackage();
    return res.status(200).json({ success: true, data: { specialOfferPackage } });
  } catch (err) {
    return next(err);
  }
}

async function updateAdmin(req, res, next) {
  try {
    const specialOfferPackage = await specialOfferPackageService.upsertSpecialOfferPackage(
      req.body || {},
      { updatedByUserId: req.auth?.userId },
    );
    return res.status(200).json({ success: true, data: { specialOfferPackage } });
  } catch (err) {
    return next(err);
  }
}

async function updateVisibility(req, res, next) {
  try {
    const specialOfferPackage = await specialOfferPackageService.setSpecialOfferVisibility(
      req.body?.isVisible,
      { updatedByUserId: req.auth?.userId },
    );
    return res.status(200).json({ success: true, data: { specialOfferPackage } });
  } catch (err) {
    return next(err);
  }
}

async function createNewVersion(req, res, next) {
  try {
    const specialOfferPackage = await specialOfferPackageService.createNewSpecialOfferVersion(
      {
        copyFromCurrent: req.body?.copyFromCurrent !== false,
        makeVisible: Boolean(req.body?.makeVisible),
      },
      { updatedByUserId: req.auth?.userId },
    );
    return res.status(201).json({ success: true, data: { specialOfferPackage } });
  } catch (err) {
    return next(err);
  }
}

async function createCheckout(req, res, next) {
  try {
    const freelancerUserId = req.auth?.userId ?? req.user?.sub ?? req.user?.id;
    const result = await specialOfferPackageService.createSpecialOfferCheckoutSession({
      freelancerUserId,
      locale: String(req.headers["accept-language"] || "ar").toLowerCase().startsWith("en")
        ? "en"
        : "ar",
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublic,
  getAdmin,
  updateAdmin,
  updateVisibility,
  createNewVersion,
  createCheckout,
};
