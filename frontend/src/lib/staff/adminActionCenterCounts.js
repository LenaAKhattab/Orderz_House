/**
 * Action-center count helpers — Flutter Super Admin parity (no misleading totals).
 */

function unwrapList(res, key) {
  const fromData = res?.data?.[key];
  const direct = res?.[key];
  const list = fromData ?? direct;
  return Array.isArray(list) ? list : [];
}

/** Flutter SuperAdminBidCollection.needsAttention parity (status/outcome fields). */
export function bidCollectionNeedsAttention(collection) {
  if (!collection || typeof collection !== "object") return false;
  if (collection.needsAttention === true || collection.needs_attention === true) return true;

  const s = String(
    collection.status ||
      collection.bidCollectionStatus ||
      collection.bid_collection_status ||
      "",
  )
    .trim()
    .toLowerCase();
  const o = String(
    collection.outcome ||
      collection.bidCollectionOutcome ||
      collection.bid_collection_outcome ||
      "",
  )
    .trim()
    .toLowerCase();
  const thresholdReached =
    collection.thresholdReached === true || collection.threshold_reached === true;

  if (s === "minimum_not_met" || o === "minimum_not_met") return true;
  if (s === "threshold_reached" || s === "eligible_for_assignment") return true;
  if (o === "threshold_reached") return true;
  if (thresholdReached && s !== "assigned") return true;
  return false;
}

function collectionNeedsAttention(row) {
  const collection = row?.bidCollection || row?.bid_collection || null;
  return bidCollectionNeedsAttention(collection);
}

export function countPendingKycIdentity(items) {
  return (Array.isArray(items) ? items : []).filter((row) => {
    const status = String(row?.status || "").trim().toLowerCase();
    return status === "pending_review";
  }).length;
}

export function countPantryAttention({ requestsRes, deliveriesRes } = {}) {
  const requests = unwrapList(requestsRes, "requests");
  let n = 0;
  for (const row of requests) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (collectionNeedsAttention(row) || status === "submitted" || status === "revision_requested") {
      n += 1;
    }
  }
  const deliveries = unwrapList(deliveriesRes, "deliveries");
  for (const row of deliveries) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (status === "submitted" || status === "revision_requested") n += 1;
  }
  return n;
}

export function countArticlesAttention(articlesRes) {
  const articles = unwrapList(articlesRes, "articles");
  return articles.filter((row) => collectionNeedsAttention(row)).length;
}

export function countFeedbackNew(feedbackRes) {
  const summary = feedbackRes?.data?.summary || feedbackRes?.summary || null;
  if (summary && summary.new != null) {
    const n = Number(summary.new);
    return Number.isFinite(n) ? n : 0;
  }
  const items = unwrapList(feedbackRes, "feedback") || unwrapList(feedbackRes, "items");
  return items.filter((row) => String(row?.status || "").trim().toLowerCase() === "new").length;
}

export function countUnreadNotifications(notificationsRes) {
  const items = unwrapList(notificationsRes, "notifications");
  if (!items.length) {
    const unread = notificationsRes?.data?.unreadCount ?? notificationsRes?.unreadCount;
    const n = Number(unread);
    return Number.isFinite(n) ? n : 0;
  }
  return items.filter((n) => n?.isRead === false || n?.is_read === false).length;
}
