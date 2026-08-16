const trainingPackagesService = require("../services/trainingPackagesService");

async function listPublic(req, res, next) {
  try {
    const packages = await trainingPackagesService.listPublicTrainingPackages();
    return res.status(200).json({ success: true, data: { packages } });
  } catch (err) {
    return next(err);
  }
}

async function listAdmin(req, res, next) {
  try {
    const packages = await trainingPackagesService.listAdminTrainingPackages();
    return res.status(200).json({ success: true, data: { packages } });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const pkg = await trainingPackagesService.createTrainingPackage(req.body || {}, {
      updatedByUserId: req.user?.id,
    });
    return res.status(201).json({ success: true, data: { package: pkg } });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const pkg = await trainingPackagesService.upsertTrainingPackage(req.params.code, req.body || {}, {
      updatedByUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data: { package: pkg } });
  } catch (err) {
    return next(err);
  }
}

async function reorder(req, res, next) {
  try {
    const packages = await trainingPackagesService.reorderTrainingPackages(req.body?.orderedCodes, {
      updatedByUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data: { packages } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPublic,
  listAdmin,
  create,
  update,
  reorder,
};
