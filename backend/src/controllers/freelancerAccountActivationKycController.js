/**
 * Phase A11 — Freelancer account activation KYC controllers.
 */

const service = require("../services/freelancerAccountActivationKycService");

function parseTruthy(value) {
  const s = String(value ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

const getMyAccountActivation = async (req, res, next) => {
  try {
    const data = await service.getFreelancerAccountActivationStatus(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const submitMyAccountActivation = async (req, res, next) => {
  try {
    const files = req.files || {};
    const idFront = Array.isArray(files.idFront) ? files.idFront[0] : null;
    const idBack = Array.isArray(files.idBack) ? files.idBack[0] : null;
    const termsAccepted = parseTruthy(req.body?.termsAccepted);
    const termsVersion = req.body?.termsVersion || undefined;
    const data = await service.submitFreelancerAccountActivationRequest({
      freelancerUserId: req.user.id,
      idFrontFile: idFront,
      idBackFile: idBack,
      termsAccepted,
      termsVersion,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const listActivationRequests = async (req, res, next) => {
  try {
    const data = await service.listActivationRequestsForAdmin({
      status: req.query.status || null,
      search: req.query.search || null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const getActivationRequest = async (req, res, next) => {
  try {
    const data = await service.getActivationRequestForAdmin(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const approveActivationRequest = async (req, res, next) => {
  try {
    const data = await service.approveActivationRequest({
      requestId: req.params.id,
      actorUserId: req.user.id,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const rejectActivationRequest = async (req, res, next) => {
  try {
    const data = await service.rejectActivationRequest({
      requestId: req.params.id,
      actorUserId: req.user.id,
      rejectionReason: req.body?.rejectionReason,
      adminNotes: req.body?.adminNotes,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const downloadActivationRequestFile = async (req, res, next) => {
  try {
    const sideRaw = String(req.params.side || "").toLowerCase();
    if (sideRaw !== "front" && sideRaw !== "back") {
      return res.status(400).json({ success: false, message: "side must be front or back" });
    }
    const side = sideRaw;
    const out = await service.fetchAdminKycFileBytes({
      requestId: req.params.id,
      side,
    });
    if (!out?.buffer || !Buffer.isBuffer(out.buffer) || out.buffer.length < 1) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على صورة الهوية.",
        code: "KYC_FILE_NOT_FOUND",
      });
    }
    const inline = String(req.query.disposition || "").toLowerCase() === "inline";
    const cdType = inline ? "inline" : "attachment";
    const utf8Name = String(out.originalName || `${side}.jpg`);
    res.status(200);
    res.setHeader("Content-Type", out.mimeType || "image/jpeg");
    res.setHeader("Content-Length", String(out.buffer.length));
    res.setHeader(
      "Content-Disposition",
      `${cdType}; filename*=UTF-8''${encodeURIComponent(utf8Name)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.end(out.buffer);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getMyAccountActivation,
  submitMyAccountActivation,
  listActivationRequests,
  getActivationRequest,
  approveActivationRequest,
  rejectActivationRequest,
  downloadActivationRequestFile,
};
