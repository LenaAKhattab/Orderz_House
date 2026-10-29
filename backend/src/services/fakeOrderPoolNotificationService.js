/**
 * Pool-entry notifications for fake/training orders that have become actually visible.
 *
 * One summary notification per eligible freelancer per training round (not one per order): the first
 * dispatch that finds visible, undispatched items of a round notifies with the round's committed visible
 * count; later stagger batches of the same round are marked dispatched without notifying (the marketplace
 * list refreshes on its own). Training wording is used only when the round shows the training badge to
 * freelancers; otherwise the copy stays neutral (no training/fake wording).
 *
 * Fan-out runs AFTER visibility commits — never inside the generation advisory lock.
 */

const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");

const DEFAULT_ITEM_BATCH = 25;
const DEFAULT_RECIPIENT_CHUNK = 200;

const POOL_SUMMARY_NOTIFICATION_TYPE = "order.pool.summary";
const POOL_SUMMARY_LINK = "/dashboard/freelancer/orders";

const FORBIDDEN_CONTENT_RE =
  /وهمي|تدريبي|تجريبي|جولة|fake|training|simulated|simulation|round/i;

const AR_PLURAL = new Intl.PluralRules("ar");

/** Arabic count phrase with number agreement (1, 2, 3–10, 11–99, 100+ forms). */
function arabicOrdersCountPhrase(count, training) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  switch (AR_PLURAL.select(n)) {
    case "one":
      return training ? "طلب تدريبي جديد واحد مناسب لك" : "طلب جديد واحد مناسب لك";
    case "two":
      return training ? "طلبان تدريبيان جديدان مناسبان لك" : "طلبان جديدان مناسبان لك";
    case "few":
      return training ? `${n} طلبات تدريبية جديدة مناسبة لك` : `${n} طلبات جديدة مناسبة لك`;
    case "many":
      return training ? `${n} طلبًا تدريبيًا جديدًا مناسبًا لك` : `${n} طلبًا جديدًا مناسبًا لك`;
    default:
      return training ? `${n} طلب تدريبي جديد مناسب لك` : `${n} طلب جديد مناسب لك`;
  }
}

/**
 * Summary copy for one training round. Arabic is stored in title/message; English travels in metadata
 * (titleEn/messageEn) for English-locale clients. Never includes round ids or order titles.
 */
function buildPoolSummaryNotificationCopy({ count, showTrainingBadge = false } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 0));
  const training = Boolean(showTrainingBadge);
  const kindEn = training ? "training orders" : "orders";
  return {
    title: training ? "تمت إضافة مجموعة جديدة من الطلبات التدريبية" : "تمت إضافة مجموعة جديدة من الطلبات",
    message: `يتوفر الآن ${arabicOrdersCountPhrase(n, training)}.`,
    titleEn: `A new batch of ${kindEn} was added`,
    messageEn:
      n === 1
        ? `1 new ${training ? "training order" : "order"} suitable for you is now available.`
        : `${n} new ${kindEn} suitable for you are now available.`,
  };
}

/** Base key; notifyUsersDeduped appends `_u{userId}` → one row per recipient per round. */
function poolRoundSummaryDedupeBase(roundId) {
  return `pool_round_summary_r${Number(roundId)}`;
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

/** Shared "listed in the marketplace right now" predicate for round items (ri / fr / fo aliases). */
const VISIBLE_ROUND_ITEM_WHERE_SQL = `ri.status = 'active'
       AND fr.status = 'active'
       AND ri.visible_from <= NOW()
       AND ri.visible_until > NOW()
       AND fo.fake_status = 'active'
       AND fo.is_published = TRUE
       AND fo.is_open_for_pool = TRUE
       AND fo.assigned_freelancer_id IS NULL
       AND fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')`;

async function loadDueVisibleUndispatchedRoundItems(runner, { limit = DEFAULT_ITEM_BATCH } = {}) {
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || DEFAULT_ITEM_BATCH)));
  const { rows } = await runner.query(
    `SELECT
       ri.id AS round_item_id,
       ri.round_id,
       ri.fake_order_id,
       fr.show_fake_badge_to_freelancers AS show_training_badge
     FROM fake_order_round_items ri
     INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
     INNER JOIN fake_orders fo ON fo.id = ri.fake_order_id
     WHERE ri.pool_notification_dispatched_at IS NULL
       AND ${VISIBLE_ROUND_ITEM_WHERE_SQL}
       AND (SELECT training_orders_enabled FROM fake_order_settings WHERE id = 1) = TRUE
     ORDER BY ri.visible_from ASC, ri.id ASC
     LIMIT $1`,
    [lim],
  );
  return rows.map((r) => ({
    roundItemId: Number(r.round_item_id),
    roundId: Number(r.round_id),
    fakeOrderId: Number(r.fake_order_id),
    showTrainingBadge: r.show_training_badge === true,
  }));
}

/** True once any item of the round was dispatched — its summary already went out (or predates summaries). */
async function roundSummaryAlreadyDispatched(runner, roundId) {
  const { rows } = await runner.query(
    `SELECT EXISTS (
       SELECT 1 FROM fake_order_round_items
       WHERE round_id = $1 AND pool_notification_dispatched_at IS NOT NULL
     ) AS dispatched`,
    [Number(roundId)],
  );
  return rows[0]?.dispatched === true;
}

/** Committed, currently listed orders of the round — the number the summary announces. */
async function countRoundVisibleCommittedItems(runner, roundId) {
  const { rows } = await runner.query(
    `SELECT COUNT(*)::int AS c
     FROM fake_order_round_items ri
     INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
     INNER JOIN fake_orders fo ON fo.id = ri.fake_order_id
     WHERE ri.round_id = $1
       AND ${VISIBLE_ROUND_ITEM_WHERE_SQL}`,
    [Number(roundId)],
  );
  return Number(rows[0]?.c) || 0;
}

async function markRoundItemsPoolNotificationDispatched(runner, roundItemIds) {
  const ids = roundItemIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return 0;
  const { rowCount } = await runner.query(
    `UPDATE fake_order_round_items
     SET pool_notification_dispatched_at = NOW(),
         updated_at = NOW()
     WHERE id = ANY($1::bigint[])
       AND pool_notification_dispatched_at IS NULL`,
    [ids],
  );
  return Number(rowCount) || 0;
}

async function notifyRecipientsForRoundSummary(round, recipientIds, runner, { chunkSize = DEFAULT_RECIPIENT_CHUNK } = {}) {
  const { title, message, titleEn, messageEn } = buildPoolSummaryNotificationCopy({
    count: round.visibleCount,
    showTrainingBadge: round.showTrainingBadge,
  });
  const chunk = Math.min(500, Math.max(10, Math.floor(Number(chunkSize) || DEFAULT_RECIPIENT_CHUNK)));
  let created = 0;
  let failed = 0;

  // Sequential recipient chunks; each chunk is one multi-row insert (ON CONFLICT dedupe → no duplicate push).
  for (let i = 0; i < recipientIds.length; i += chunk) {
    const slice = recipientIds.slice(i, i + chunk);
    try {
      // eslint-disable-next-line no-await-in-loop
      const rows = await notificationEventsService.notifyUsersDeduped(
        {
          userIds: slice,
          recipientRole: "freelancer",
          actorUserId: null,
          type: POOL_SUMMARY_NOTIFICATION_TYPE,
          title,
          message,
          entityType: "marketplace",
          entityId: null,
          link: POOL_SUMMARY_LINK,
          priority: "medium",
          metadata: { visibleCount: round.visibleCount, titleEn, messageEn },
          dedupeKey: poolRoundSummaryDedupeBase(round.roundId),
        },
        runner,
      );
      created += Array.isArray(rows) ? rows.length : 0;
    } catch (err) {
      failed += slice.length;
      // eslint-disable-next-line no-console
      console.error("[fakeOrderPoolNotify] summary recipient chunk failed", {
        roundId: round.roundId,
        chunkSize: slice.length,
        message: err?.message || err,
      });
    }
  }

  return { created, failed };
}

/**
 * Central dispatcher: currently visible round items with null dispatch timestamp, grouped by round.
 * Safe to call repeatedly and concurrently (per-recipient dedupe keys + dispatch stamp).
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
    return { ok: true, processed: 0, marked: 0, summarizedRounds: 0, silentRounds: 0, summaryRows: 0, recipientCount: 0 };
  }

  const rounds = new Map();
  for (const item of items) {
    if (!rounds.has(item.roundId)) {
      rounds.set(item.roundId, { roundId: item.roundId, showTrainingBadge: item.showTrainingBadge, itemIds: [] });
    }
    rounds.get(item.roundId).itemIds.push(item.roundItemId);
  }

  let recipientIds = null;
  let marked = 0;
  let failedItems = 0;
  let summarizedRounds = 0;
  let silentRounds = 0;
  let summaryRows = 0;

  for (const round of rounds.values()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await roundSummaryAlreadyDispatched(runner, round.roundId)) {
        // Later stagger batch of an announced round: no new notification.
        // eslint-disable-next-line no-await-in-loop
        marked += await markRoundItemsPoolNotificationDispatched(runner, round.itemIds);
        silentRounds += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const visibleCount = await countRoundVisibleCommittedItems(runner, round.roundId);
      if (visibleCount < 1) continue;
      // eslint-disable-next-line no-await-in-loop
      if (!recipientIds) recipientIds = await listFakeOrderPoolNotificationRecipientIds(runner);
      // eslint-disable-next-line no-await-in-loop
      const result = await notifyRecipientsForRoundSummary({ ...round, visibleCount }, recipientIds, runner, {
        chunkSize: recipientChunkSize,
      });
      summaryRows += result.created;
      if (result.failed > 0) {
        // Leave undispatched so remaining recipients are attempted on retry.
        // Recipients that already got the summary are protected by dedupe_key.
        failedItems += round.itemIds.length;
        // eslint-disable-next-line no-console
        console.warn("[fakeOrderPoolNotify] partial summary fan-out; leaving undispatched", {
          roundId: round.roundId,
          failed: result.failed,
          recipients: recipientIds.length,
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      marked += await markRoundItemsPoolNotificationDispatched(runner, round.itemIds);
      summarizedRounds += 1;
    } catch (err) {
      failedItems += round.itemIds.length;
      // eslint-disable-next-line no-console
      console.error("[fakeOrderPoolNotify] round failed", {
        roundId: round.roundId,
        message: err?.message || err,
      });
    }
  }

  return {
    ok: failedItems === 0,
    processed: items.length,
    marked,
    failedItems,
    summarizedRounds,
    silentRounds,
    summaryRows,
    recipientCount: recipientIds ? recipientIds.length : 0,
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
  buildPoolSummaryNotificationCopy,
  poolRoundSummaryDedupeBase,
  listFakeOrderPoolNotificationRecipientIds,
  loadDueVisibleUndispatchedRoundItems,
  countRoundVisibleCommittedItems,
  dispatchNewlyVisibleFakeOrderNotifications,
  scheduleDispatchNewlyVisibleFakeOrderNotifications,
  FORBIDDEN_CONTENT_RE,
  POOL_SUMMARY_NOTIFICATION_TYPE,
  POOL_SUMMARY_LINK,
  DEFAULT_ITEM_BATCH,
  DEFAULT_RECIPIENT_CHUNK,
};
