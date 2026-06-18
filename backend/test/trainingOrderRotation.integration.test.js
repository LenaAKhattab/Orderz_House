/**
 * Postgres integration: fake/training order automation gap prevention.
 *
 * Run: npm run test:fake-orders-integration
 * Requires: backend/.env with real DATABASE_URL (not *placeholder*) and JWT_SECRET (16+ chars).
 * Mutates fake_order_settings and training rounds — dev/staging only.
 */
const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");
const {
  snapshotFakeOrderSettings,
  restoreFakeOrderSettings,
  maxActiveRoundId,
  countActiveRoundItems,
  setRoundItemsVisibleUntil,
  setAllActiveItemsVisibleUntil,
  shrinkVisibleCount,
  generateTestRound,
  requireIntegrationPrereqs,
  getTrainingPoolCoverage,
  getSettings,
  getOverlapThresholdMs,
} = require("./helpers/fakeOrdersIntegrationHarness");

const integrationEnvOk = isIntegrationEnvConfigured();
const rootDescribe = integrationEnvOk ? describe : describe.skip;

rootDescribe("fakeOrders automation gap (Postgres integration)", () => {
  it("A: no zero-visible gap at round boundary", { timeout: 90_000 }, async (t) => {
    const { pool } = require("../src/config/db");
    const fakeOrdersService = require("../src/services/fakeOrdersService");
    const adminId = await requireIntegrationPrereqs(pool, t);
    if (!adminId) return;

    const settingsSnap = await snapshotFakeOrderSettings(pool);
    const client = await pool.connect();
    let testRoundId = null;

    try {
      await client.query("BEGIN");
      const gen = await generateTestRound(client, adminId, { supersedeExisting: true });
      await client.query("COMMIT");
      testRoundId = Number(gen.round.id);

      const overlapMs = getOverlapThresholdMs();
      const until = new Date(Date.now() + overlapMs - 45_000);
      await setAllActiveItemsVisibleUntil(pool, until);

      await pool.query(
        `UPDATE fake_order_settings
         SET training_orders_enabled = TRUE,
             automation_enabled = TRUE,
             next_automation_run_at = NOW() - INTERVAL '1 minute',
             updated_at = NOW()
         WHERE id = 1`,
      );

      const samples = [];
      const sample = async (label) => {
        const cov = await fakeOrdersService.getTrainingPoolCoverage(pool);
        samples.push({ label, visible: cov.visibleCount });
        return cov;
      };

      const before = await sample("before_tick");
      assert.ok(before.visibleCount > 0, "expected visible orders before tick");

      await fakeOrdersService.runAutomationTick();

      const after = await sample("after_tick");
      assert.ok(after.visibleCount > 0, "visible count must not drop to zero after tick");
      assert.ok(
        samples.every((s) => s.visible > 0),
        `visible count samples: ${JSON.stringify(samples)}`,
      );

      const oldRoundActive = await countActiveRoundItems(pool, testRoundId);
      if (after.activeRounds > 1) {
        assert.ok(oldRoundActive > 0, "old round should remain visible when overlap round exists");
      }
    } finally {
      await restoreFakeOrderSettings(pool, settingsSnap);
      client.release();
    }
  });

  it("B: below-min visible count triggers immediate generation", { timeout: 90_000 }, async (t) => {
    const { pool } = require("../src/config/db");
    const fakeOrdersService = require("../src/services/fakeOrdersService");
    const adminId = await requireIntegrationPrereqs(pool, t);
    if (!adminId) return;

    const settingsSnap = await snapshotFakeOrderSettings(pool);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await generateTestRound(client, adminId, { supersedeExisting: true });
      await client.query("COMMIT");

      const beforeCov = await getTrainingPoolCoverage(pool);
      assert.ok(beforeCov.visibleCount > 0, "need visible orders to shrink");

      const shrinkBy = Math.min(2, Math.max(1, beforeCov.visibleCount - 1));
      await shrinkVisibleCount(pool, shrinkBy);

      const shrunkCov = await getTrainingPoolCoverage(pool);
      const minTarget = shrunkCov.visibleCount + 2;

      await pool.query(
        `UPDATE fake_order_settings
         SET min_orders = $1,
             training_orders_enabled = TRUE,
             automation_enabled = TRUE,
             next_automation_run_at = NOW() + INTERVAL '7 days',
             updated_at = NOW()
         WHERE id = 1`,
        [minTarget],
      );

      const maxRoundBefore = await maxActiveRoundId(pool);
      const visibleBeforeTick = (await getTrainingPoolCoverage(pool)).visibleCount;
      assert.ok(visibleBeforeTick < minTarget, "precondition: visible below min_orders");

      await fakeOrdersService.runAutomationTick();

      const afterCov = await getTrainingPoolCoverage(pool);
      const maxRoundAfter = await maxActiveRoundId(pool);

      assert.ok(
        afterCov.visibleCount >= minTarget,
        `visible ${afterCov.visibleCount} should be >= min_orders ${minTarget}`,
      );
      assert.ok(
        maxRoundAfter >= maxRoundBefore,
        "generation should occur without waiting for next_automation_run_at",
      );
    } finally {
      await restoreFakeOrderSettings(pool, settingsSnap);
      client.release();
    }
  });

  it("C: automation_enabled=false blocks generation", { timeout: 60_000 }, async (t) => {
    const { pool } = require("../src/config/db");
    const fakeOrdersService = require("../src/services/fakeOrdersService");
    const adminId = await requireIntegrationPrereqs(pool, t);
    if (!adminId) return;

    const settingsSnap = await snapshotFakeOrderSettings(pool);

    try {
      await shrinkVisibleCount(pool, 2);
      const maxRoundBefore = await maxActiveRoundId(pool);
      const cov = await getTrainingPoolCoverage(pool);
      const minTarget = Math.min(
        Number(settingsSnap.max_orders) || 10,
        Math.max(Number(settingsSnap.min_orders) || 1, cov.visibleCount + 2),
      );

      await pool.query(
        `UPDATE fake_order_settings
         SET training_orders_enabled = TRUE,
             automation_enabled = FALSE,
             min_orders = $1,
             next_automation_run_at = NOW() - INTERVAL '1 hour',
             updated_at = NOW()
         WHERE id = 1`,
        [minTarget],
      );

      await fakeOrdersService.runAutomationTick();

      const maxRoundAfter = await maxActiveRoundId(pool);
      assert.equal(maxRoundAfter, maxRoundBefore, "no new rounds when automation_enabled=false");

      const health = await fakeOrdersService.getFakeOrdersAutomationHealth();
      assert.ok(
        health.warnings.includes("db_automation_disabled"),
        `expected db_automation_disabled warning, got: ${health.warnings.join(", ")}`,
      );
      assert.equal(health.db.automationEnabled, false);
      assert.equal(health.db.trainingOrdersEnabled, true);
    } finally {
      await restoreFakeOrderSettings(pool, settingsSnap);
    }
  });

  it("D: training_orders_enabled=false blocks generation", { timeout: 60_000 }, async (t) => {
    const { pool } = require("../src/config/db");
    const fakeOrdersService = require("../src/services/fakeOrdersService");
    const adminId = await requireIntegrationPrereqs(pool, t);
    if (!adminId) return;

    const settingsSnap = await snapshotFakeOrderSettings(pool);

    try {
      const maxRoundBefore = await maxActiveRoundId(pool);

      await pool.query(
        `UPDATE fake_order_settings
         SET training_orders_enabled = FALSE,
             automation_enabled = TRUE,
             next_automation_run_at = NOW() - INTERVAL '1 hour',
             updated_at = NOW()
         WHERE id = 1`,
      );

      await fakeOrdersService.runAutomationTick();

      const maxRoundAfter = await maxActiveRoundId(pool);
      assert.equal(maxRoundAfter, maxRoundBefore, "no new rounds when training_orders_enabled=false");

      const health = await fakeOrdersService.getFakeOrdersAutomationHealth();
      assert.ok(
        health.warnings.includes("training_orders_disabled"),
        `expected training_orders_disabled warning, got: ${health.warnings.join(", ")}`,
      );
      assert.equal(health.db.trainingOrdersEnabled, false);
      assert.equal(health.db.automationEnabled, true);
    } finally {
      await restoreFakeOrderSettings(pool, settingsSnap);
    }
  });

  it("E: true overlap generation keeps old round visible", { timeout: 90_000 }, async (t) => {
    const { pool } = require("../src/config/db");
    const fakeOrdersService = require("../src/services/fakeOrdersService");
    const adminId = await requireIntegrationPrereqs(pool, t);
    if (!adminId) return;

    const settingsSnap = await snapshotFakeOrderSettings(pool);
    const client = await pool.connect();
    let roundId = null;

    try {
      await client.query("BEGIN");
      const gen = await generateTestRound(client, adminId, { supersedeExisting: true });
      await client.query("COMMIT");
      roundId = Number(gen.round.id);

      const overlapMs = getOverlapThresholdMs();
      const until = new Date(Date.now() + overlapMs - 60_000);
      await setAllActiveItemsVisibleUntil(pool, until);

      const hasLater = await fakeOrdersService.hasVisibleItemsExpiringAfter(pool, until);
      if (hasLater) {
        t.skip("environment has staggered visible_until; cannot isolate uniform overlap wave");
        return;
      }

      await pool.query(
        `UPDATE fake_order_settings
         SET training_orders_enabled = TRUE,
             automation_enabled = TRUE,
             next_automation_run_at = NOW() - INTERVAL '1 minute',
             updated_at = NOW()
         WHERE id = 1`,
      );

      const roundsBefore = (await getTrainingPoolCoverage(pool)).activeRounds;
      await fakeOrdersService.runAutomationTick();

      const covAfter = await getTrainingPoolCoverage(pool);
      const settings = await getSettings();

      assert.ok(covAfter.visibleCount > 0, "overlap generation must keep marketplace visible");
      assert.ok(
        covAfter.activeRounds >= roundsBefore,
        "active rounds should not decrease during overlap",
      );

      const oldStillVisible = await countActiveRoundItems(pool, roundId);
      if (covAfter.activeRounds > 1) {
        assert.ok(oldStillVisible > 0, "old round must stay visible until expiry (supersedeExisting=false)");
      }

      if (covAfter.earliestVisibleUntil && settings.nextAutomationRunAt) {
        const nextRun = new Date(settings.nextAutomationRunAt).getTime();
        const earliest = new Date(covAfter.earliestVisibleUntil).getTime();
        assert.ok(
          nextRun <= earliest,
          "next_automation_run_at should not be scheduled after earliest visible_until",
        );
      }
    } finally {
      await restoreFakeOrderSettings(pool, settingsSnap);
      client.release();
    }
  });

  it("F: multiple active rounds still protect visibility", { timeout: 90_000 }, async (t) => {
    const { pool } = require("../src/config/db");
    const fakeOrdersService = require("../src/services/fakeOrdersService");
    const adminId = await requireIntegrationPrereqs(pool, t);
    if (!adminId) return;

    const settingsSnap = await snapshotFakeOrderSettings(pool);
    const client = await pool.connect();
    let roundSoon = null;
    let roundLate = null;

    try {
      await client.query("BEGIN");
      const gen1 = await generateTestRound(client, adminId, { supersedeExisting: true });
      roundSoon = Number(gen1.round.id);
      const gen2 = await generateTestRound(client, adminId, { supersedeExisting: false });
      roundLate = Number(gen2.round.id);
      await client.query("COMMIT");

      const overlapMs = getOverlapThresholdMs();
      await setRoundItemsVisibleUntil(pool, roundSoon, new Date(Date.now() + overlapMs - 30_000));
      await setRoundItemsVisibleUntil(
        pool,
        roundLate,
        new Date(Date.now() + overlapMs + 2 * 60 * 60 * 1000),
      );

      await pool.query(
        `UPDATE fake_order_settings
         SET training_orders_enabled = TRUE,
             automation_enabled = TRUE,
             next_automation_run_at = NOW() - INTERVAL '1 minute',
             updated_at = NOW()
         WHERE id = 1`,
      );

      const before = await getTrainingPoolCoverage(pool);
      assert.ok(before.activeRounds >= 2, "precondition: multiple active rounds");
      assert.ok(before.visibleCount > 0, "precondition: visible orders exist");

      await fakeOrdersService.runAutomationTick();

      const after = await getTrainingPoolCoverage(pool);
      assert.ok(after.visibleCount > 0, "visibility protected with multiple/partial active rounds");
      assert.ok(
        after.activeRounds >= 1,
        "overlap logic must not require exactly one active round",
      );
    } finally {
      await restoreFakeOrderSettings(pool, settingsSnap);
      client.release();
    }
  });

  it("G: visibility proof guard rejects ineligible explicit IDs", { timeout: 60_000 }, async (t) => {
    const { pool } = require("../src/config/db");
    const fakeOrdersService = require("../src/services/fakeOrdersService");
    const adminId = await requireIntegrationPrereqs(pool, t);
    if (!adminId) return;

    const client = await pool.connect();
    let fakeOrderId = null;

    try {
      await client.query("BEGIN");
      const gen = await generateTestRound(client, adminId, { supersedeExisting: false });
      await client.query("COMMIT");

      const { rows } = await pool.query(
        `SELECT fo.id
         FROM fake_orders fo
         INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
         WHERE ri.round_id = $1
         ORDER BY fo.id ASC
         LIMIT 1`,
        [Number(gen.round.id)],
      );
      fakeOrderId = Number(rows[0]?.id);
      assert.ok(fakeOrderId > 0, "expected fake order from test round");

      await pool.query(
        `UPDATE fake_order_round_items
         SET status = 'expired', visible_until = NOW() - INTERVAL '1 hour', updated_at = NOW()
         WHERE fake_order_id = $1`,
        [fakeOrderId],
      );
      await pool.query(
        `UPDATE fake_orders
         SET is_published = FALSE,
             is_open_for_pool = FALSE,
             was_marketplace_visible = FALSE,
             first_visible_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [fakeOrderId],
      );

      const { rows: pre } = await pool.query(
        `SELECT was_marketplace_visible, first_visible_at FROM fake_orders WHERE id = $1`,
        [fakeOrderId],
      );
      assert.equal(pre[0].was_marketplace_visible, false);
      assert.equal(pre[0].first_visible_at, null);

      await fakeOrdersService.recordMarketplaceVisibleFakeOrders(pool, {
        fakeOrderIds: [fakeOrderId],
      });

      const { rows: proof } = await pool.query(
        `SELECT was_marketplace_visible, first_visible_at FROM fake_orders WHERE id = $1`,
        [fakeOrderId],
      );
      assert.equal(proof[0].was_marketplace_visible, false);
      assert.equal(proof[0].first_visible_at, null);
    } finally {
      client.release();
    }
  });
});
