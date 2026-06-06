const publicPageViewService = require("../services/publicPageViewService");

async function recordPageView(req, res, next) {
  try {
    const body = req.body || {};
    const userId = req.user?.sub ?? req.user?.id ?? req.user?.userId ?? null;

    const result = await publicPageViewService.recordPageView({
      path: body.path,
      title: body.title,
      referrer: body.referrer,
      idempotencyKey: body.idempotencyKey,
      clientSessionId: body.clientSessionId,
      userId,
    });

    return res.status(200).json({
      success: true,
      data: {
        recorded: result.recorded,
        totalCount: result.totalCount,
        activeUsersLast7Days: result.activeUsersLast7Days,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  recordPageView,
};
