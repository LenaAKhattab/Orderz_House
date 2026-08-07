/**
 * Institutional storage feature + concurrency integration tests.
 * Unit/source tests always run; DB concurrency tests skip unless integration env is configured.
 */
const path = require("node:path");
const fs = require("node:fs");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");
const { cleanupInstitutionalTestRecords } = require("./helpers/institutionalTestCleanup");

describe("institutional storage source guards", () => {
  it("formatPgDateOnly never emits locale weekday date strings", () => {
    const { formatPgDateOnly } = require("../src/services/institutionalStorageService");
    assert.equal(formatPgDateOnly(new Date(Date.UTC(2026, 6, 20))), "2026-07-20");
    assert.equal(formatPgDateOnly("2026-07-20"), "2026-07-20");
    assert.equal(formatPgDateOnly("2026-07-20T00:00:00.000Z"), "2026-07-20");
    assert.equal(formatPgDateOnly(null), null);
    assert.doesNotMatch(String(formatPgDateOnly(new Date(Date.UTC(2026, 6, 20)))), /Mon|Tue|Wed|Sun/);
  });

  it("public homepage aggregates exclude institution scope", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/publicHomeOrderStatsService.js"),
      "utf8",
    );
    assert.match(src, /COALESCE\(o\.visibility_scope, 'public'\) = 'public'/);
    assert.match(src, /COALESCE\(visibility_scope, 'public'\) = 'public'/);
  });

  it("freelancer marketplace count excludes institution scope", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/ordersService.js"), "utf8");
    assert.match(src, /async function getPoolMarketplaceCountSummary/);
    const idx = src.indexOf("async function getPoolMarketplaceCountSummary");
    const snippet = src.slice(idx, idx + 700);
    assert.match(snippet, /COALESCE\(o\.visibility_scope, 'public'\) = 'public'/);
  });

  it("institutional wizard mode keeps assignment informational", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/components/orders/AdminInternalOrderWizard.jsx"),
      "utf8",
    );
    assert.match(src, /isInstitutionalMode/);
    assert.match(src, /mode === "institutional"/);
    assert.match(src, /!isClientAudience && !isFakePoolMode && !isInstitutionalMode/);
  });

  it("AdminCreateOrderPage remains non-institutional", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/pages/dashboard/AdminCreateOrderPage.jsx"),
      "utf8",
    );
    assert.doesNotMatch(page, /mode=\"institutional\"/);
    assert.match(page, /AdminInternalOrderWizard/);
  });

  it("paused storages excluded from due release query", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/institutionalStoredOrdersService.js"),
      "utf8",
    );
    assert.match(src, /s\.status = 'active'/);
    assert.match(src, /RELEASED_TRANSFER_BLOCKED|لا يمكن نقل طلب مطلق/);
  });

  it("storage completed status is removed from transitions", () => {
    const scheduleSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/institutionalScheduleService.js"),
      "utf8",
    );
    const detailSrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../frontend/src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageDetailPage.jsx",
      ),
      "utf8",
    );
    assert.doesNotMatch(scheduleSrc, /completed/);
    assert.doesNotMatch(detailSrc, /confirmComplete|action_completed|"completed"/);
    assert.match(detailSrc, /active: \["paused", "archived"\]/);
    assert.match(detailSrc, /paused: \["active", "archived"\]/);
    assert.match(detailSrc, /confirmPauseTitle/);
    assert.match(detailSrc, /confirmArchiveStorageTitle/);
    assert.match(detailSrc, /oh-ios-detail/);
    assert.match(detailSrc, /role="tablist"/);
  });

  it("member remove soft-deactivates for immediate access loss", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/institutionsService.js"), "utf8");
    assert.match(src, /SET status = 'inactive'/);
    assert.match(src, /DUPLICATE_MEMBERSHIP/);
  });
});

const integrationOk = isIntegrationEnvConfigured();
const rootDescribe = integrationOk ? describe : describe.skip;

rootDescribe("institutional storage concurrency (Postgres)", () => {
  async function cleanup(ids) {
    const { pool } = require("../src/config/db");
    await cleanupInstitutionalTestRecords(pool, {
      ...ids,
      logPrefix: "[institutionalStorageFollowup]",
    });
  }

  async function seedActor(pool) {
    const email = `inst_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const accountId = `IT${Date.now().toString(36).slice(-8)}`.toUpperCase();
    const phone = `+96279${String(Date.now()).slice(-7)}`;
    const { rows } = await pool.query(
      `INSERT INTO users (
         account_id, email, password_hash, role, first_name, father_name, family_name,
         phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
       ) VALUES ($1, $2, 'x', 'super_admin', 'Inst', 'T', 'Test', $3, $3, 'ذكر', 'JO', TRUE, TRUE, TRUE)
       RETURNING id`,
      [accountId, email, phone],
    );
    return Number(rows[0].id);
  }

  async function seedCategory(pool) {
    const { rows } = await pool.query(`SELECT id FROM categories ORDER BY id ASC LIMIT 1`);
    if (!rows[0]) throw new Error("no categories available for institutional tests");
    return Number(rows[0].id);
  }

  it("approval race: only one of two concurrent approvals fits the limit", { timeout: 60_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const stored = require("../src/services/institutionalStoredOrdersService");
    const ids = { userIds: [], releasedOrderIds: [] };

    const actorId = await seedActor(pool);
    ids.userIds.push(actorId);
    const categoryId = await seedCategory(pool);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: actorId,
        name: `Inst Race ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);

      const storage = await storageService.createStorage({
        actorUserId: actorId,
        payload: {
          name: `Storage Race ${Date.now()}`,
          financialLimitJod: 100,
          distributionMonths: 1,
          distributionStartDate: new Date().toISOString().slice(0, 10),
          institutionIds: [ids.institutionId],
        },
      });
      ids.storageId = Number(storage.id || storage.storage?.id);

      const mkPending = async (title, price) => {
        const order = await stored.createStoredOrder({
          actorUserId: actorId,
          storageId: ids.storageId,
          body: {
            title,
            description: "race test order description",
            categoryId,
            projectType: "fixed",
            budget: price,
            durationValue: 3,
            durationUnit: "days",
          },
        });
        await pool.query(
          `UPDATE institutional_stored_orders
           SET lifecycle_status = 'pending_super_admin_approval', updated_at = NOW()
           WHERE id = $1`,
          [order.id],
        );
        return order;
      };

      const a = await mkPending("Race A", 80);
      const b = await mkPending("Race B", 80);

      const results = await Promise.allSettled([
        stored.approveStoredOrder({ actorUserId: actorId, storedOrderId: a.id }),
        stored.approveStoredOrder({ actorUserId: actorId, storedOrderId: b.id }),
      ]);

      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");
      assert.equal(ok.length, 1, `expected exactly one success, got ${JSON.stringify(results)}`);
      assert.equal(failed.length, 1);
      assert.match(String(failed[0].reason?.message || ""), /الحد المالي|FINANCIAL_LIMIT/);

      const metrics = await storageService.getStorageMetrics(ids.storageId);
      const consumed = Number(metrics.financialLimitJod) - Number(metrics.remainingJod);
      assert.ok(consumed <= 100 + 1e-9);
      assert.ok(consumed >= 80 - 1e-9);
    } finally {
      await cleanup(ids);
    }
  });

  it("release race: concurrent workers release a batch only once", { timeout: 90_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const stored = require("../src/services/institutionalStoredOrdersService");
    const schedule = require("../src/services/institutionalScheduleService");
    const ids = { userIds: [], releasedOrderIds: [] };

    const actorId = await seedActor(pool);
    ids.userIds.push(actorId);
    const categoryId = await seedCategory(pool);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: actorId,
        name: `Inst Rel ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);

      const start = new Date();
      start.setUTCDate(start.getUTCDate() + 1);
      const storage = await storageService.createStorage({
        actorUserId: actorId,
        payload: {
          name: `Storage Rel ${Date.now()}`,
          financialLimitJod: 500,
          distributionMonths: 1,
          distributionStartDate: start.toISOString().slice(0, 10),
          institutionIds: [ids.institutionId],
        },
      });
      ids.storageId = Number(storage.id || storage.storage?.id);

      const order = await stored.createStoredOrder({
        actorUserId: actorId,
        storageId: ids.storageId,
        body: {
          title: "Release race order",
          description: "release race description",
          categoryId,
          projectType: "fixed",
          budget: 50,
          durationValue: 2,
          durationUnit: "days",
        },
      });
      await pool.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'pending_super_admin_approval' WHERE id = $1`,
        [order.id],
      );
      await stored.approveStoredOrder({ actorUserId: actorId, storedOrderId: order.id });
      await stored.generateSchedule({ actorUserId: actorId, storageId: ids.storageId });

      await schedule.transitionStorageStatus({
        actorUserId: actorId,
        storageId: ids.storageId,
        status: "active",
        confirmPastBatches: true,
        allowPastBatches: true,
      });

      const { rows: batches } = await pool.query(
        `SELECT id FROM institutional_release_batches WHERE storage_id = $1 ORDER BY id ASC LIMIT 1`,
        [ids.storageId],
      );
      assert.ok(batches[0], "expected a batch");
      await pool.query(
        `UPDATE institutional_release_batches
         SET scheduled_release_at = NOW() - INTERVAL '1 minute', status = 'SCHEDULED'
         WHERE id = $1`,
        [batches[0].id],
      );

      const [r1, r2] = await Promise.all([
        stored.processDueReleaseBatches({ limit: 5, actorUserId: actorId }),
        stored.processDueReleaseBatches({ limit: 5, actorUserId: actorId }),
      ]);

      const { rows: live } = await pool.query(
        `SELECT released_order_id FROM institutional_stored_orders WHERE id = $1`,
        [order.id],
      );
      const liveId = live[0]?.released_order_id;
      assert.ok(liveId, "expected one live order");
      ids.releasedOrderIds.push(Number(liveId));

      const { rows: liveCount } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM orders
         WHERE institutional_stored_order_id = $1`,
        [order.id],
      );
      assert.equal(Number(liveCount[0].c), 1);

      const { rows: successLogs } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM institutional_release_logs
         WHERE storage_id = $1 AND event = 'order_released' AND success = TRUE`,
        [ids.storageId],
      );
      assert.equal(Number(successLogs[0].c), 1);

      const { rows: batchRows } = await pool.query(
        `SELECT status FROM institutional_release_batches WHERE id = $1`,
        [batches[0].id],
      );
      assert.ok(["RELEASED", "PARTIALLY_RELEASED"].includes(batchRows[0].status));

      assert.ok(r1 || r2);
    } finally {
      await cleanup(ids);
    }
  });

  it("duplicate transfer to training is blocked; released transfer blocked", { timeout: 60_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const stored = require("../src/services/institutionalStoredOrdersService");
    const ids = { userIds: [], releasedOrderIds: [] };
    const actorId = await seedActor(pool);
    ids.userIds.push(actorId);
    const categoryId = await seedCategory(pool);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: actorId,
        name: `Inst Xfer ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);
      const storage = await storageService.createStorage({
        actorUserId: actorId,
        payload: {
          name: `Storage Xfer ${Date.now()}`,
          financialLimitJod: 200,
          distributionMonths: 1,
          distributionStartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          institutionIds: [ids.institutionId],
        },
      });
      ids.storageId = Number(storage.id || storage.storage?.id);

      const order = await stored.createStoredOrder({
        actorUserId: actorId,
        storageId: ids.storageId,
        body: {
          title: "Transfer block order",
          description: "transfer block description",
          categoryId,
          projectType: "fixed",
          budget: 25,
          durationValue: 1,
          durationUnit: "days",
        },
      });

      await pool.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'released', released_order_id = NULL WHERE id = $1`,
        [order.id],
      );

      await assert.rejects(
        () => stored.transferToTraining({ actorUserId: actorId, storedOrderId: order.id }),
        /إطلاق|RELEASED_TRANSFER/,
      );

      await assert.rejects(
        () => stored.deleteStoredOrder({ actorUserId: actorId, storedOrderId: order.id }),
        /إطلاق|حذف|مطلق/,
      );
    } finally {
      await cleanup(ids);
    }
  });

  it("removed member loses institution pool access", { timeout: 30_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const ids = { userIds: [] };
    const actorId = await seedActor(pool);
    ids.userIds.push(actorId);
    const memberEmail = `member_${Date.now()}@example.com`;
    const memberAccount = `IM${Date.now().toString(36).slice(-8)}`.toUpperCase();
    const memberPhone = `+96278${String(Date.now()).slice(-7)}`;
    const { rows: mRows } = await pool.query(
      `INSERT INTO users (
         account_id, email, password_hash, role, first_name, father_name, family_name,
         phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
       ) VALUES ($1, $2, 'x', 'freelancer', 'Mem', 'T', 'Ber', $3, $3, 'ذكر', 'JO', TRUE, TRUE, TRUE)
       RETURNING id`,
      [memberAccount, memberEmail, memberPhone],
    );
    const memberId = Number(mRows[0].id);
    ids.userIds.push(memberId);

    try {
      const institution = await institutionsService.createInstitution({
        actorUserId: actorId,
        name: `Inst Mem ${Date.now()}`,
      });
      ids.institutionId = Number(institution.id);
      await institutionsService.addMember({
        institutionId: ids.institutionId,
        userId: memberId,
        actorUserId: actorId,
      });
      let idsActive = await institutionsService.listActiveInstitutionIdsForUser(memberId);
      assert.ok(idsActive.includes(ids.institutionId));

      await assert.rejects(
        () =>
          institutionsService.addMember({
            institutionId: ids.institutionId,
            userId: memberId,
            actorUserId: actorId,
          }),
        /عضو بالفعل|DUPLICATE/,
      );

      await institutionsService.removeMember({ institutionId: ids.institutionId, userId: memberId });
      idsActive = await institutionsService.listActiveInstitutionIdsForUser(memberId);
      assert.equal(idsActive.includes(ids.institutionId), false);
    } finally {
      await cleanup(ids);
    }
  });
});
