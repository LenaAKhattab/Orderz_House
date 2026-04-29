const path = require("node:path");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");
const notificationService = require("../src/services/notificationService");

function randTag() {
  return `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function makeToken(userId, role, email) {
  const secret = process.env.JWT_SECRET;
  return jwt.sign({ sub: String(userId), role, email }, secret, { expiresIn: "1h" });
}

async function api(pathname, token, options = {}) {
  const res = await fetch(`http://localhost:5000${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function existsTableAndIndexes() {
  const table = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'notifications'
     LIMIT 1`,
  );
  const indexes = await pool.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'notifications'`,
  );
  return {
    tableExists: table.rowCount === 1,
    indexNames: indexes.rows.map((r) => r.indexname),
  };
}

async function dedupeConstraintExists() {
  const q = await pool.query(
    `SELECT i.relname AS index_name
     FROM pg_class t
     JOIN pg_index ix ON ix.indrelid = t.oid
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'notifications'
       AND i.relname = 'uq_notifications_dedupe_key'
       AND ix.indisunique = TRUE`,
  );
  return q.rowCount === 1;
}

async function main() {
  const results = [];
  const touchedUserIds = [];
  let ownNotificationId = null;
  let otherNotificationId = null;

  const record = (name, pass, details = "") => {
    results.push({ name, pass, details });
  };

  try {
    const tableMeta = await existsTableAndIndexes();
    const idx = new Set(tableMeta.indexNames);
    record(
      "migration + table/indexes",
      tableMeta.tableExists &&
        idx.has("idx_notifications_recipient_read_created") &&
        idx.has("idx_notifications_type_created") &&
        idx.has("idx_notifications_entity"),
      JSON.stringify(tableMeta),
    );

    record("dedupe unique constraint exists", await dedupeConstraintExists(), "uq_notifications_dedupe_key");

    const usersRes = await pool.query(
      `SELECT id, email, role
       FROM users
       WHERE role = 'client'
         AND is_active = TRUE
       ORDER BY id ASC
       LIMIT 2`,
    );
    if (usersRes.rowCount < 2) {
      throw new Error("Need at least two active client users for API security checks.");
    }
    const [u1, u2] = usersRes.rows;
    touchedUserIds.push(Number(u1.id), Number(u2.id));
    const token1 = makeToken(u1.id, u1.role, u1.email);
    const token2 = makeToken(u2.id, u2.role, u2.email);

    // 1) Payment success creates one notification
    const ps = await notificationService.createIfNotExists(
      {
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "payment.client_order.succeeded",
        title: "تم الدفع بنجاح",
        message: "mock success",
        entityType: "order",
        entityId: 910001,
        priority: "critical",
        metadata: { source: "mock_test" },
      },
      "payment_success_910001",
    );
    const psCount = await pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE dedupe_key = 'payment_success_910001'`);
    record("payment success creates one notification", Boolean(ps?.id) && Number(psCount.rows[0].c) === 1, `count=${psCount.rows[0].c}`);

    // 2) Payment failure creates one notification
    const pf = await notificationService.createIfNotExists(
      {
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "payment.client_order.failed",
        title: "فشل الدفع",
        message: "mock failed",
        entityType: "order",
        entityId: 910002,
        priority: "high",
        metadata: { source: "mock_test" },
      },
      "payment_failed_910002",
    );
    const pfCount = await pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE dedupe_key = 'payment_failed_910002'`);
    record("payment failure creates one notification", Boolean(pf?.id) && Number(pfCount.rows[0].c) === 1, `count=${pfCount.rows[0].c}`);

    // 3) Duplicate webhook does not duplicate
    await notificationService.createIfNotExists(
      {
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "payment.client_order.succeeded",
        title: "dup",
        message: "dup",
        entityType: "order",
        entityId: 910003,
        priority: "critical",
      },
      "payment_success_910003",
    );
    await notificationService.createIfNotExists(
      {
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "payment.client_order.succeeded",
        title: "dup",
        message: "dup",
        entityType: "order",
        entityId: 910003,
        priority: "critical",
      },
      "payment_success_910003",
    );
    const dupWebhookCount = await pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE dedupe_key = 'payment_success_910003'`);
    record("duplicate webhook does NOT create duplicate", Number(dupWebhookCount.rows[0].c) === 1, `count=${dupWebhookCount.rows[0].c}`);

    // 4) webhook + confirm overlap does not duplicate
    await notificationService.createIfNotExists(
      {
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "payment.client_order.succeeded",
        title: "webhook",
        message: "webhook source",
        entityType: "order",
        entityId: 910004,
        priority: "critical",
        metadata: { source: "stripe_webhook" },
      },
      "payment_success_910004",
    );
    await notificationService.createIfNotExists(
      {
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "payment.client_order.succeeded",
        title: "confirm",
        message: "confirm source",
        entityType: "order",
        entityId: 910004,
        priority: "critical",
        metadata: { source: "confirm_endpoint" },
      },
      "payment_success_910004",
    );
    const overlapCount = await pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE dedupe_key = 'payment_success_910004'`);
    record("webhook + confirm overlap does NOT duplicate", Number(overlapCount.rows[0].c) === 1, `count=${overlapCount.rows[0].c}`);

    // 5) assignment notification (mock/service-level)
    const asn = await notificationService.createIfNotExists(
      {
        recipientUserId: Number(u2.id),
        recipientRole: "freelancer",
        actorUserId: Number(u1.id),
        type: "order.freelancer.assigned",
        title: "assignment",
        message: "assigned",
        entityType: "order",
        entityId: 910005,
        priority: "high",
      },
      "freelancer_assigned_910005",
    );
    record("admin/client accepts freelancer -> assignment notification", Boolean(asn?.id), `notificationId=${asn?.id || "none"} (mock/service-level)`);

    // 6) revision notification (mock/service-level)
    const rev = await notificationService.createNotification({
      recipientUserId: Number(u2.id),
      recipientRole: "freelancer",
      actorUserId: Number(u1.id),
      type: "order.revision.requested",
      title: "revision",
      message: "please revise",
      entityType: "order",
      entityId: 910006,
      priority: "high",
      metadata: { source: "mock_test" },
    });
    record("admin/client requests revision -> freelancer gets revision notification", Boolean(rev?.id), `notificationId=${rev?.id || "none"} (mock/service-level)`);

    ownNotificationId = Number(ps.id);
    otherNotificationId = Number(asn.id);

    // 7) Notification API
    const listRes = await api("/api/notifications?limit=20&offset=0", token1, { method: "GET" });
    const unreadRes = await api("/api/notifications/unread-count", token1, { method: "GET" });
    const readOneRes = await api(`/api/notifications/${ownNotificationId}/read`, token1, { method: "POST", body: "{}" });
    const readAllRes = await api("/api/notifications/read-all", token1, { method: "POST", body: "{}" });

    const apiOk =
      listRes.status === 200 &&
      unreadRes.status === 200 &&
      readOneRes.status === 200 &&
      readAllRes.status === 200 &&
      Array.isArray(listRes.json?.data?.notifications) &&
      typeof unreadRes.json?.data?.unreadCount === "number";
    record(
      "notification API endpoints work",
      apiOk,
      `statuses=${[listRes.status, unreadRes.status, readOneRes.status, readAllRes.status].join(",")}`,
    );

    // Security checks
    const unauthorizedReadOther = await api(`/api/notifications/${otherNotificationId}/read`, token1, {
      method: "POST",
      body: "{}",
    });
    const listWithInjectedUser = await api(`/api/notifications?userId=${u2.id}`, token1, { method: "GET" });
    const ids = (listWithInjectedUser.json?.data?.notifications || []).map((n) => String(n.recipientUserId));
    const allOwn = ids.every((id) => id === String(u1.id));
    record("recipient_user_id enforced from authenticated user", unauthorizedReadOther.status === 404, `status=${unauthorizedReadOther.status}`);
    record("frontend cannot pass userId to read other notifications", listWithInjectedUser.status === 200 && allOwn, `allOwn=${allOwn}`);

    // Validate raw unique behavior with duplicate insert
    let duplicateFailed = false;
    try {
      await notificationService.createNotification({
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "test.dup",
        title: "dup raw",
        message: "dup raw",
        entityType: "order",
        entityId: 920001,
        priority: "low",
        dedupeKey: "raw_dup_920001",
      });
      await notificationService.createNotification({
        recipientUserId: Number(u1.id),
        recipientRole: "client",
        type: "test.dup",
        title: "dup raw",
        message: "dup raw",
        entityType: "order",
        entityId: 920001,
        priority: "low",
        dedupeKey: "raw_dup_920001",
      });
    } catch (_) {
      duplicateFailed = true;
    }
    record("dedupe_key DB unique constraint blocks duplicates", duplicateFailed, "");

    // Best-effort behavior check by source inspection
    const fs = require("node:fs");
    const ordersSvc = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ordersService.js"), "utf8");
    const stripeSvc = fs.readFileSync(path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js"), "utf8");
    const webhookCtl = fs.readFileSync(path.join(__dirname, "..", "src", "controllers", "stripeWebhookController.js"), "utf8");
    const hasSafeNotify =
      ordersSvc.includes("async function safeNotify") &&
      stripeSvc.includes("async function safeNotify") &&
      webhookCtl.includes("async function safeNotify");
    record("notification failure does not break original action (best-effort wrappers)", hasSafeNotify, "source-level verification");

    const passCount = results.filter((r) => r.pass).length;
    const failCount = results.length - passCount;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ passCount, failCount, results }, null, 2));
  } finally {
    // Cleanup temp users and their notifications.
    if (touchedUserIds.length) {
      await pool.query(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::bigint[]) OR actor_user_id = ANY($1::bigint[])`, [touchedUserIds]);
    }
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
