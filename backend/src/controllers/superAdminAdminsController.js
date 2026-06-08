const superAdminAdminsService = require("../services/superAdminAdminsService");
const { PERMISSION_GROUPS } = require("../constants/dashboardPermissions");

async function listAdmins(req, res, next) {
  try {
    const admins = await superAdminAdminsService.listAdmins();
    return res.json({ success: true, data: { admins } });
  } catch (err) {
    return next(err);
  }
}

async function createAdmin(req, res, next) {
  try {
    const admin = await superAdminAdminsService.createAdmin({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      permissionKeys: req.body.permissions,
      grantedBy: req.auth?.userId ? Number(req.auth.userId) : null,
    });
    return res.status(201).json({ success: true, data: { admin } });
  } catch (err) {
    return next(err);
  }
}

async function updateAdmin(req, res, next) {
  try {
    const admin = await superAdminAdminsService.updateAdmin({
      id: req.params.id,
      name: req.body.name,
      email: req.body.email,
      isActive: req.body.isActive,
      permissionKeys: req.body.permissions,
      grantedBy: req.auth?.userId ? Number(req.auth.userId) : null,
    });
    return res.json({ success: true, data: { admin } });
  } catch (err) {
    return next(err);
  }
}

async function listAdminPermissions(req, res, next) {
  try {
    return res.json({ success: true, data: { groups: PERMISSION_GROUPS } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAdmins,
  createAdmin,
  updateAdmin,
  listAdminPermissions,
};
