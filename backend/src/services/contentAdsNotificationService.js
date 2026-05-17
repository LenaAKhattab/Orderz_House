const notificationEventsService = require("./notificationEventsService");

/**
 * Notify super admins about homepage ad lifecycle (meaningful admin events only).
 * @param {{ action: string, ad: object, actorUserId?: number | null, previous?: { isActive?: boolean } }} p
 */
async function notifyAdLifecycle({ action, ad, actorUserId = null, previous = null }) {
  if (!ad?.id) return;

  const id = Number(ad.id);
  const title = String(ad.title || "إعلان").trim();
  const wasActive = previous?.isActive != null ? Boolean(previous.isActive) : null;
  const isActive = Boolean(ad.isActive);

  let type = "ad.updated";
  let notifTitle = "تحديث إعلان";
  let message = `تم تحديث الإعلان «${title}».`;

  if (action === "created") {
    type = "ad.created";
    notifTitle = "إعلان جديد";
    message = `تم إنشاء إعلان «${title}».`;
  } else if (action === "published" || (wasActive === false && isActive)) {
    type = "ad.published";
    notifTitle = "نشر إعلان";
    message = `تم نشر الإعلان «${title}» على الصفحة الرئيسية.`;
  } else if (action === "unpublished" || (wasActive === true && !isActive)) {
    type = "ad.unpublished";
    notifTitle = "إيقاف إعلان";
    message = `تم إيقاف نشر الإعلان «${title}».`;
  }

  const dedupeKey = `${type}_ad_${id}_${action === "created" ? "new" : Date.now().toString().slice(0, 10)}`;

  await notificationEventsService.notifySuperAdmins(
    {
      actorUserId,
      type,
      title: notifTitle,
      message,
      entityType: "content_ad",
      entityId: id,
      link: "/dashboard/super-admin/ads",
      priority: "medium",
      metadata: { adId: String(id), adTitle: title },
      dedupeKey: action === "created" ? `ad_created_${id}` : undefined,
    },
  );
}

module.exports = {
  notifyAdLifecycle,
};
