const notificationService = require("../services/notificationService");

function viewerRole(req) {
  return req.auth?.primaryRole || req.auth?.role || null;
}

async function listMyNotifications(req, res, next) {
  try {
    const data = await notificationService.getUserNotifications(
      req.auth.userId,
      {
        limit: req.query.limit,
        offset: req.query.offset,
        isRead: req.query.isRead,
        type: req.query.type,
        entityType: req.query.entityType,
      },
      undefined,
      viewerRole(req),
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getMyUnreadCount(req, res, next) {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.auth.userId);
    return res.status(200).json({ success: true, data: { unreadCount } });
  } catch (err) {
    return next(err);
  }
}

async function readNotification(req, res, next) {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.auth.userId, undefined, viewerRole(req));
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    return res.status(200).json({ success: true, data: { notification } });
  } catch (err) {
    return next(err);
  }
}

async function readAllNotifications(req, res, next) {
  try {
    const out = await notificationService.markAllAsRead(req.auth.userId);
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listMyNotifications,
  getMyUnreadCount,
  readNotification,
  readAllNotifications,
};
