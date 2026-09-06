/**
 * Pool-entry notifications for fake/training orders that have become actually visible.
 * Presentation matches normal marketplace "new order" alerts (no training/fake wording).
 *
 * Fan-out runs AFTER visibility commits — never inside the generation advisory lock.
 */

const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");

const DEFAULT_ITEM_BATCH = 25;
const DEFAULT_RECIPIENT_CHUNK = 80;

const FORBIDDEN_CONTENT_RE =
  /وهمي|تدريبي|تجريبي|جولة|fake|training|simulated|simulation|round/i;

function buildPoolEntryNotificationCopy({ categoryName, subcategoryName, orderTitle } = {}) {
  const title = "طلب جديد متاح";
  const order = String(orderTitle || "").trim();
  const category = String(categoryName || "").trim();
  const subcategory = String(subcategoryName || "").trim();

  let message;
  if (category && subcategory && order) {
    message = `طلب جديد في «${category}» — «${subcategory}»: ${order}`;
  } else if (category && order) {
    message = `طلب جديد في «${category}»: ${order}`;
  } else if (order) {
    message = `طلب جديد متاح: ${order}`;
  } else if (category && subcategory) {
    message = `طلب جديد في «${category}» — «${subcategory}»`;
  } else if (category) {
    message = `طلب جديد في «${category}»`;
  } else {
    message = "طلب جديد متاح في الطلبات.";
  }

  return { title, message };
}

function poolVisibleNotificationDedupeKey(roundItemId, userId) {
  return `order_pool_visible_ri${Number(roundItemId)}_u${Number(userId)}`;
}

/**
 * Recipients mirror poolViewerMaySeeFakeOrders (freelancer list audience), not claim/bid gates.
 */
async function listFakeOrderPoolNotificationRecipientIds(client) {
  const runner = client || pool;
  const { rows: srows } = await runner.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
  const s = srows[0];
  if (!s || s.training_orders_enabled !== true) return [];

  const showAll = Boolean(s.show_to_all_visitors) || Boolean(s.show_to_all_freelancers);
  if (showAll) {
    return notificationEventsService.getRoleUserIds(["freelancer"], runner);
  }

  const { rows } = await runner.query(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id
     INNER JOIN fake_order_settings_plans sp ON sp.plan_id = fs.plan_id
     WHERE u.is_active = TRUE
       AND (
         u.role = 'freelancer'
         OR r.name = 'freelancer'
       )
       AND fs.is_current = TRUE
       AND fs.status IN ('active', 'assigned_not_started')`,
  );
  return rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
}

async function loadDueVisibleUndispatchedRoundItems(runner, { limit = DEFAULT_ITEM_BATCH } = {}) {
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || DEFAULT_ITEM_BATCH)));
  const { rows } = await runner.query(
    `SELECT
       ri.id AS round_item_id,
       ri.fake_order_id,
       fo.title AS order_title,
       c.name AS category_name,
       sc.name AS subcategory_name
     FROM fake_order_round_items ri
     INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
     INNER JOIN fake_orders fo ON fo.id = ri.fake_order_id
     LEFT JOIN categories c ON c.id = fo.category_id
     LEFT JOIN subcategories sc ON sc.id = fo.subcategory_id
     WHERE ri.pool_notification_dispatched_at IS NULL
       AND ri.status = 'active'
       AND fr.status = 'active'
       AND ri.visible_from <= NOW()
       AND ri.visible_until > NOW()
       AND fo.fake_status = 'active'
       AND fo.is_published = TRUE
       AND fo.is_open_for_pool = TRUE
       AND fo.assigned_freelancer_id IS NULL
       AND fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
       AND (SELECT training_orders_enabled FROM fake_order_settings WHERE id = 1) = TRUE
     ORDER BY ri.visible_from ASC, ri.id ASC
     LIMIT $1`,
    [lim],
  );
  return rows.map((r) => ({
    roundItemId: Number(r.round_item_id),
    fakeOrderId: Number(r.fake_order_id),
    orderTitle: r.order_title || "",
    categoryName: r.category_name || null,
    subcategoryName: r.subcategory_name || null,
  }));
}

async function markRoundItemPoolNotificationDispatched(runner, roundItemId) {
  await runner.query(
    `UPDATE fake_order_round_items
     SET pool_notification_dispatched_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND pool_notification_dispatched_at IS NULL`,
    [Number(roundItemId)],
  );
}

async function notifyRecipientsForRoundItem(item, recipientIds, { chunkSize = DEFAULT_RECIPIENT_CHUNK } = {}) {
  const oid = Number(item.fakeOrderId);
  const rid = Number(item.roundItemId);
  const { title, message } = buildPoolEntryNotificationCopy({
    categoryName: item.categoryName,
    subcategoryName: item.subcategoryName,
    orderTitle: item.orderTitle,
  });

  const link = `/dashboard/freelancer/orders/${encodeURIComponent(String(oid))}`;
  const metadata = {
    orderId: String(oid),
    projectName: String(item.orderTitle || "").trim() || undefined,
    categoryName: item.categoryName ? String(item.categoryName) : undefined,
    subcategoryName: item.subcategoryName ? String(item.subcategoryName) : undefined,
  };
  Object.keys(metadata).forEach((k) => {
    if (metadata[k] === undefined) delete metadata[k];
  });

  const chunk = Math.min(200, Math.max(10, Math.floor(Number(chunkSize) || DEFAULT_RECIPIENT_CHUNK)));
  let notifiedOrDeduped = 0;
  let failed = 0;

  // Sequential recipient chunks — avoid unbounded Promise.all fan-out.
  for (let i = 0; i < recipientIds.length; i += chunk) {
    const slice = recipientIds.slice(i, i + chunk);
    try {
      // eslint-disable-next-line no-await-in-loop
      await notificationEventsService.notifyUsers({
        userIds: slice,
        recipientRole: "freelancer",
        actorUserId: null,
        type: "order.created",
        title,
        message,
        entityType: "order",
        entityId: oid,
        link,
        priority: "medium",
        metadata,
        // notifyUsers appends `_u{userId}` → order_pool_visible_ri{id}_u{uid}
        dedupeKey: `order_pool_visible_ri${rid}`,
      });
      notifiedOrDeduped += slice.length;
    } catch (err) {
      failed += slice.length;
      // eslint-disable-next-line no-console
      console.error("[fakeOrderPoolNotify] recipient chunk failed", {
        roundItemId: rid,
        fakeOrderId: oid,
        chunkSize: slice.length,
        message: err?.message || err,
      });
    }
  }

  return { notifiedOrDeduped, failed, title, message };
}

/**
 * Central dispatcher: currently visible round items with null dispatch timestamp.
 * Safe to call repeatedly (dedupe keys + dispatch stamp).
 */
async function dispatchNewlyVisibleFakeOrderNotifications(options = {}) {
  const itemLimit = options.itemLimit != null ? Number(options.itemLimit) : DEFAULT_ITEM_BATCH;
  const recipientChunkSize = options.recipientChunkSize;
  const runner = options.client || pool;

  let items;
  try {
    items = await loadDueVisibleUndispatchedRoundItems(runner, { limit: itemLimit });
  } catch (err) {
    // Column may be missing before migration — fail soft.
    if (String(err?.message || "").includes("pool_notification_dispatched_at")) {
      // eslint-disable-next-line no-console
      console.warn("[fakeOrderPoolNotify] column missing — run migration 121");
      return { ok: false, code: "MIGRATION_REQUIRED", processed: 0 };
    }
    throw err;
  }

  if (!items.length) {
    return { ok: true, processed: 0, marked: 0, recipientCount: 0 };
  }

  const recipientIds = await listFakeOrderPoolNotificationRecipientIds(runner);
  let marked = 0;
  let failedItems = 0;

  for (const item of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await notifyRecipientsForRoundItem(item, recipientIds, { chunkSize: recipientChunkSize });
      if (result.failed > 0 && result.notifiedOrDeduped < recipientIds.length) {
        // Leave undispatched so remaining recipients can be attempted on retry.
        // Recipients that already got rows are protected by dedupe_key.
        failedItems += 1;
        // eslint-disable-next-line no-console
        console.warn("[fakeOrderPoolNotify] partial fan-out; leaving undispatched", {
          roundItemId: item.roundItemId,
          failed: result.failed,
          ok: result.notifiedOrDeduped,
          recipients: recipientIds.length,
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await markRoundItemPoolNotificationDispatched(runner, item.roundItemId);
      marked += 1;
    } catch (err) {
      failedItems += 1;
      // eslint-disable-next-line no-console
      console.error("[fakeOrderPoolNotify] item failed", {
        roundItemId: item.roundItemId,
        message: err?.message || err,
      });
    }
  }

  return {
    ok: failedItems === 0,
    processed: items.length,
    marked,
    failedItems,
    recipientCount: recipientIds.length,
  };
}

/**
 * Fire-and-forget after visibility COMMIT (never hold generation lock).
 */
function scheduleDispatchNewlyVisibleFakeOrderNotifications(options = {}) {
  setImmediate(() => {
    void dispatchNewlyVisibleFakeOrderNotifications(options).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[fakeOrderPoolNotify] dispatch failed", err?.message || err);
    });
  });
}

module.exports = {
  buildPoolEntryNotificationCopy,
  poolVisibleNotificationDedupeKey,
  listFakeOrderPoolNotificationRecipientIds,
  loadDueVisibleUndispatchedRoundItems,
  dispatchNewlyVisibleFakeOrderNotifications,
  scheduleDispatchNewlyVisibleFakeOrderNotifications,
  FORBIDDEN_CONTENT_RE,
  DEFAULT_ITEM_BATCH,
  DEFAULT_RECIPIENT_CHUNK,
};
