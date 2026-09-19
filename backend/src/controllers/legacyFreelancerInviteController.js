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
      maxRedemptions: req.body.maxRedemptions ?? req.body.max_redemptions,
      expiresAt: req.body.expiresAt ?? req.body.expires_at,
      defaultPlanCode: req.body.defaultPlanCode ?? req.body.default_plan_code,
      defaultTrustLevel: req.body.defaultTrustLevel ?? req.body.default_trust_level,
      defaultCategoryId: req.body.defaultCategoryId ?? req.body.default_category_id,
      notes: req.body.notes,
      isActive: req.body.isActive ?? req.body.is_active,
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
    const header = ["userId", "accountId", "fullName", "emailMasked", "phoneMasked", "identityLast4", "internalReference", "redeemedAt"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.userId,
          r.accountId,
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

const registerLegacy = async (req, res, next) => {
  try {
    const out = await legacyFreelancerInviteService.registerLegacyFreelancer(req.body, {
      ip: req.ip || req.headers["x-forwarded-for"] || null,
      userAgent: req.headers["user-agent"] || null,
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

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  revokeCampaign,
  regenerateToken,
  listRedemptions,
  exportRedemptionsCsv,
  previewInvite,
  registerLegacy,
};
