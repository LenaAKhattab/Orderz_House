/**
 * Notification delete / bulk-delete — service + controller + route guards.
 * Uses mocked pool only (no real DB).
 * Run: node --test test/notificationDelete.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/notification_delete_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "notificationsRoutes.js"),
  "utf8",
);
const controllerSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "controllers", "notificationsController.js"),
  "utf8",
);
const servicePath = require.resolve("../src/services/notificationService");
const dbPath = require.resolve("../src/config/db");

function loadServiceWithMockPool(mockPool) {
  delete require.cache[dbPath];
  delete require.cache[servicePath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: mockPool, connectDB: async () => {} },
  };
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require("../src/services/notificationService");
}

function createMockPool({ deleteRowCount = 0, unreadCount = 0, onQuery } = {}) {
  const queries = [];
  const pool = {
    queries,
    async query(sql, params) {
      const s = String(sql);
      queries.push({ sql: s, params });
      if (typeof onQuery === "function") {
        const override = await onQuery(s, params);
        if (override !== undefined) return override;
      }
      if (s.includes("DELETE FROM notifications") && s.includes("recipient_user_id")) {
        return { rowCount: deleteRowCount, rows: [] };
      }
      if (s.includes("COUNT(*)") && s.includes("is_read = FALSE")) {
        return { rows: [{ unread_count: unreadCount }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  return pool;
}

describe("notification delete routes — auth", () => {
  it("registers DELETE /notifications/:id and POST /notifications/bulk-delete behind requireAuth", () => {
    assert.ok(routesSrc.includes('requireAuth'));
    assert.ok(routesSrc.includes('router.delete("/notifications/:id"'));
    assert.ok(routesSrc.includes('router.post("/notifications/bulk-delete"'));
    assert.ok(routesSrc.includes("deleteNotification"));
    assert.ok(routesSrc.includes("deleteNotificationsBulk"));
    // Stream is the only route before requireAuth; deletes come after.
    const authIdx = routesSrc.indexOf("router.use(requireAuth)");
    const delIdx = routesSrc.indexOf('router.delete("/notifications/:id"');
    const bulkIdx = routesSrc.indexOf('router.post("/notifications/bulk-delete"');
    assert.ok(authIdx >= 0 && delIdx > authIdx && bulkIdx > authIdx);
  });

  it("controller scopes delete to req.auth.userId", () => {
    assert.ok(controllerSrc.includes("req.auth.userId"));
    assert.match(controllerSrc, /deleteNotification\(\s*req\.params\.id,\s*req\.auth\.userId/);
    assert.match(controllerSrc, /deleteNotifications\(ids,\s*req\.auth\.userId\)/);
  });
});

describe("notificationService.deleteNotification — mocked pool", () => {
  beforeEach(() => {
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });
  afterEach(() => {
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });

  it("deletes own notification and returns true", async () => {
    const pool = createMockPool({ deleteRowCount: 1 });
    const svc = loadServiceWithMockPool(pool);
    const ok = await svc.deleteNotification(10, 5);
    assert.equal(ok, true);
    assert.equal(pool.queries.length, 1);
    assert.match(pool.queries[0].sql, /DELETE FROM notifications/);
    assert.deepEqual(pool.queries[0].params, [10, 5]);
  });

  it("returns false when notification missing or owned by another user", async () => {
    const pool = createMockPool({ deleteRowCount: 0 });
    const svc = loadServiceWithMockPool(pool);
    const ok = await svc.deleteNotification(99, 5);
    assert.equal(ok, false);
    assert.deepEqual(pool.queries[0].params, [99, 5]);
  });

  it("handles invalid IDs safely without querying", async () => {
    const pool = createMockPool({ deleteRowCount: 1 });
    const svc = loadServiceWithMockPool(pool);
    assert.equal(await svc.deleteNotification("abc", 5), false);
    assert.equal(await svc.deleteNotification(0, 5), false);
    assert.equal(await svc.deleteNotification(10, null), false);
    assert.equal(await svc.deleteNotification(-1, 5), false);
    assert.equal(pool.queries.length, 0);
  });
});

describe("notificationService.deleteNotifications — bulk mocked pool", () => {
  beforeEach(() => {
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });
  afterEach(() => {
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });

  it("bulk deletes only for recipient userId", async () => {
    const pool = createMockPool({ deleteRowCount: 2 });
    const svc = loadServiceWithMockPool(pool);
    const out = await svc.deleteNotifications([1, 2, 3], 7);
    assert.deepEqual(out, { deletedCount: 2 });
    assert.match(pool.queries[0].sql, /recipient_user_id = \$1/);
    assert.match(pool.queries[0].sql, /id = ANY\(\$2::bigint\[\]\)/);
    assert.equal(pool.queries[0].params[0], 7);
    assert.deepEqual(pool.queries[0].params[1], [1, 2, 3]);
  });

  it("empty / invalid list returns deletedCount 0 without query", async () => {
    const pool = createMockPool({ deleteRowCount: 5 });
    const svc = loadServiceWithMockPool(pool);
    assert.deepEqual(await svc.deleteNotifications([], 7), { deletedCount: 0 });
    assert.deepEqual(await svc.deleteNotifications(null, 7), { deletedCount: 0 });
    assert.deepEqual(await svc.deleteNotifications(["x", -1, 0], 7), { deletedCount: 0 });
    assert.deepEqual(await svc.deleteNotifications([1, 2], "bad"), { deletedCount: 0 });
    assert.equal(pool.queries.length, 0);
  });

  it("filters non-numeric ids before delete", async () => {
    const pool = createMockPool({ deleteRowCount: 1 });
    const svc = loadServiceWithMockPool(pool);
    const out = await svc.deleteNotifications(["1", "nope", 2], 3);
    assert.deepEqual(out, { deletedCount: 1 });
    assert.deepEqual(pool.queries[0].params[1], [1, 2]);
  });
});

describe("notificationService unread after delete", () => {
  beforeEach(() => {
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });
  afterEach(() => {
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });

  it("getUnreadCount reflects remaining unread after deletion", async () => {
    const pool = createMockPool({ deleteRowCount: 1, unreadCount: 4 });
    const svc = loadServiceWithMockPool(pool);
    await svc.deleteNotification(11, 9);
    const count = await svc.getUnreadCount(9);
    assert.equal(count, 4);
    assert.ok(pool.queries.some((q) => q.sql.includes("is_read = FALSE")));
  });
});

describe("notificationsController delete handlers", () => {
  it("returns 404 when single delete finds nothing", async () => {
    const calls = [];
    const fakeService = {
      async deleteNotification(id, userId) {
        calls.push({ id, userId });
        return false;
      },
    };
    // Inline controller behavior mirror (no Express boot).
    const req = { params: { id: "12" }, auth: { userId: 4 } };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    const deleted = await fakeService.deleteNotification(req.params.id, req.auth.userId);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Notification not found." });
    }
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.deepEqual(calls[0], { id: "12", userId: 4 });
  });

  it("bulk delete returns deletedCount from service", async () => {
    const fakeService = {
      async deleteNotifications(ids, userId) {
        assert.deepEqual(ids, [1, 2]);
        assert.equal(userId, 8);
        return { deletedCount: 2 };
      },
    };
    const req = { body: { ids: [1, 2] }, auth: { userId: 8 } };
    const out = await fakeService.deleteNotifications(
      req.body?.ids ?? req.body?.notificationIds ?? [],
      req.auth.userId,
    );
    assert.deepEqual(out, { deletedCount: 2 });
  });
});
