/**
 * Storage detail/list order KPI aggregates.
 */
const path = require("node:path");
const fs = require("node:fs");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");
const { cleanupInstitutionalTestRecords } = require("./helpers/institutionalTestCleanup");

describe("institutional storage order counts source guards", () => {
  it("getStorageOrderCounts uses SQL aggregates and joins live orders for completed", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/institutionalStorageService.js"),
      "utf8",
    );
    assert.match(src, /async function getStorageOrderCounts/);
    assert.match(src, /totalOrdersCount/);
    assert.match(src, /availableOrdersCount/);
    assert.match(src, /distributedOrdersCount/);
    assert.match(src, /completedOrdersCount/);
    assert.match(src, /LEFT JOIN orders live/);
    assert.match(src, /live\.order_status = 'completed'/);
    assert.match(src, /total_orders_count/);
    assert.doesNotMatch(src.slice(src.indexOf("async function getStorageOrderCounts"), src.indexOf("async function tryAcquireReleaseLock")), /for\s*\(/);
  });

  it("detail page renders KPI cards from storage counts", () => {
    const page = fs.readFileSync(
      path.join(
        __dirname,
        "../../frontend/src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageDetailPage.jsx",
      ),
      "utf8",
    );
    assert.match(page, /kpiTotalOrders/);
    assert.match(page, /kpiAvailableOrders/);
    assert.match(page, /kpiDistributedOrders/);
    assert.match(page, /kpiCompletedOrders/);
    assert.match(page, /totalOrdersCount/);
    assert.doesNotMatch(page, /confirmComplete|action_completed/);
  });

  it("list page shows totalOrdersCount column", () => {
    const page = fs.readFileSync(
      path.join(
        __dirname,
        "../../frontend/src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageListPage.jsx",
      ),
      "utf8",
    );
    assert.match(page, /totalOrdersCount/);
    assert.match(page, /ordersCount/);
  });
});

const integrationOk = isIntegrationEnvConfigured();
const rootDescribe = integrationOk ? describe : describe.skip;

rootDescribe("institutional storage order counts (Postgres)", () => {
  async function seedActor(pool) {
    const email = `ios_counts_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const accountId = `IC${Date.now().toString(36).slice(-8)}`.toUpperCase();
    const phone = `+96279${String(Date.now()).slice(-7)}`;
    const { rows } = await pool.query(
      `INSERT INTO users (
         account_id, email, password_hash, role, first_name, father_name, family_name,
         phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
       ) VALUES ($1, $2, 'x', 'super_admin', 'Count', 'T', 'Tester', $3, $3, 'ذكر', 'JO', TRUE, TRUE, TRUE)
       RETURNING id`,
      [accountId, email, phone],
    );
    return Number(rows[0].id);
  }

  async function seedCategory(pool) {
    const { rows } = await pool.query(`SELECT id FROM categories ORDER BY id ASC LIMIT 1`);
    if (!rows[0]) throw new Error("no categories");
    return Number(rows[0].id);
  }

  async function insertStoredOrder(pool, { storageId, actorId, categoryId, title, lifecycle, deletedAt = null }) {
    const { rows } = await pool.query(
      `INSERT INTO institutional_stored_orders (
         storage_id, lifecycle_status, title, description, category_id,
         project_type, budget, currency_code, duration_value, duration_unit,
         order_price_jod, created_by, deleted_at
       ) VALUES (
         $1, $2, $3, 'counts test', $4,
         'fixed', 25, 'JOD', 2, 'days',
         25, $5, $6
       ) RETURNING id`,
      [storageId, lifecycle, title, categoryId, actorId, deletedAt],
    );
    return Number(rows[0].id);
  }

  async function insertLiveOrder(pool, { actorId, categoryId, status }) {
    const code = `IOC-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
    const { rows } = await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, duration_value, duration_unit,
         created_by_user_id, created_by_role, source_type,
         is_published, is_open_for_pool, payment_required, payment_status,
         order_status, visibility_scope
       ) VALUES (
         $1, 'Live count order', 'x', $2, 'fixed',
         25, 'JOD', 2, 'days',
         $3, 'super_admin', 'super_admin_created',
         TRUE, TRUE, FALSE, 'unpaid',
         $4, 'institution'
       ) RETURNING id`,
      [code, categoryId, actorId, status],
    );
    return Number(rows[0].id);
  }

  it("aggregates total/available/distributed/completed correctly and isolates storages", { timeout: 90_000 }, async () => {
    const { pool } = require("../src/config/db");
    const storageService = require("../src/services/institutionalStorageService");
    const institutionsService = require("../src/services/institutionsService");
    const stamp = Date.now();
    const actorId = await seedActor(pool);
    const categoryId = await seedCategory(pool);
    const ids = {
      userIds: [actorId],
      institutionIds: [],
      storageIds: [],
      releasedOrderIds: [],
      logPrefix: "[institutionalStorageOrderCounts]",
    };

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: actorId,
        name: `IOS Counts Inst ${stamp}`,
      });
      ids.institutionIds.push(Number(institution.id));

      const storageA = await storageService.createStorage({
        actorUserId: actorId,
        payload: {
          name: `IOS Counts A ${stamp}`,
          financialLimitJod: 500,
          distributionMonths: 2,
          distributionStartDate: "2031-01-01",
          institutionIds: [institution.id],
        },
      });
      const storageB = await storageService.createStorage({
        actorUserId: actorId,
        payload: {
          name: `IOS Counts B ${stamp}`,
          financialLimitJod: 500,
          distributionMonths: 2,
          distributionStartDate: "2031-01-01",
          institutionIds: [institution.id],
        },
      });
      ids.storageIds.push(storageA.id, storageB.id);
      const sidA = Number(storageA.id);
      const sidB = Number(storageB.id);

      const empty = await storageService.getStorageOrderCounts(sidA);
      assert.deepEqual(empty, {
        totalOrdersCount: 0,
        availableOrdersCount: 0,
        distributedOrdersCount: 0,
        completedOrdersCount: 0,
      });

      await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "draft",
        lifecycle: "draft",
      });
      await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "pending",
        lifecycle: "pending_super_admin_approval",
      });
      await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "approved",
        lifecycle: "approved_unscheduled",
      });
      await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "scheduled",
        lifecycle: "scheduled",
      });

      const releasedLiveId = await insertLiveOrder(pool, {
        actorId,
        categoryId,
        status: "open_for_freelancers",
      });
      ids.releasedOrderIds.push(releasedLiveId);
      const releasedStoredId = await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "released",
        lifecycle: "released",
      });
      await pool.query(
        `UPDATE institutional_stored_orders SET released_order_id = $2 WHERE id = $1`,
        [releasedStoredId, releasedLiveId],
      );

      const completedLiveId = await insertLiveOrder(pool, {
        actorId,
        categoryId,
        status: "completed",
      });
      ids.releasedOrderIds.push(completedLiveId);
      const completedStoredId = await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "completed-live",
        lifecycle: "released",
      });
      await pool.query(
        `UPDATE institutional_stored_orders SET released_order_id = $2 WHERE id = $1`,
        [completedStoredId, completedLiveId],
      );

      await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "archived-no-release",
        lifecycle: "archived",
      });
      await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "rejected",
        lifecycle: "rejected",
      });
      await insertStoredOrder(pool, {
        storageId: sidA,
        actorId,
        categoryId,
        title: "deleted-soft",
        lifecycle: "deleted",
        deletedAt: new Date().toISOString(),
      });

      // Other storage must not affect A
      await insertStoredOrder(pool, {
        storageId: sidB,
        actorId,
        categoryId,
        title: "other-storage",
        lifecycle: "approved_unscheduled",
      });
      await insertStoredOrder(pool, {
        storageId: sidB,
        actorId,
        categoryId,
        title: "other-released",
        lifecycle: "released",
      });

      const counts = await storageService.getStorageOrderCounts(sidA);
      // valid non-deleted: draft, pending, approved, scheduled, released, completed-released, archived, rejected = 8
      assert.equal(counts.totalOrdersCount, 8);
      // available: draft, pending, approved = 3
      assert.equal(counts.availableOrdersCount, 3);
      // distributed: scheduled + 2 released (with live ids) = 3
      assert.equal(counts.distributedOrdersCount, 3);
      assert.equal(counts.completedOrdersCount, 1);

      const metrics = await storageService.getStorageMetrics(sidA);
      assert.equal(metrics.totalOrdersCount, 8);
      assert.equal(metrics.availableOrdersCount, 3);
      assert.equal(metrics.distributedOrdersCount, 3);
      assert.equal(metrics.completedOrdersCount, 1);

      const list = await storageService.listStorages({ q: `IOS Counts A ${stamp}`, limit: 10 });
      const row = list.storages.find((s) => String(s.id) === String(sidA));
      assert.ok(row);
      assert.equal(row.totalOrdersCount, 8);

      const listB = await storageService.listStorages({ q: `IOS Counts B ${stamp}`, limit: 10 });
      const rowB = listB.storages.find((s) => String(s.id) === String(sidB));
      assert.ok(rowB);
      assert.equal(rowB.totalOrdersCount, 2);

      // Status change updates counts (approve path: pending → approved still available)
      await pool.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'scheduled'
         WHERE storage_id = $1 AND title = 'approved'`,
        [sidA],
      );
      const afterSchedule = await storageService.getStorageOrderCounts(sidA);
      assert.equal(afterSchedule.totalOrdersCount, 8);
      assert.equal(afterSchedule.availableOrdersCount, 2);
      assert.equal(afterSchedule.distributedOrdersCount, 4);

      // Soft-deleted exclusion stays stable when another row is deleted
      await pool.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'deleted', deleted_at = NOW()
         WHERE storage_id = $1 AND title = 'draft'`,
        [sidA],
      );
      const afterDelete = await storageService.getStorageOrderCounts(sidA);
      assert.equal(afterDelete.totalOrdersCount, 7);
      assert.equal(afterDelete.availableOrdersCount, 1);
    } finally {
      await cleanupInstitutionalTestRecords(pool, ids);
    }
  });
});
