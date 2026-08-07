/**
 * Institutions management service + wiring tests.
 */
const path = require("node:path");
const fs = require("node:fs");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");
const {
  assertCleanupEnvironmentSafe,
  cleanupInstitutionalTestRecords,
} = require("./helpers/institutionalTestCleanup");

describe("institutions management source guards", () => {
  it("mapper exposes createdBy and linked storage counts", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/institutionsService.js"), "utf8");
    assert.match(src, /createdBy:/);
    assert.match(src, /createdByName:/);
    assert.match(src, /linkedStorageCount/);
    assert.match(src, /activeStorageCount/);
    assert.match(src, /membershipTotalCount/);
    assert.match(src, /getDeactivationImpact/);
    assert.match(src, /listStoragesForInstitution/);
    assert.match(src, /getInstitutionsSummary/);
    assert.match(src, /DUPLICATE_INSTITUTION_NAME/);
    assert.match(src, /reactivated/);
    assert.match(src, /INSTITUTION_COUNT_JOINS|LEFT JOIN LATERAL/);
    assert.match(src, /COUNT\(\*\) OVER\(\)/);
    assert.match(src, /getInstitutionDetailBundle/);
    assert.match(
      src,
      /Promise\.all\(\[\s*getInstitutionById\(id\),\s*listMembers\(id/,
    );
    assert.match(src, /getInstitutionStatistics/);
    assert.match(src, /ordersCount|orders_count/);
    assert.match(src, /freezeInstitution|unfreezeInstitution/);
    assert.match(src, /INSTITUTION_FROZEN/);
    assert.match(src, /assertInstitutionNotFrozen/);
  });

  it("getInstitution controller supports bundle=1 detail payload", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/controllers/institutionalStorageController.js"),
      "utf8",
    );
    assert.match(src, /bundle/);
    assert.match(src, /getInstitutionDetailBundle/);
    assert.match(src, /membersPage/);
    assert.match(src, /storagesPage/);
    assert.match(src, /freezeInstitution/);
    assert.match(src, /unfreezeInstitution/);
    assert.match(src, /getInstitutionStatistics/);
  });

  it("freeze routes are super_admin only", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/routes/institutionalStorageRoutes.js"),
      "utf8",
    );
    assert.match(src, /institutions\/:id\/freeze/);
    assert.match(src, /institutions\/:id\/unfreeze/);
    assert.match(src, /institutions\/:id\/statistics/);
    assert.match(src, /requireAnyRole\(\["super_admin"\]\)/);
  });

  it("migration 119 adds frozen status and institution audit logs", () => {
    const mig = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/119_institution_frozen_status_and_audit.sql"),
      "utf8",
    );
    assert.match(mig, /frozen/);
    assert.match(mig, /institution_audit_logs/);
    assert.doesNotMatch(mig, /DROP TABLE/);
  });

  it("routes expose deactivation impact and linked storages", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/routes/institutionalStorageRoutes.js"),
      "utf8",
    );
    assert.match(src, /deactivation-impact/);
    assert.match(src, /institutions\/:id\/storages/);
    assert.match(src, /PERMISSION_KEYS\.INSTITUTIONS/);
  });

  it("institutions permission is assignable to delegated admins", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/constants/dashboardPermissions.js"),
      "utf8",
    );
    assert.match(src, /dashboard\.super_admin\.institutions/);
    assert.match(src, /institutionsManagement/);
  });

  it("cleanup helper refuses production and logs failures", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "./helpers/institutionalTestCleanup.js"),
      "utf8",
    );
    assert.match(src, /NODE_ENV=production/);
    assert.match(src, /cleanup step failed/);
    assert.match(src, /created_by_user_id/);
    assert.throws(() => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        assertCleanupEnvironmentSafe();
      } finally {
        process.env.NODE_ENV = prev;
      }
    }, /production/);
  });
});

const integrationOk = isIntegrationEnvConfigured();
const rootDescribe = integrationOk ? describe : describe.skip;

rootDescribe("institutions management (Postgres)", () => {
  async function seedActor(pool) {
    const email = `inst_mgmt_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const accountId = `IM${Date.now().toString(36).slice(-8)}`.toUpperCase();
    const phone = `+96279${String(Date.now()).slice(-7)}`;
    const { rows } = await pool.query(
      `INSERT INTO users (
         account_id, email, password_hash, role, first_name, father_name, family_name,
         phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
       ) VALUES ($1, $2, 'x', 'super_admin', 'Inst', 'M', 'Admin', $3, $3, 'ذكر', 'JO', TRUE, TRUE, TRUE)
       RETURNING id`,
      [accountId, email, phone],
    );
    return Number(rows[0].id);
  }

  async function seedMemberUser(pool) {
    const email = `inst_mem_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const accountId = `MM${Date.now().toString(36).slice(-8)}`.toUpperCase();
    const phone = `+96278${String(Date.now()).slice(-7)}`;
    const { rows } = await pool.query(
      `INSERT INTO users (
         account_id, email, password_hash, role, first_name, father_name, family_name,
         phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
       ) VALUES ($1, $2, 'x', 'freelancer', 'Mem', 'B', 'User', $3, $3, 'ذكر', 'JO', TRUE, TRUE, TRUE)
       RETURNING id`,
      [accountId, email, phone],
    );
    return Number(rows[0].id);
  }

  it("create, duplicate name, update, activate/deactivate, counts, membership", { timeout: 60_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");
    const ids = { userIds: [], institutionIds: [], storageId: null };

    try {
      const actorId = await seedActor(pool);
      ids.userIds.push(actorId);
      const memberId = await seedMemberUser(pool);
      ids.userIds.push(memberId);

      const name = `QA-INST-MGMT-${Date.now()}`;
      const created = await institutionsService.createInstitution({
        actorUserId: actorId,
        name,
        description: "mgmt test",
        status: "active",
      });
      ids.institutionIds.push(Number(created.id));
      assert.equal(created.name, name);
      assert.ok(created.createdBy);
      assert.equal(created.memberCount, 0);
      assert.equal(created.linkedStorageCount, 0);

      await assert.rejects(
        () =>
          institutionsService.createInstitution({
            actorUserId: actorId,
            name,
          }),
        (err) => err.statusCode === 409 && err.publicCode === "DUPLICATE_INSTITUTION_NAME",
      );

      const updated = await institutionsService.updateInstitution({
        id: created.id,
        patch: { description: "updated desc", name: `${name}-v2` },
      });
      assert.equal(updated.institution.description, "updated desc");
      assert.equal(updated.institution.name, `${name}-v2`);

      const add1 = await institutionsService.addMember({
        institutionId: created.id,
        userId: memberId,
        actorUserId: actorId,
      });
      assert.equal(add1.reactivated, false);
      assert.equal(add1.member.status, "active");

      await assert.rejects(
        () =>
          institutionsService.addMember({
            institutionId: created.id,
            userId: memberId,
            actorUserId: actorId,
          }),
        (err) => err.statusCode === 409 && err.publicCode === "DUPLICATE_MEMBERSHIP",
      );

      await institutionsService.removeMember({ institutionId: created.id, userId: memberId });
      const add2 = await institutionsService.addMember({
        institutionId: created.id,
        userId: memberId,
        actorUserId: actorId,
      });
      assert.equal(add2.reactivated, true);

      const afterMember = await institutionsService.getInstitutionById(created.id);
      assert.equal(afterMember.memberCount, 1);
      assert.ok(afterMember.membershipTotalCount >= 1);

      const storage = await storageService.createStorage({
        actorUserId: actorId,
        payload: {
          name: `QA-STOR-MGMT-${Date.now()}`,
          financialLimitJod: 50,
          distributionMonths: 2,
          distributionStartDate: new Date().toISOString().slice(0, 10),
          institutionIds: [Number(created.id)],
        },
      });
      ids.storageId = Number(storage.id);

      const withLink = await institutionsService.getInstitutionById(created.id);
      assert.equal(withLink.linkedStorageCount, 1);

      const impact = await institutionsService.getDeactivationImpact(created.id);
      assert.equal(impact.linkedStorageCount, 1);
      assert.equal(impact.activeMemberCount, 1);
      assert.ok(["critical", "high", "medium", "low"].includes(impact.warningLevel));

      const deactivated = await institutionsService.updateInstitution({
        id: created.id,
        patch: { status: "inactive" },
      });
      assert.equal(deactivated.institution.status, "inactive");
      assert.ok(deactivated.deactivationImpact);
      assert.equal(deactivated.institution.linkedStorageCount, 1);

      const list = await institutionsService.listInstitutions({ status: "inactive", q: "QA-INST-MGMT", limit: 20 });
      assert.ok(list.summary);
      assert.ok(list.summary.totalInstitutions >= 1);
      assert.ok((list.institutions || []).some((i) => String(i.id) === String(created.id)));

      const linked = await institutionsService.listStoragesForInstitution(created.id);
      assert.equal(linked.storages.length, 1);
      assert.equal(String(linked.storages[0].id), String(storage.id));

      const bundle = await institutionsService.getInstitutionDetailBundle(created.id, {
        membersPage: 1,
        membersLimit: 20,
        storagesPage: 1,
        storagesLimit: 20,
      });
      assert.ok(bundle);
      assert.equal(String(bundle.institution.id), String(created.id));
      assert.ok(Array.isArray(bundle.members));
      assert.ok(bundle.members.some((m) => String(m.userId) === String(memberId)));
      assert.ok(Array.isArray(bundle.storages));
      assert.equal(String(bundle.storages[0].id), String(storage.id));
      assert.ok(bundle.membersPagination);
      assert.ok(bundle.storagesPagination);
      assert.ok(bundle.statistics);
      assert.equal(bundle.statistics.usersCount, 1);
      assert.equal(typeof bundle.statistics.ordersCount, "number");
      assert.equal(typeof bundle.statistics.ordersTotalAmount, "number");

      await institutionsService.updateInstitution({
        id: created.id,
        patch: { status: "active" },
      });

      const frozen = await institutionsService.freezeInstitution({
        id: created.id,
        actorUserId: actorId,
      });
      assert.equal(frozen.institution.status, "frozen");
      assert.equal(frozen.alreadyFrozen, false);

      const frozenAgain = await institutionsService.freezeInstitution({
        id: created.id,
        actorUserId: actorId,
      });
      assert.equal(frozenAgain.alreadyFrozen, true);

      await assert.rejects(
        () =>
          institutionsService.addMember({
            institutionId: created.id,
            userId: memberId,
            actorUserId: actorId,
          }),
        (err) => err.publicCode === "INSTITUTION_FROZEN" || err.code === "INSTITUTION_FROZEN",
      );

      await assert.rejects(
        () =>
          institutionsService.updateInstitution({
            id: created.id,
            patch: { description: "blocked while frozen" },
          }),
        (err) => err.publicCode === "INSTITUTION_FROZEN" || err.code === "INSTITUTION_FROZEN",
      );

      const activeIdsWhileFrozen = await institutionsService.listActiveInstitutionIdsForUser(memberId);
      assert.equal(activeIdsWhileFrozen.includes(Number(created.id)), false);

      const unfrozen = await institutionsService.unfreezeInstitution({
        id: created.id,
        actorUserId: actorId,
      });
      assert.equal(unfrozen.institution.status, "active");

      const activeIdsAfter = await institutionsService.listActiveInstitutionIdsForUser(memberId);
      assert.equal(activeIdsAfter.includes(Number(created.id)), true);
    } finally {
      await cleanupInstitutionalTestRecords(pool, {
        ...ids,
        logPrefix: "[institutionsManagement]",
      });
    }
  });
});
