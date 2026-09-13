const service = require("../services/superAdminUsersControlService");

function actorId(req) {
  return req.auth?.userId || req.user?.sub || req.user?.id;
}

function requestId(req) {
  return req.id || req.headers["x-request-id"] || null;
}

async function getStats(req, res, next) {
  try {
    const stats = await service.getStats();
    return res.json({ success: true, data: { stats } });
  } catch (err) {
    return next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const data = await service.listUsers(req.query || {});
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getUserDetail(req, res, next) {
  try {
    const detail = await service.getUserDetail(req.params.userId);
    return res.json({ success: true, data: detail });
  } catch (err) {
    return next(err);
  }
}

async function patchAccount(req, res, next) {
  try {
    const result = await service.patchAccount({
      actorAdminId: actorId(req),
      userId: req.params.userId,
      patch: req.body || {},
      reason: req.body?.reason,
      requestId: requestId(req),
    });
    return res.json({ success: true, data: result, message: "تم تحديث الحساب." });
  } catch (err) {
    return next(err);
  }
}

async function patchIdentity(req, res, next) {
  try {
    const result = await service.patchIdentity({
      actorAdminId: actorId(req),
      userId: req.params.userId,
      action: req.body?.action,
      reason: req.body?.reason,
      adminNote: req.body?.adminNote || req.body?.admin_note || null,
      requestId: requestId(req),
    });
    return res.json({ success: true, data: result, message: "تم تحديث حالة الهوية." });
  } catch (err) {
    return next(err);
  }
}

async function patchMembership(req, res, next) {
  try {
    const result = await service.patchMembership({
      actorAdminId: actorId(req),
      userId: req.params.userId,
      action: req.body?.action,
      planId: req.body?.planId || req.body?.plan_id || null,
      reason: req.body?.reason,
      requestId: requestId(req),
    });
    return res.json({ success: true, data: result, message: "تم تحديث الباقة." });
  } catch (err) {
    return next(err);
  }
}

async function patchTraining(req, res, next) {
  try {
    const result = await service.patchTraining({
      actorAdminId: actorId(req),
      userId: req.params.userId,
      action: req.body?.action,
      courseId: req.body?.courseId || req.body?.course_id || null,
      reason: req.body?.reason,
      requestId: requestId(req),
    });
    return res.json({ success: true, data: result, message: "تم تحديث التدريب." });
  } catch (err) {
    return next(err);
  }
}

async function bulkActions(req, res, next) {
  try {
    const result = await service.bulkActions({
      actorAdminId: actorId(req),
      userIds: req.body?.userIds || req.body?.user_ids || [],
      action: req.body?.action,
      payload: req.body?.payload || {},
      reason: req.body?.reason,
      requestId: requestId(req),
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getStats,
  listUsers,
  getUserDetail,
  patchAccount,
  patchIdentity,
  patchMembership,
  patchTraining,
  bulkActions,
};
