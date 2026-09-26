/* Staging smoke: Institutions V2 Phase2 direct order create + visibility (no Production). */
process.env.APP_ENV = "staging";
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.staging") });

const { Pool } = require("pg");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || /wandering-cherry/i.test(url)) {
  console.error("Refusing: not Staging");
  process.exit(1);
}

// Force pool to staging URL before service imports.
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;

const { pool } = require("../src/config/db");
const institutionsService = require("../src/services/institutionsService");
const institutionWorkService = require("../src/services/institutionWorkService");
const stored = require("../src/services/institutionalStoredOrdersService");

(async () => {
  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE role IN ('super_admin','admin') AND is_active = TRUE ORDER BY id ASC LIMIT 1`,
  );
  if (!admins[0]) throw new Error("no admin user on staging");
  const actorUserId = Number(admins[0].id);

  const stamp = Date.now();
  const name = `QA Phase2 Inst ${stamp}`;
  const institution = await institutionsService.createInstitution({
    actorUserId,
    name,
    description: "staging smoke institutions v2 phase2",
    status: "active",
  });
  console.log("institution", institution.id, "actor", actorUserId);

  // Prefer an existing category
  const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id ASC LIMIT 1`);
  if (!cats[0]) throw new Error("no categories");

  const created = await institutionWorkService.createInstitutionOrder({
    institutionId: institution.id,
    actorUserId,
    actorRole: "super_admin",
    payload: {
      title: `QA Phase2 Order ${stamp}`,
      description: "Staging smoke direct institution order — bidding",
      categoryId: cats[0].id,
      projectType: "bidding",
      bidBudgetMin: 10,
      bidBudgetMax: 50,
      durationValue: 3,
      durationUnit: "days",
      preferredSkills: ["qa"],
    },
    publish: true,
  });
  const orderId = created.order.id;
  console.log("order", orderId, created.order.visibilityScope, created.order.institutionId);

  const { rows: ord } = await pool.query(
    `SELECT id, visibility_scope, institution_id, payment_required, payment_status, source_type
       FROM orders WHERE id = $1`,
    [orderId],
  );
  console.log("row", ord[0]);

  const accessMissing = await stored.assertUserCanViewInstitutionalOrder(999999991, orderId);
  console.log("non-member access", accessMissing);

  const listed = await institutionWorkService.listInstitutionWork(institution.id, { limit: 10 });
  console.log(
    "list items",
    listed.items.map((i) => ({ id: i.id, type: i.workType, source: i.source })),
  );

  // Soft cleanup: deactivate institution (retain order history)
  await institutionsService.softDeleteOrArchiveInstitution({
    id: institution.id,
    actorUserId,
  });
  console.log("STAGING_SMOKE_PHASE2_OK");
  await pool.end();
})().catch(async (e) => {
  console.error("SMOKE_FAILED", e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
