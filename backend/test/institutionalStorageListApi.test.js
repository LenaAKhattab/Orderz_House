/**
 * Institutional storage list/API improvements (pagination, summary, institution validation).
 */
const path = require("node:path");
const fs = require("node:fs");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");
const { cleanupInstitutionalTestRecords } = require("./helpers/institutionalTestCleanup");

describe("institutional storage list source guards", () => {
  it("listStorages uses aggregated SQL and summary (no per-row getStorageMetrics)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/institutionalStorageService.js"),
      "utf8",
    );
    assert.match(src, /async function listStorages/);
    assert.match(src, /async function getStoragesSummary/);
    assert.match(src, /LEFT JOIN LATERAL/);
    assert.match(src, /consumed_amount/);
    assert.match(src, /NO_INSTITUTIONS_SELECTED/);
    assert.match(src, /INSTITUTION_NOT_FOUND/);
    assert.match(src, /INSTITUTION_INACTIVE/);
    assert.match(src, /total_orders_count/);
    assert.match(src, /totalOrdersCount/);
    assert.doesNotMatch(src, /approvedAllocatedJod|approved_allocated/);
    const listBody = src.slice(src.indexOf("async function listStorages"), src.indexOf("async function updateStorage"));
    assert.doesNotMatch(listBody, /getStorageMetrics\(/);
  });

  it("pending approvals expose budget preview fields", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/institutionalStoredOrdersService.js"),
      "utf8",
    );
    assert.match(src, /storageRemainingJod/);
    assert.match(src, /remainingAfterApprovalJod/);
    assert.match(src, /FINANCIAL_LIMIT_EXCEEDED/);
    assert.doesNotMatch(src, /storageApprovedAllocatedJod|approved_allocated/);
  });

  it("migration 117 adds list indexes without touching 112-116", () => {
    const mig = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/117_institutional_storage_list_indexes.sql"),
      "utf8",
    );
    assert.match(mig, /idx_inst_storages_start_date/);
    assert.match(mig, /idx_inst_stored_orders_storage_price_status/);
    assert.doesNotMatch(mig, /DROP TABLE/);
  });
});

const integrationOk = isIntegrationEnvConfigured();
const rootDescribe = integrationOk ? describe : describe.skip;

rootDescribe("institutional storage list (Postgres)", () => {
  async function seedActor(pool) {
    const email = `ios_list_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const accountId = `IL${Date.now().toString(36).slice(-8)}`.toUpperCase();
    const phone = `+96279${String(Date.now()).slice(-7)}`;
    const { rows } = await pool.query(
      `INSERT INTO users (
         account_id, email, password_hash, role, first_name, father_name, family_name,
         phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
       ) VALUES ($1, $2, 'x', 'super_admin', 'List', 'T', 'Tester', $3, $3, 'ذكر', 'JO', TRUE, TRUE, TRUE)
       RETURNING id`,
      [accountId, email, phone],
    );
    return Number(rows[0].id);
  }

  async function seedInstitution(pool, actorId, name, status = "active") {
    const { rows } = await pool.query(
      `INSERT INTO institutions (name, status, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [name, status, actorId],
    );
    return Number(rows[0].id);
  }

  it("paginates, filters, and returns summary without N+1 metrics", { timeout: 90_000 }, async () => {
    const { pool } = require("../src/config/db");
    const storageService = require("../src/services/institutionalStorageService");
    const actorId = await seedActor(pool);
    const stamp = Date.now();
    const instA = await seedInstitution(pool, actorId, `IOS Inst A ${stamp}`);
    const instB = await seedInstitution(pool, actorId, `IOS Inst B ${stamp}`);
    const inactive = await seedInstitution(pool, actorId, `IOS Inst Inactive ${stamp}`, "inactive");

    const created = [];
    const ids = {
      userIds: [actorId],
      institutionIds: [instA, instB, inactive],
      storageIds: [],
      logPrefix: "[institutionalStorageListApi]",
    };
    try {
      for (let i = 0; i < 3; i += 1) {
        const storage = await storageService.createStorage({
          actorUserId: actorId,
          payload: {
            name: `IOS List Storage ${stamp}-${i}`,
            financialLimitJod: 100 + i * 10,
            distributionMonths: 3,
            distributionStartDate: "2030-01-01",
            institutionIds: i === 0 ? [instA] : [instB],
          },
        });
        created.push(storage);
        ids.storageIds.push(storage.id);
      }

      const page1 = await storageService.listStorages({ page: 1, limit: 2, q: `IOS List Storage ${stamp}` });
      assert.equal(page1.pagination.limit, 2);
      assert.ok(page1.pagination.total >= 3);
      assert.equal(page1.storages.length, 2);
      assert.ok(page1.summary);
      assert.ok(page1.summary.totalStorages >= 3);
      assert.ok(Array.isArray(page1.storages[0].institutions));
      assert.ok(typeof page1.storages[0].remainingJod === "number");
      assert.equal(page1.storages[0].approvedAllocatedJod, undefined);
      assert.ok(typeof page1.summary.totalRemainingJod === "number");
      assert.equal(page1.summary.totalApprovedAllocatedJod, undefined);

      const filtered = await storageService.listStorages({
        institutionId: instA,
        q: `IOS List Storage ${stamp}`,
        limit: 20,
      });
      assert.ok(filtered.storages.every((s) => (s.institutions || []).some((i) => String(i.id) === String(instA))));

      const byStatus = await storageService.listStorages({
        status: "draft",
        q: `IOS List Storage ${stamp}`,
        limit: 20,
      });
      assert.ok(byStatus.storages.length >= 3);
      assert.ok(byStatus.storages.every((s) => s.status === "draft"));

      await assert.rejects(
        () =>
          storageService.createStorage({
            actorUserId: actorId,
            payload: {
              name: `IOS Bad ${stamp}`,
              financialLimitJod: 50,
              distributionMonths: 2,
              distributionStartDate: "2030-02-01",
              institutionIds: [],
            },
          }),
        (err) => err.publicCode === "NO_INSTITUTIONS_SELECTED",
      );

      await assert.rejects(
        () =>
          storageService.createStorage({
            actorUserId: actorId,
            payload: {
              name: `IOS Missing ${stamp}`,
              financialLimitJod: 50,
              distributionMonths: 2,
              distributionStartDate: "2030-02-01",
              institutionIds: [999999991],
            },
          }),
        (err) => err.publicCode === "INSTITUTION_NOT_FOUND",
      );

      await assert.rejects(
        () =>
          storageService.createStorage({
            actorUserId: actorId,
            payload: {
              name: `IOS Inactive ${stamp}`,
              financialLimitJod: 50,
              distributionMonths: 2,
              distributionStartDate: "2030-02-01",
              institutionIds: [inactive, instA],
            },
          }),
        (err) => err.publicCode === "INSTITUTION_INACTIVE",
      );

      const dup = await storageService.createStorage({
        actorUserId: actorId,
        payload: {
          name: `IOS Dedupe ${stamp}`,
          financialLimitJod: 40,
          distributionMonths: 2,
          distributionStartDate: "2030-03-01",
          institutionIds: [instA, instA, String(instA)],
        },
      });
      assert.equal((dup.institutions || []).length, 1);
      created.push(dup);
      ids.storageIds.push(dup.id);
    } finally {
      await cleanupInstitutionalTestRecords(pool, ids);
    }
  });
});
