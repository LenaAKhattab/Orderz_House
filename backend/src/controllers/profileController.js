const authService = require("../services/authService");
const profileService = require("../services/profileService");
const notificationService = require("../services/notificationService");
const profileStatsService = require("../services/profileStatsService");
const subscriptionsService = require("../services/subscriptionsService");
const { uploadAvatarBuffer, destroyByPublicId } = require("../services/cloudinaryUploadService");
const { ROLES } = require("../constants/roles");
const { createPublicApiError } = require("../utils/publicApiError");

const getProfileMe = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const legacyRole = req.auth.legacyRole;
    const user = await authService.getPublicUserById(userId);
    const stats = await profileStatsService.getDashboardStats(userId, legacyRole);
    let subscription = null;
    if (legacyRole === ROLES.FREELANCER) {
      subscription = await subscriptionsService.getCurrentSubscriptionForFreelancer(userId);
    }
    return res.status(200).json({ success: true, data: { user, stats, subscription } });
  } catch (err) {
    return next(err);
  }
};

const patchProfile = async (req, res, next) => {
  try {
    await profileService.patchUserProfile(req.auth.userId, req.auth.legacyRole, req.body || {});
    const user = await authService.getPublicUserById(req.auth.userId);
    return res.status(200).json({ success: true, message: "تم حفظ التغييرات.", data: { user } });
  } catch (err) {
    return next(err);
  }
};

const patchNotificationPreferences = async (req, res, next) => {
  try {
    const body = { notificationPreferences: req.body || {} };
    await profileService.patchUserProfile(req.auth.userId, req.auth.legacyRole, body);
    const user = await authService.getPublicUserById(req.auth.userId);
    return res.status(200).json({ success: true, message: "تم تحديث تفضيلات الإشعارات.", data: { user } });
  } catch (err) {
    return next(err);
  }
};

const patchPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    await authService.changePasswordForUser(req.auth.userId, currentPassword, newPassword);
    return res.status(200).json({ success: true, message: "تم تحديث كلمة المرور." });
  } catch (err) {
    return next(err);
  }
};

const patchAvatar = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      throw createPublicApiError("لم يتم اختيار صورة.", 400, "VALIDATION_ERROR");
    }
    const row = await authService.findUserById(req.auth.userId);
    if (row?.avatar_public_id) {
      await destroyByPublicId(row.avatar_public_id);
    }
    const out = await uploadAvatarBuffer({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      userId: req.auth.userId,
    });
    await profileService.setAvatar(req.auth.userId, { secureUrl: out.secureUrl, publicId: out.publicId });
    const user = await authService.getPublicUserById(req.auth.userId);
    return res.status(200).json({ success: true, message: "تم تحديث صورة الملف الشخصي.", data: { user } });
  } catch (err) {
    return next(err);
  }
};

const deleteAvatar = async (req, res, next) => {
  try {
    const row = await authService.findUserById(req.auth.userId);
    if (row?.avatar_public_id) {
      await destroyByPublicId(row.avatar_public_id);
    }
    await profileService.clearAvatar(req.auth.userId);
    const user = await authService.getPublicUserById(req.auth.userId);
    return res.status(200).json({ success: true, message: "تمت إزالة الصورة.", data: { user } });
  } catch (err) {
    return next(err);
  }
};

const patchBrowserNotifications = async (req, res, next) => {
  try {
    const status = req.body?.status;
    await profileService.patchBrowserNotificationStatus(req.auth.userId, status);
    const user = await authService.getPublicUserById(req.auth.userId);
    return res.status(200).json({ success: true, message: "تم تحديث إعدادات إشعارات المتصفح.", data: { user } });
  } catch (err) {
    return next(err);
  }
};

const postBrowserNotificationTest = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const role = req.auth.primaryRole || req.auth.legacyRole || null;
    const n = await notificationService.createNotification({
      recipientUserId: Number(userId),
      recipientRole: role,
      type: "general.test",
      title: "إشعار تجريبي",
      message: "هذا إشعار تجريبي للتأكد من عمل إشعارات المتصفح والموقع.",
      entityType: "system",
      entityId: null,
      link: "/dashboard",
      priority: "low",
      metadata: { test: true },
      dedupeKey: `browser_test_${userId}_${Date.now()}`,
    });
    return res.status(200).json({
      success: true,
      message: "تم إرسال إشعار تجريبي.",
      data: { notification: n },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getProfileMe,
  patchProfile,
  patchNotificationPreferences,
  patchBrowserNotifications,
  postBrowserNotificationTest,
  patchPassword,
  patchAvatar,
  deleteAvatar,
};
