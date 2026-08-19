const bildazoAuthorLinkService = require("../services/bildazoAuthorLinkService");

function freelancerId(req) {
  return req.auth?.userId || req.user?.sub || req.user?.id;
}

async function getMe(req, res, next) {
  try {
    const data = await bildazoAuthorLinkService.getMyBildazoAuthorLink(freelancerId(req));
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function submitRequest(req, res, next) {
  try {
    const result = await bildazoAuthorLinkService.submitBildazoAuthorLinkRequest(
      freelancerId(req),
      req.body || {},
    );
    const status = result.alreadyLinked ? 200 : 201;
    return res.status(status).json({
      success: true,
      data: {
        alreadyLinked: result.alreadyLinked,
        ...result.link,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function changeLinked(req, res, next) {
  try {
    const result = await bildazoAuthorLinkService.changeBildazoAuthorLink(
      freelancerId(req),
      req.body || {},
    );
    return res.status(200).json({
      success: true,
      data: {
        changed: Boolean(result.changed),
        ...(result.failureCode ? { failureCode: result.failureCode } : {}),
        ...result.link,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMe, submitRequest, changeLinked };
