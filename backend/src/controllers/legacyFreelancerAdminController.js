const legacyFreelancerAdminService = require("../services/legacyFreelancerAdminService");

function actorId(req) {
  return req.user?.id ?? req.auth?.userId ?? null;
}

function parseJsonField(value, fallback = undefined) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }
  return value;
}

function pickFile(files, ...names) {
  if (!files) return null;
  for (const name of names) {
    if (Array.isArray(files[name]) && files[name][0]) return files[name][0];
    if (files[name] && files[name].buffer) return files[name];
  }
  return null;
}

const listLegacyFreelancers = async (req, res, next) => {
  try {
    const filters = {
      entryMethod: req.query.entryMethod || req.query.legacyEntryMethod || null,
      isActive: req.query.isActive,
      planId: req.query.planId,
      packageStatus: req.query.packageStatus,
      identityComplete: req.query.identityComplete,
      joinedFrom: req.query.joinedFrom,
      joinedTo: req.query.joinedTo,
      campaignId: req.query.campaignId || req.query.legacyInviteCampaignId || null,
      workField: req.query.workField || req.query.skill || null,
    };
    const data = await legacyFreelancerAdminService.listLegacyFreelancers({
      q: req.query.q || req.query.search || null,
      filters,
      page: req.query.page,
      pageSize: req.query.pageSize || req.query.limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const getLegacyFreelancer = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.getLegacyFreelancerDetail(req.params.userId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const createManualLegacyFreelancer = async (req, res, next) => {
  try {
    const body = { ...req.body };
    body.categories = parseJsonField(body.categories, body.categories);
    body.phone = parseJsonField(body.phone, body.phone);
    body.whatsApp = parseJsonField(body.whatsApp ?? body.whatsapp, body.whatsApp);
    body.signedDocumentTypeIds = parseJsonField(
      body.signedDocumentTypeIds ?? body.signed_document_type_ids,
      [],
    );
    body.workFields = parseJsonField(body.workFields ?? body.work_fields, body.workFields);
    const files = {
      idFront: pickFile(req.files, "idFront", "front"),
      idBack: pickFile(req.files, "idBack", "back"),
    };
    const data = await legacyFreelancerAdminService.createManualLegacyFreelancer(body, {
      actorAdminId: actorId(req),
      files,
    });
    return res.status(201).json({ success: true, data, message: data.message });
  } catch (err) {
    return next(err);
  }
};

const assignPackage = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.assignPackage({
      userId: req.params.userId,
      planId: req.body.planId ?? req.body.plan_id,
      durationMonths: req.body.durationMonths ?? req.body.duration_months,
      startsAt: req.body.startsAt ?? req.body.starts_at,
      notes: req.body.notes,
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data, message: "تم إسناد الباقة." });
  } catch (err) {
    return next(err);
  }
};

const bulkAssignPackage = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.bulkAssignPackage({
      userIds: req.body.userIds || req.body.user_ids || [],
      planId: req.body.planId ?? req.body.plan_id,
      durationMonths: req.body.durationMonths ?? req.body.duration_months,
      startsAt: req.body.startsAt ?? req.body.starts_at,
      notes: req.body.notes,
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const listDocumentTypes = async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive !== "false";
    const data = await legacyFreelancerAdminService.listDocumentTypes({ includeInactive });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const createDocumentType = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.createDocumentType(req.body, {
      actorAdminId: actorId(req),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const updateDocumentType = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.updateDocumentType(req.params.id, req.body, {
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const getCampaignDocumentRequirements = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.getCampaignDocumentRequirements(
      req.params.campaignId,
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const putCampaignDocumentRequirements = async (req, res, next) => {
  try {
    const items = req.body.requirements || req.body.items || req.body;
    const data = await legacyFreelancerAdminService.replaceCampaignDocumentRequirements(
      req.params.campaignId,
      items,
      { actorAdminId: actorId(req) },
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const setSignedDocument = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.setSignedDocument({
      userId: req.params.userId,
      documentTypeId: req.body.documentTypeId ?? req.body.document_type_id,
      notes: req.body.notes,
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data, message: "تم تسجيل المستند الموقّع." });
  } catch (err) {
    return next(err);
  }
};

const removeSignedDocument = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.removeSignedDocument({
      userId: req.params.userId,
      documentTypeId: req.params.documentTypeId,
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const addHistoricalMoney = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.addHistoricalMoney({
      userId: req.params.userId,
      amount: req.body.amount,
      currency: req.body.currency,
      receivedAt: req.body.receivedAt ?? req.body.received_at,
      note: req.body.note,
      actorAdminId: actorId(req),
    });
    return res.status(201).json({
      success: true,
      data,
      message: "تم تسجيل المبلغ التاريخي (إداري فقط — لا يؤثر على الرصيد).",
    });
  } catch (err) {
    return next(err);
  }
};

const voidHistoricalMoney = async (req, res, next) => {
  try {
    const data = await legacyFreelancerAdminService.voidHistoricalMoney({
      userId: req.params.userId,
      id: req.params.id,
      voidReason: req.body.voidReason ?? req.body.void_reason ?? req.body.reason,
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const streamIdentity = async (req, res, next) => {
  try {
    const file = await legacyFreelancerAdminService.getIdentityFileBytes({
      userId: req.params.userId,
      side: req.params.side,
      actorAdminId: actorId(req),
    });
    res.setHeader("Content-Type", file.mimeType || "image/jpeg");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(file.originalName || "identity.jpg").replace(/"/g, "")}"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(file.buffer);
  } catch (err) {
    return next(err);
  }
};

const replaceIdentity = async (req, res, next) => {
  try {
    const file = pickFile(req.files, "file", "idFront", "idBack", "image") || req.file || null;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "لم يتم اختيار صورة.",
        code: "VALIDATION_ERROR",
      });
    }
    const data = await legacyFreelancerAdminService.replaceIdentityDocument({
      userId: req.params.userId,
      side: req.params.side,
      file,
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data, message: "تم استبدال صورة الهوية." });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listLegacyFreelancers,
  getLegacyFreelancer,
  createManualLegacyFreelancer,
  assignPackage,
  bulkAssignPackage,
  listDocumentTypes,
  createDocumentType,
  updateDocumentType,
  getCampaignDocumentRequirements,
  putCampaignDocumentRequirements,
  setSignedDocument,
  removeSignedDocument,
  addHistoricalMoney,
  voidHistoricalMoney,
  streamIdentity,
  replaceIdentity,
};
