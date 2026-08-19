const adminService = require("../services/bildazoAuthorLinkAdminService");
const { BILDAZO_AUTHOR_LINK_ERROR_CODES } = require("../constants/bildazoAuthorLink");

function actorId(req) {
  return req.auth?.userId || req.user?.sub || req.user?.id;
}

async function list(req, res, next) {
  try {
    const data = await adminService.listBildazoAuthorLinks(req.query || {});
    return res.status(200).json({ success: true, schemaReady: true, data });
  } catch (err) {
    if (err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_GATE_SCHEMA_MISSING) {
      return res.status(503).json({
        success: false,
        schemaReady: false,
        message: err.message,
        code: err.publicCode,
        data: { items: [], total: 0, page: 1, limit: 25 },
      });
    }
    return next(err);
  }
}

async function manualLink(req, res, next) {
  try {
    const result = await adminService.manualLinkBildazoAuthor(
      req.params.id,
      req.body || {},
      actorId(req),
    );
    return res.status(200).json({
      success: true,
      data: {
        alreadyLinked: result.alreadyLinked,
        updated: result.updated,
        ...result.link,
      },
    });
  } catch (err) {
    if (err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_GATE_SCHEMA_MISSING) {
      return res.status(503).json({
        success: false,
        schemaReady: false,
        message: err.message,
        code: err.publicCode,
      });
    }
    return next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const result = await adminService.updateBildazoAuthorLinkStatus(
      req.params.id,
      req.body || {},
      actorId(req),
    );
    return res.status(200).json({ success: true, data: result.link });
  } catch (err) {
    if (err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_GATE_SCHEMA_MISSING) {
      return res.status(503).json({
        success: false,
        schemaReady: false,
        message: err.message,
        code: err.publicCode,
      });
    }
    return next(err);
  }
}

module.exports = { list, manualLink, updateStatus };
