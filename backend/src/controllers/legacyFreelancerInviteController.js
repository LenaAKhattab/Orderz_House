const legacyFreelancerInviteService = require("../services/legacyFreelancerInviteService");
const { sendAuthSuccess } = require("../utils/authSessionResponse");

function actorId(req) {
  return req.user?.id ?? req.auth?.userId ?? null;
}

const listCampaigns = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.listCampaigns();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const getCampaign = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.getCampaignById(req.params.campaignId);
    if (!data) {
      return res.status(404).json({ success: false, message: "الحملة غير موجودة.", code: "NOT_FOUND" });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const createCampaign = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.createCampaign({
      actorAdminId: actorId(req),
      name: req.body.name,
      slug: req.body.slug,
      maxRedemptions: req.body.maxRedemptions ?? req.body.max_redemptions,
      expiresAt: req.body.expiresAt ?? req.body.expires_at,
      defaultPlanCode: req.body.defaultPlanCode ?? req.body.default_plan_code,
      defaultTrustLevel: req.body.defaultTrustLevel ?? req.body.default_trust_level,
      defaultCategoryId: req.body.defaultCategoryId ?? req.body.default_category_id,
      notes: req.body.notes,
      isActive: req.body.isActive ?? req.body.is_active,
      institutionId: req.body.institutionId ?? req.body.institution_id ?? null,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const updateCampaign = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.updateCampaign({
      actorAdminId: actorId(req),
      campaignId: req.params.campaignId,
      name: req.body.name,
      slug: req.body.slug,
      maxRedemptions: req.body.maxRedemptions ?? req.body.max_redemptions,
      expiresAt: req.body.expiresAt ?? req.body.expires_at,
      defaultPlanCode: req.body.defaultPlanCode ?? req.body.default_plan_code,
      defaultTrustLevel: req.body.defaultTrustLevel ?? req.body.default_trust_level,
      defaultCategoryId: req.body.defaultCategoryId ?? req.body.default_category_id,
      notes: req.body.notes,
      isActive: req.body.isActive ?? req.body.is_active,
      requireIdFront: req.body.requireIdFront ?? req.body.require_id_front,
      requireIdBack: req.body.requireIdBack ?? req.body.require_id_back,
      institutionId:
        req.body.institutionId !== undefined
          ? req.body.institutionId
          : req.body.institution_id !== undefined
            ? req.body.institution_id
            : undefined,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const revokeCampaign = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.revokeCampaign({
      actorAdminId: actorId(req),
      campaignId: req.params.campaignId,
    });
    return res.status(200).json({ success: true, data, message: "تم إيقاف رابط الدعوة." });
  } catch (err) {
    return next(err);
  }
};

const regenerateToken = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.regenerateCampaignToken({
      actorAdminId: actorId(req),
      campaignId: req.params.campaignId,
    });
    return res.status(200).json({
      success: true,
      data,
      message: "تم إعادة توليد رمز الرابط. الرابط القديم لم يعد صالحاً.",
    });
  } catch (err) {
    return next(err);
  }
};

const listRedemptions = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.listRedemptions(req.params.campaignId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const exportRedemptionsCsv = async (req, res, next) => {
  try {
    const rows = await legacyFreelancerInviteService.listRedemptions(req.params.campaignId);
    const header = [
      "userId",
      "accountId",
      "freelancerMemberIdMasked",
      "fullName",
      "emailMasked",
      "phoneMasked",
      "identityLast4",
      "internalReference",
      "redeemedAt",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.userId,
          r.accountId,
          r.freelancerMemberIdMasked || "",
          JSON.stringify(r.fullName || ""),
          r.emailMasked,
          r.phoneMasked || "",
          r.identityLast4 || "",
          JSON.stringify(r.internalReference || ""),
          r.redeemedAt ? new Date(r.redeemedAt).toISOString() : "",
        ].join(","),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="legacy-invite-${String(req.params.campaignId)}.csv"`,
    );
    return res.status(200).send(`\uFEFF${lines.join("\n")}`);
  } catch (err) {
    return next(err);
  }
};

const getContractCatalog = async (_req, res, next) => {
  try {
    const contractFields = require("../services/legacyFreelancerContractFieldsService");
    return res.status(200).json({ success: true, data: contractFields.getContractCatalog() });
  } catch (err) {
    return next(err);
  }
};

const getCampaignFields = async (req, res, next) => {
  try {
    const contractFields = require("../services/legacyFreelancerContractFieldsService");
    const data = await contractFields.getCampaignFieldConfig(req.params.campaignId, {
      includeDisabled: true,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const putCampaignFields = async (req, res, next) => {
  try {
    const contractFields = require("../services/legacyFreelancerContractFieldsService");
    const data = await contractFields.replaceCampaignFieldConfig(
      req.params.campaignId,
      req.body.fields || req.body,
      { actorAdminId: actorId(req) },
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const restoreCampaignFields = async (req, res, next) => {
  try {
    const contractFields = require("../services/legacyFreelancerContractFieldsService");
    const data = await contractFields.restoreDefaultFieldConfig(req.params.campaignId, {
      actorAdminId: actorId(req),
    });
    return res.status(200).json({ success: true, data, message: "تمت استعادة الإعداد الافتراضي." });
  } catch (err) {
    return next(err);
  }
};

const getRedemptionAnswers = async (req, res, next) => {
  try {
    const contractFields = require("../services/legacyFreelancerContractFieldsService");
    const data = await contractFields.getAnswersForUser({
      campaignId: req.params.campaignId,
      userId: req.params.userId,
      maskSensitive: false,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const previewInvite = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.previewInvite({
      campaignSlug: req.params.campaignSlug || req.query.campaignSlug,
      token: req.query.token || req.body?.token,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const fieldSuggestions = async (req, res, next) => {
  try {
    const suggestions = require("../services/legacyFreelancerFieldSuggestionsService");
    const field = String(req.query.field || req.query.fieldKey || "").trim();
    const q = String(req.query.q || req.query.query || "").trim();
    const data = await suggestions.getFieldSuggestions(field, q);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const registerLegacy = async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (typeof body.answers === "string") {
      try {
        body.answers = JSON.parse(body.answers);
      } catch (_) {
        /* leave as-is; service will validate */
      }
    }
    if (typeof body.phone === "string" && body.phone.trim().startsWith("{")) {
      try {
        body.phone = JSON.parse(body.phone);
      } catch (_) {
        /* keep string e164 */
      }
    }
    if (typeof body.categories === "string") {
      try {
        body.categories = JSON.parse(body.categories);
      } catch (_) {
        /* keep */
      }
    }
    if (typeof body.signedDocumentTypeIds === "string") {
      try {
        body.signedDocumentTypeIds = JSON.parse(body.signedDocumentTypeIds);
      } catch (_) {
        /* keep */
      }
    }
    if (typeof body.workFields === "string") {
      try {
        body.workFields = JSON.parse(body.workFields);
      } catch (_) {
        /* keep */
      }
    }
    const files = req.files || {};
    const idFront = Array.isArray(files.idFront) ? files.idFront[0] : files.idFront || null;
    const idBack = Array.isArray(files.idBack) ? files.idBack[0] : files.idBack || null;
    const out = await legacyFreelancerInviteService.registerLegacyFreelancer(body, {
      ip: req.ip || req.headers["x-forwarded-for"] || null,
      userAgent: req.headers["user-agent"] || null,
      files: { idFront, idBack },
    });
    return sendAuthSuccess(res, {
      req,
      user: out.user,
      token: out.token,
      message: out.message,
      statusCode: 201,
    });
  } catch (err) {
    return next(err);
  }
};

const getCampaignInviteLink = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.getCampaignInviteLink({
      actorAdminId: actorId(req),
      campaignId: req.params.campaignId,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const getCampaignWorkspace = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.getCampaignWorkspaceStats(req.params.campaignId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const deleteCampaign = async (req, res, next) => {
  try {
    const data = await legacyFreelancerInviteService.deleteOrArchiveCampaign({
      actorAdminId: actorId(req),
      campaignId: req.params.campaignId,
    });
    return res.status(200).json({ success: true, data, message: data.message });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  revokeCampaign,
  regenerateToken,
  listRedemptions,
  exportRedemptionsCsv,
  getContractCatalog,
  getCampaignFields,
  putCampaignFields,
  restoreCampaignFields,
  getRedemptionAnswers,
  previewInvite,
  fieldSuggestions,
  registerLegacy,
  getCampaignInviteLink,
  getCampaignWorkspace,
  deleteCampaign,
};
