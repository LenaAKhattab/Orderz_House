const notificationService = require("./notificationService");

const STATUS_COPY = {
  activated: {
    type: "user.account.activated",
    title: "تم تفعيل حسابك",
    message: "تم تفعيل حسابك ويمكنك الآن استخدام المنصة.",
    priority: "high",
  },
  deactivated: {
    type: "user.account.deactivated",
    title: "تم تعطيل حسابك",
    message: "تم تعطيل حسابك. تواصل مع الدعم إذا كنت تعتقد أن هذا خطأ.",
    priority: "critical",
  },
  suspended: {
    type: "user.account.suspended",
    title: "تم تعليق حسابك",
    message: "تم تعليق حسابك مؤقتاً. تواصل مع الدعم للمزيد من المعلومات.",
    priority: "critical",
  },
  reactivated: {
    type: "user.account.reactivated",
    title: "تم إعادة تفعيل حسابك",
    message: "مرحباً بعودتك! تم إعادة تفعيل حسابك.",
    priority: "high",
  },
};

/**
 * Notify a user when their account status changes (activation / deactivation / suspension).
 * @param {{ userId: number, role?: string | null, status: keyof STATUS_COPY, actorUserId?: number | null }} p
 */
async function notifyAccountStatusChange({ userId, role = null, status, actorUserId = null }) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  const copy = STATUS_COPY[status];
  if (!copy) return null;

  const dedupeKey = `user_account_${status}_${uid}_${Date.now().toString().slice(0, 10)}`;

  return notificationService.createIfNotExists(
    {
      recipientUserId: uid,
      recipientRole: role ? String(role).trim() : null,
      actorUserId: actorUserId != null ? Number(actorUserId) : null,
      type: copy.type,
      title: copy.title,
      message: copy.message,
      entityType: "user",
      entityId: uid,
      link: "/dashboard",
      priority: copy.priority,
      metadata: { status },
      dedupeKey,
    },
    dedupeKey,
  );
}

module.exports = {
  notifyAccountStatusChange,
};
