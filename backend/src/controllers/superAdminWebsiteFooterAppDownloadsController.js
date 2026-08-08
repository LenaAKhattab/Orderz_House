const websiteFooterAppDownloadsService = require("../services/websiteFooterAppDownloadsService");

function mapServiceError(err, res) {
  if (err?.statusCode && err?.publicCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.publicCode,
    });
  }
  return null;
}

async function getFooterAppDownloads(req, res, next) {
  try {
    const settings = await websiteFooterAppDownloadsService.getFooterAppDownloads();
    return res.json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function updateFooterAppDownloads(req, res, next) {
  try {
    const settings = await websiteFooterAppDownloadsService.updateFooterAppDownloads({
      titleAr: req.body.titleAr,
      titleEn: req.body.titleEn,
      googlePlayUrl: req.body.googlePlayUrl,
      appStoreUrl: req.body.appStoreUrl,
      visible: req.body.visible,
      titleVisible: req.body.titleVisible,
      googlePlayVisible: req.body.googlePlayVisible,
      appStoreVisible: req.body.appStoreVisible,
    });
    return res.json({ success: true, data: { settings } });
  } catch (err) {
    if (mapServiceError(err, res)) return undefined;
    return next(err);
  }
}

async function getFooterSettings(req, res, next) {
  try {
    const settings = await websiteFooterAppDownloadsService.getFooterSettings();
    return res.json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function updateFooterContact(req, res, next) {
  try {
    const contact = await websiteFooterAppDownloadsService.updateFooterContact({
      phone: req.body.phone,
      email: req.body.email,
      whatsapp: req.body.whatsapp,
      location: req.body.location,
      visible: req.body.visible,
      phoneVisible: req.body.phoneVisible,
      emailVisible: req.body.emailVisible,
      whatsappVisible: req.body.whatsappVisible,
      locationVisible: req.body.locationVisible,
    });
    return res.json({ success: true, data: { contact } });
  } catch (err) {
    if (mapServiceError(err, res)) return undefined;
    return next(err);
  }
}

async function updateFooterWorkingHours(req, res, next) {
  try {
    const workingHours = await websiteFooterAppDownloadsService.updateFooterWorkingHours({
      title: req.body.title,
      text: req.body.text,
      visible: req.body.visible,
      titleVisible: req.body.titleVisible,
      textVisible: req.body.textVisible,
    });
    return res.json({ success: true, data: { workingHours } });
  } catch (err) {
    if (mapServiceError(err, res)) return undefined;
    return next(err);
  }
}

async function updateFooterContactCenter(req, res, next) {
  try {
    const contactCenter = await websiteFooterAppDownloadsService.updateFooterContactCenter({
      helperText: req.body.helperText,
      buttonText: req.body.buttonText,
      visible: req.body.visible,
      helperTextVisible: req.body.helperTextVisible,
      buttonVisible: req.body.buttonVisible,
    });
    return res.json({ success: true, data: { contactCenter } });
  } catch (err) {
    if (mapServiceError(err, res)) return undefined;
    return next(err);
  }
}

module.exports = {
  getFooterAppDownloads,
  updateFooterAppDownloads,
  getFooterSettings,
  updateFooterContact,
  updateFooterWorkingHours,
  updateFooterContactCenter,
};
