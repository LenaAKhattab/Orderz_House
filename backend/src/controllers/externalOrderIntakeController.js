const externalOrderIntakeService = require("../services/externalOrderIntakeService");

function actorRole(req) {
  return req.auth?.isSuperAdmin ? "super_admin" : "admin";
}

/** POST /api/freelancer/external-order-intakes — body: { externalOrderId }. freelancer id from auth only. */
const submitIntake = async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await externalOrderIntakeService.submitIntake({
      freelancerUserId: req.auth.userId,
      externalOrderId: body.externalOrderId,
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: { intake: result.intake, created: result.created },
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/freelancer/external-order-intakes?page=&status= */
const listMyIntakes = async (req, res, next) => {
  try {
    const data = await externalOrderIntakeService.listFreelancerIntakes({
      freelancerUserId: req.auth.userId,
      page: req.query.page,
      status: req.query.status,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/external-order-intakes?page=&status=&q=&freelancer=&from=&to= */
const adminListIntakes = async (req, res, next) => {
  try {
    const data = await externalOrderIntakeService.listAdminIntakes({
      page: req.query.page,
      status: req.query.status,
      q: req.query.q,
      freelancer: req.query.freelancer,
      from: req.query.from,
      to: req.query.to,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/external-order-intakes/pending-count (sidebar badge). */
const adminPendingCount = async (req, res, next) => {
  try {
    const pendingCount = await externalOrderIntakeService.countPendingIntakes();
    return res.status(200).json({ success: true, data: { pendingCount } });
  } catch (err) {
    return next(err);
  }
};

const adminGetIntake = async (req, res, next) => {
  try {
    const data = await externalOrderIntakeService.getAdminIntake({ intakeId: req.params.id });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/admin/external-order-intakes/:id/approve — body: { price, categoryId?, durationValue?, durationUnit?, internalNote? } */
const adminApproveIntake = async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const data = await externalOrderIntakeService.approveIntake({
      intakeId: req.params.id,
      actorUserId: req.auth.userId,
      actorRole: actorRole(req),
      price: body.price,
      categoryId: body.categoryId,
      durationValue: body.durationValue,
      durationUnit: body.durationUnit,
      internalNote: body.internalNote,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/admin/external-order-intakes/:id/reject — body: { reasonCode, internalNote? } */
const adminRejectIntake = async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const data = await externalOrderIntakeService.rejectIntake({
      intakeId: req.params.id,
      actorUserId: req.auth.userId,
      actorRole: actorRole(req),
      reasonCode: body.reasonCode,
      internalNote: body.internalNote,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  submitIntake,
  listMyIntakes,
  adminListIntakes,
  adminPendingCount,
  adminGetIntake,
  adminApproveIntake,
  adminRejectIntake,
};
