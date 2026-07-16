const rateLimitExemptionsService = require("../services/rateLimitExemptionsService");

async function listExemptions(req, res, next) {
  try {
    const includeInactive =
      req.query.includeInactive === "1" ||
      req.query.includeInactive === "true" ||
      req.query.all === "1";
    const userId = req.query.userId || null;
    const data = await rateLimitExemptionsService.listExemptions({ includeInactive, userId });
    return res.status(200).json({
      success: true,
      data: {
        exemptions: data,
        allowedScopes: rateLimitExemptionsService.ALLOWED_SCOPES,
        allowedModes: rateLimitExemptionsService.ALLOWED_MODES,
        forbiddenScopes: rateLimitExemptionsService.FORBIDDEN_SCOPES,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function searchUsers(req, res, next) {
  try {
    const users = await rateLimitExemptionsService.searchUsersForExemption(req.query.q || "");
    return res.status(200).json({ success: true, data: { users } });
  } catch (err) {
    return next(err);
  }
}

async function createExemption(req, res, next) {
  try {
    const data = await rateLimitExemptionsService.createExemption(req.body || {}, req.auth.userId);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function updateExemption(req, res, next) {
  try {
    const data = await rateLimitExemptionsService.updateExemption(
      req.params.id,
      req.body || {},
      req.auth.userId,
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function revokeExemption(req, res, next) {
  try {
    const data = await rateLimitExemptionsService.revokeExemption(req.params.id, req.auth.userId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listExemptions,
  searchUsers,
  createExemption,
  updateExemption,
  revokeExemption,
};
