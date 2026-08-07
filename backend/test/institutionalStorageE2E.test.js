/**
 * Full institutional order storage E2E lifecycle + remaining concurrency tests.
 * Requires real DATABASE_URL + JWT_SECRET (see helpers/integrationEnv.js).
 *
 * Run: npm run test:institutional-storage
 */
const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");
const { cleanupInstitutionalTestRecords } = require("./helpers/institutionalTestCleanup");

const integrationOk = isIntegrationEnvConfigured();
const rootDescribe = integrationOk ? describe : describe.skip;

async function cleanup(ids) {
  const { pool } = require("../src/config/db");
  await cleanupInstitutionalTestRecords(pool, {
    ...ids,
    logPrefix: "[institutionalStorageE2E]",
  });
}

async function seedUser(pool, role = "super_admin") {
  const crypto = require("node:crypto");
  const suffix = crypto.randomBytes(6).toString("hex");
  const email = `e2e_${role}_${suffix}@example.com`;
  const accountId = `E${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'E2E', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id`,
    [accountId, email, role, phone],
  );
  return Number(rows[0].id);
}

async function seedCategory(pool) {
  const { rows } = await pool.query(`SELECT id FROM categories ORDER BY id ASC LIMIT 1`);
  if (!rows[0]) throw new Error("no categories");
  return Number(rows[0].id);
}

rootDescribe("institutional storage full E2E lifecycle (Postgres)", () => {
  it(
    "institution → storage → approve → schedule → release → member pool → denial after removal",
    { timeout: 180_000 },
    async () => {
      const { pool } = require("../src/config/db");
      const institutionsService = require("../src/services/institutionsService");
      const storageService = require("../src/services/institutionalStorageService");
      const stored = require("../src/services/institutionalStoredOrdersService");
      const schedule = require("../src/services/institutionalScheduleService");
      const ordersService = require("../src/services/ordersService");

      const ids = { userIds: [], fakeOrderIds: [] };
      const adminId = await seedUser(pool, "super_admin");
      const memberId = await seedUser(pool, "freelancer");
      const strangerId = await seedUser(pool, "freelancer");
      ids.userIds.push(adminId, memberId, strangerId);
      const categoryId = await seedCategory(pool);

      try {
        const institution = await institutionsService.createInstitution({
          actorUserId: adminId,
          name: `E2E Inst ${Date.now()}`,
        });
        ids.institutionId = Number(institution.id);
        await institutionsService.addMember({
          institutionId: ids.institutionId,
          userId: memberId,
          actorUserId: adminId,
        });

        const start = new Date();
        start.setUTCDate(start.getUTCDate() + 2);
        const storage = await storageService.createStorage({
          actorUserId: adminId,
          payload: {
            name: `E2E Storage ${Date.now()}`,
            financialLimitJod: 200,
            distributionMonths: 1,
            distributionStartDate: start.toISOString().slice(0, 10),
            institutionIds: [ids.institutionId],
          },
        });
        ids.storageId = Number(storage.id);

        const draft = await stored.createStoredOrder({
          actorUserId: adminId,
          storageId: ids.storageId,
          body: {
            title: "E2E institutional order",
            description: "Valid administrative-wizard shaped payload for institutional storage.",
            categoryId,
            projectType: "fixed",
            budget: 50,
            durationValue: 5,
            durationUnit: "days",
            preferredSkills: [],
          },
        });
        const storedOrderId = draft.id;

        let metrics = await storageService.getStorageMetrics(ids.storageId);
        assert.equal(metrics.approvedAllocatedJod, undefined);
        assert.equal(Number(metrics.remainingJod), Number(metrics.financialLimitJod));

        await stored.submitForApproval({ actorUserId: adminId, storedOrderId });
        metrics = await storageService.getStorageMetrics(ids.storageId);
        assert.equal(
          Number(metrics.remainingJod),
          Number(metrics.financialLimitJod),
          "pending must not consume budget",
        );

        const poolBefore = await ordersService.listPoolOrders({ page: 1, limit: 5 });
        assert.ok(
          !(poolBefore.orders || []).some((o) => String(o.title) === "E2E institutional order"),
        );

        await stored.approveStoredOrder({ actorUserId: adminId, storedOrderId });
        const afterApprove = await stored.getStoredOrder(storedOrderId);
        assert.equal(afterApprove.lifecycleStatus, "approved_unscheduled");
        metrics = await storageService.getStorageMetrics(ids.storageId);
        const consumed = Number(metrics.financialLimitJod) - Number(metrics.remainingJod);
        assert.ok(consumed >= 50 - 1e-9);

        await stored.generateSchedule({ actorUserId: adminId, storageId: ids.storageId });
        await schedule.transitionStorageStatus({
          actorUserId: adminId,
          storageId: ids.storageId,
          status: "active",
          confirmPastBatches: true,
          allowPastBatches: true,
        });

        const { rows: batches } = await pool.query(
          `SELECT id FROM institutional_release_batches WHERE storage_id = $1 ORDER BY id ASC LIMIT 1`,
          [ids.storageId],
        );
        assert.ok(batches[0]);
        await pool.query(
          `UPDATE institutional_release_batches
           SET scheduled_release_at = NOW() - INTERVAL '1 minute', status = 'SCHEDULED',
               assigned_order_count = GREATEST(assigned_order_count, 1)
           WHERE id = $1`,
          [batches[0].id],
        );
        const { rowCount: linked } = await pool.query(
          `UPDATE institutional_batch_orders
           SET release_status = 'pending'
           WHERE stored_order_id = $1 AND release_status IN ('pending', 'failed', 'cancelled')`,
          [storedOrderId],
        );
        if (!linked) {
          await pool.query(
            `INSERT INTO institutional_batch_orders (batch_id, stored_order_id, position, release_status)
             VALUES ($1, $2, 0, 'pending')`,
            [batches[0].id, storedOrderId],
          );
        }
        await pool.query(
          `UPDATE institutional_stored_orders
           SET lifecycle_status = 'scheduled', updated_at = NOW()
           WHERE id = $1 AND released_order_id IS NULL`,
          [storedOrderId],
        );

        let tick = { skipped: true };
        for (let attempt = 0; attempt < 8; attempt += 1) {
          tick = await stored.processDueReleaseBatches({ limit: 10, actorUserId: adminId });
          const row = await stored.getStoredOrder(storedOrderId);
          if (row.lifecycleStatus === "released") break;
          if (!tick.skipped) {
            // processed something; wait and re-check
            await new Promise((r) => setTimeout(r, 300));
            const again = await stored.getStoredOrder(storedOrderId);
            if (again.lifecycleStatus === "released") break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }

        const released = await stored.getStoredOrder(storedOrderId);
        assert.equal(
          released.lifecycleStatus,
          "released",
          `expected released after tick=${JSON.stringify(tick)}`,
        );
        assert.ok(released.releasedOrderId);
        const live = await ordersService.getOrderById(released.releasedOrderId);
        assert.equal(live.visibilityScope, "institution");
        assert.equal(live.isInstitutionalOrder, true);
        assert.ok(live.institutionalStorageName);

        const { rows: liveCount } = await pool.query(
          `SELECT COUNT(*)::int AS c FROM orders WHERE institutional_stored_order_id = $1`,
          [storedOrderId],
        );
        assert.equal(Number(liveCount[0].c), 1);

        const memberPool = await stored.listInstitutionalPoolForUser({ userId: memberId, page: 1, limit: 20 });
        assert.ok(memberPool.orders.some((o) => String(o.id) === String(live.id)));

        const memberAccess = await stored.assertUserCanViewInstitutionalOrder(memberId, live.id);
        assert.equal(memberAccess.allowed, true);

        const strangerAccess = await stored.assertUserCanViewInstitutionalOrder(strangerId, live.id);
        assert.equal(strangerAccess.allowed, false);

        const publicPool = await ordersService.listPoolOrders({ page: 1, limit: 50 });
        assert.ok(!(publicPool.orders || []).some((o) => String(o.id) === String(live.id)));

        await assert.rejects(
          () =>
            ordersService.claimPoolOrder({
              freelancerUserId: strangerId,
              orderId: live.id,
            }),
          (err) => err?.statusCode === 403 || /not available|مؤسس|institution/i.test(String(err?.message || "")),
        );

        await institutionsService.removeMember({
          institutionId: ids.institutionId,
          userId: memberId,
        });
        const afterRemove = await stored.assertUserCanViewInstitutionalOrder(memberId, live.id);
        assert.equal(afterRemove.allowed, false);
        const poolAfterRemove = await stored.listInstitutionalPoolForUser({
          userId: memberId,
          page: 1,
          limit: 20,
        });
        assert.equal(poolAfterRemove.orders.length, 0);

        await assert.rejects(
          () => stored.transferToTraining({ actorUserId: adminId, storedOrderId }),
          /إطلاق|RELEASED_TRANSFER/,
        );
        await assert.rejects(
          () => stored.deleteStoredOrder({ actorUserId: adminId, storedOrderId }),
          /إطلاق|حذف/,
        );
      } finally {
        await cleanup(ids);
      }
    },
  );
});

rootDescribe("institutional remaining concurrency (Postgres)", () => {
  it("limit reduction vs approval keeps budget invariants", { timeout: 90_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const stored = require("../src/services/institutionalStoredOrdersService");
    const ids = { userIds: [] };
    const adminId = await seedUser(pool);
    ids.userIds.push(adminId);
    const categoryId = await seedCategory(pool);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: adminId,
        name: `Lim Inst ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);
      const storage = await storageService.createStorage({
        actorUserId: adminId,
        payload: {
          name: `Lim Storage ${Date.now()}`,
          financialLimitJod: 100,
          distributionMonths: 1,
          distributionStartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          institutionIds: [ids.institutionId],
        },
      });
      ids.storageId = Number(storage.id);

      const seedApproved = async (price, title) => {
        const o = await stored.createStoredOrder({
          actorUserId: adminId,
          storageId: ids.storageId,
          body: {
            title,
            description: "limit race seed",
            categoryId,
            projectType: "fixed",
            budget: price,
            durationValue: 2,
            durationUnit: "days",
          },
        });
        await pool.query(
          `UPDATE institutional_stored_orders
           SET lifecycle_status = 'pending_super_admin_approval' WHERE id = $1`,
          [o.id],
        );
        await stored.approveStoredOrder({ actorUserId: adminId, storedOrderId: o.id });
        return o;
      };

      await seedApproved(60, "Already allocated 60");
      const pending = await stored.createStoredOrder({
        actorUserId: adminId,
        storageId: ids.storageId,
        body: {
          title: "Pending 40",
          description: "limit race pending",
          categoryId,
          projectType: "fixed",
          budget: 40,
          durationValue: 2,
          durationUnit: "days",
        },
      });
      await pool.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'pending_super_admin_approval' WHERE id = $1`,
        [pending.id],
      );

      const results = await Promise.allSettled([
        stored.approveStoredOrder({ actorUserId: adminId, storedOrderId: pending.id }),
        storageService.updateStorage({
          actorUserId: adminId,
          storageId: ids.storageId,
          patch: { financialLimitJod: 70 },
        }),
      ]);

      const metrics = await storageService.getStorageMetrics(ids.storageId);
      const consumed = Number(metrics.financialLimitJod) - Number(metrics.remainingJod);
      assert.ok(
        Number(metrics.financialLimitJod) + 1e-9 >= consumed,
        `limit ${metrics.financialLimitJod} < consumed ${consumed}`,
      );
      assert.ok(results.some((r) => r.status === "fulfilled"));
      assert.ok(
        results.some((r) => r.status === "rejected") ||
          consumed <= Number(metrics.financialLimitJod) + 1e-9,
      );
    } finally {
      await cleanup(ids);
    }
  });

  it("manual retry and automatic tick release a batch once", { timeout: 120_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const stored = require("../src/services/institutionalStoredOrdersService");
    const schedule = require("../src/services/institutionalScheduleService");
    const ids = { userIds: [] };
    const adminId = await seedUser(pool);
    ids.userIds.push(adminId);
    const categoryId = await seedCategory(pool);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: adminId,
        name: `Retry Inst ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);
      const start = new Date();
      start.setUTCDate(start.getUTCDate() + 3);
      const storage = await storageService.createStorage({
        actorUserId: adminId,
        payload: {
          name: `Retry Storage ${Date.now()}`,
          financialLimitJod: 300,
          distributionMonths: 1,
          distributionStartDate: start.toISOString().slice(0, 10),
          institutionIds: [ids.institutionId],
        },
      });
      ids.storageId = Number(storage.id);

      const order = await stored.createStoredOrder({
        actorUserId: adminId,
        storageId: ids.storageId,
        body: {
          title: "Retry race order",
          description: "manual vs auto",
          categoryId,
          projectType: "fixed",
          budget: 40,
          durationValue: 2,
          durationUnit: "days",
        },
      });
      await pool.query(
        `UPDATE institutional_stored_orders SET lifecycle_status = 'pending_super_admin_approval' WHERE id = $1`,
        [order.id],
      );
      await stored.approveStoredOrder({ actorUserId: adminId, storedOrderId: order.id });
      await stored.generateSchedule({ actorUserId: adminId, storageId: ids.storageId });
      await schedule.transitionStorageStatus({
        actorUserId: adminId,
        storageId: ids.storageId,
        status: "active",
        confirmPastBatches: true,
        allowPastBatches: true,
      });
      const { rows: batches } = await pool.query(
        `SELECT id FROM institutional_release_batches WHERE storage_id = $1 ORDER BY id ASC LIMIT 1`,
        [ids.storageId],
      );
      await pool.query(
        `UPDATE institutional_release_batches
         SET scheduled_release_at = NOW() - INTERVAL '2 minutes', status = 'FAILED'
         WHERE id = $1`,
        [batches[0].id],
      );

      const [r1, r2] = await Promise.all([
        stored.retryBatch({ actorUserId: adminId, batchId: batches[0].id }),
        stored.processDueReleaseBatches({ limit: 5, actorUserId: adminId }),
      ]);
      void r1;
      void r2;

      const { rows: liveCount } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM orders WHERE institutional_stored_order_id = $1`,
        [order.id],
      );
      assert.equal(Number(liveCount[0].c), 1);
      const { rows: successLogs } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM institutional_release_logs
         WHERE storage_id = $1 AND event = 'order_released' AND success = TRUE`,
        [ids.storageId],
      );
      assert.equal(Number(successLogs[0].c), 1);
    } finally {
      await cleanup(ids);
    }
  });

  it("schedule edit vs release does not double-release an order", { timeout: 120_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const stored = require("../src/services/institutionalStoredOrdersService");
    const schedule = require("../src/services/institutionalScheduleService");
    const ids = { userIds: [] };
    const adminId = await seedUser(pool);
    ids.userIds.push(adminId);
    const categoryId = await seedCategory(pool);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: adminId,
        name: `Move Inst ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);
      const start = new Date();
      start.setUTCDate(start.getUTCDate() + 4);
      const storage = await storageService.createStorage({
        actorUserId: adminId,
        payload: {
          name: `Move Storage ${Date.now()}`,
          financialLimitJod: 400,
          distributionMonths: 2,
          distributionStartDate: start.toISOString().slice(0, 10),
          institutionIds: [ids.institutionId],
        },
      });
      ids.storageId = Number(storage.id);

      const mk = async (title) => {
        const o = await stored.createStoredOrder({
          actorUserId: adminId,
          storageId: ids.storageId,
          body: {
            title,
            description: "move vs release",
            categoryId,
            projectType: "fixed",
            budget: 30,
            durationValue: 2,
            durationUnit: "days",
          },
        });
        await pool.query(
          `UPDATE institutional_stored_orders SET lifecycle_status = 'pending_super_admin_approval' WHERE id = $1`,
          [o.id],
        );
        await stored.approveStoredOrder({ actorUserId: adminId, storedOrderId: o.id });
        return o;
      };
      const o1 = await mk("Move order 1");
      await mk("Move order 2");
      await stored.generateSchedule({ actorUserId: adminId, storageId: ids.storageId });
      await schedule.transitionStorageStatus({
        actorUserId: adminId,
        storageId: ids.storageId,
        status: "active",
        confirmPastBatches: true,
        allowPastBatches: true,
      });

      const { rows: batches } = await pool.query(
        `SELECT id, status FROM institutional_release_batches
         WHERE storage_id = $1 ORDER BY scheduled_release_at ASC, id ASC`,
        [ids.storageId],
      );
      assert.ok(batches.length >= 1);
      const sourceBatch = batches[0];
      const targetBatch = batches[1] || batches[0];
      await pool.query(
        `UPDATE institutional_release_batches
         SET scheduled_release_at = NOW() - INTERVAL '1 minute', status = 'SCHEDULED'
         WHERE id = $1`,
        [sourceBatch.id],
      );

      await Promise.allSettled([
        schedule.moveOrderToBatch({
          actorUserId: adminId,
          storedOrderId: o1.id,
          targetBatchId: targetBatch.id,
        }),
        stored.processDueReleaseBatches({ limit: 10, actorUserId: adminId }),
      ]);

      const { rows: liveCount } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM orders WHERE institutional_stored_order_id = $1`,
        [o1.id],
      );
      assert.ok(Number(liveCount[0].c) <= 1);

      const { rows: pendingAssign } = await pool.query(
        `SELECT COUNT(*)::int AS c
         FROM institutional_batch_orders
         WHERE stored_order_id = $1 AND release_status = 'pending'`,
        [o1.id],
      );
      const { rows: releasedAssign } = await pool.query(
        `SELECT COUNT(*)::int AS c
         FROM institutional_batch_orders
         WHERE stored_order_id = $1 AND release_status = 'released'`,
        [o1.id],
      );
      assert.ok(
        Number(pendingAssign[0].c) + Number(releasedAssign[0].c) <= 1 ||
          Number(releasedAssign[0].c) === 1,
        "order must not remain in two active pending assignments",
      );
    } finally {
      await cleanup(ids);
    }
  });

  it("duplicate concurrent transfer creates at most one fake order", { timeout: 90_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const stored = require("../src/services/institutionalStoredOrdersService");
    const ids = { userIds: [], fakeOrderIds: [] };
    const adminId = await seedUser(pool);
    ids.userIds.push(adminId);
    const categoryId = await seedCategory(pool);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: adminId,
        name: `Xfer Inst ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);
      const storage = await storageService.createStorage({
        actorUserId: adminId,
        payload: {
          name: `Xfer Storage ${Date.now()}`,
          financialLimitJod: 150,
          distributionMonths: 1,
          distributionStartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          institutionIds: [ids.institutionId],
        },
      });
      ids.storageId = Number(storage.id);
      const order = await stored.createStoredOrder({
        actorUserId: adminId,
        storageId: ids.storageId,
        body: {
          title: "Dup transfer order",
          description: "duplicate transfer race",
          categoryId,
          projectType: "fixed",
          budget: 25,
          durationValue: 1,
          durationUnit: "days",
        },
      });

      const results = await Promise.allSettled([
        stored.transferToTraining({ actorUserId: adminId, storedOrderId: order.id }),
        stored.transferToTraining({ actorUserId: adminId, storedOrderId: order.id }),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      assert.equal(ok.length, 1);
      assert.equal(rejected.length, 1);

      const row = await stored.getStoredOrder(order.id);
      assert.ok(row.transferredFakeOrderId || row.lifecycleStatus === "transferred");
      if (row.transferredFakeOrderId) ids.fakeOrderIds.push(Number(row.transferredFakeOrderId));
    } finally {
      await cleanup(ids);
    }
  });
});

describe("institutional visibility source guards (always)", () => {
  const fs = require("node:fs");
  it("homepage and marketplace counts exclude institution scope", () => {
    const home = fs.readFileSync(
      path.join(__dirname, "../src/services/publicHomeOrderStatsService.js"),
      "utf8",
    );
    const orders = fs.readFileSync(path.join(__dirname, "../src/services/ordersService.js"), "utf8");
    assert.match(home, /COALESCE\(visibility_scope, 'public'\) = 'public'/);
    assert.match(orders, /getPoolMarketplaceCountSummary[\s\S]*COALESCE\(o\.visibility_scope, 'public'\) = 'public'/);
  });

  it("admin getOrderById exposes institutional badge metadata", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/ordersService.js"), "utf8");
    assert.match(src, /isInstitutionalOrder/);
    assert.match(src, /institutional_storage_name/);
    assert.match(src, /institutional_institution_names/);
  });
});
