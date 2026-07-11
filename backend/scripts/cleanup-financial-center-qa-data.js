/**
 * Remove QA / mock financial-center rows created by manual test scripts (e.g. qaFinancialCenter.js).
 *
 * Dry-run (default — no writes):
 *   node scripts/cleanup-financial-center-qa-data.js
 *
 * Execute delete (transaction):
 *   node scripts/cleanup-financial-center-qa-data.js --confirm
 *
 * Never auto-runs. Does not drop tables or change schema.
 */

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const { pool } = require("../src/config/db");

const isConfirm = process.argv.includes("--confirm");

const DEFAULT_DEPARTMENT_NAMES = ["operations", "hr", "it", "other"];

/** SQL fragments — conservative patterns matching qaFinancialCenter.js output */
const QA_PERSON_WHERE = `
  p.full_name ILIKE 'QA %'
  OR p.full_name ILIKE 'QA NoAcct%'
  OR p.full_name ILIKE 'QA WithAcct%'
  OR p.full_name ILIKE 'QA DupEmail%'
  OR p.email ILIKE 'fc-qa-%@example.com'
`;

const QA_BONUS_ROW_WHERE = `
  br.title ILIKE 'QA Row%'
  OR br.title ILIKE 'QA %'
  OR br.received_note ILIKE 'QA partial%'
`;

const QA_DEPARTMENT_WHERE = `
  fd.is_default = FALSE
  AND (
    fd.name ILIKE '%qa%'
    OR fd.name ILIKE '%test%'
    OR fd.name ILIKE '%mock%'
    OR fd.name ILIKE '%demo%'
  )
  AND lower(trim(fd.name)) NOT IN (${DEFAULT_DEPARTMENT_NAMES.map((n) => `'${n}'`).join(", ")})
`;

async function collectQaTargets(client) {
  const peopleRes = await client.query(
    `SELECT p.id, p.full_name, p.email, p.user_id, p.status, p.created_at
     FROM financial_people p
     WHERE ${QA_PERSON_WHERE}
     ORDER BY p.id`,
  );

  const rowsRes = await client.query(
    `SELECT br.id, br.title, br.month_key, br.status, br.created_at
     FROM financial_bonus_rows br
     WHERE ${QA_BONUS_ROW_WHERE}
     ORDER BY br.id`,
  );

  const peopleIds = peopleRes.rows.map((r) => Number(r.id));
  const rowIds = rowsRes.rows.map((r) => Number(r.id));

  let allocRes = { rows: [] };
  if (peopleIds.length || rowIds.length) {
    const clauses = [];
    const params = [];
    if (rowIds.length) {
      params.push(rowIds);
      clauses.push(`a.bonus_row_id = ANY($${params.length}::bigint[])`);
    }
    if (peopleIds.length) {
      params.push(peopleIds);
      clauses.push(`a.person_id = ANY($${params.length}::bigint[])`);
    }
    allocRes = await client.query(
      `SELECT a.id, a.bonus_row_id, a.person_id, a.paid_status
       FROM financial_bonus_allocations a
       WHERE ${clauses.join(" OR ")}
       ORDER BY a.id`,
      params,
    );
  }

  const allocIds = allocRes.rows.map((r) => Number(r.id));

  let auditRes = { rows: [] };
  if (peopleIds.length || rowIds.length || allocIds.length) {
    auditRes = await client.query(
      `SELECT l.id, l.entity_type, l.entity_id, l.action, l.created_at
       FROM financial_audit_logs l
       WHERE (l.entity_type = 'financial_person' AND l.entity_id = ANY($1::bigint[]))
          OR (l.entity_type = 'financial_bonus_row' AND l.entity_id = ANY($2::bigint[]))
          OR (l.entity_type = 'financial_bonus_allocation' AND l.entity_id = ANY($3::bigint[]))
       ORDER BY l.id`,
      [
        peopleIds.length ? peopleIds : [0],
        rowIds.length ? rowIds : [0],
        allocIds.length ? allocIds : [0],
      ],
    );
  }

  const usersRes = await client.query(
    `SELECT u.id, u.email, u.role, u.is_active, p.id AS person_id, p.full_name
     FROM users u
     JOIN financial_people p ON p.user_id = u.id
     WHERE u.role = 'financial_user'
       AND p.id = ANY($1::bigint[])
     ORDER BY u.id`,
    [peopleIds.length ? peopleIds : [0]],
  );

  const extraUsersRes = await client.query(
    `SELECT u.id, u.email, u.role, u.is_active, p.id AS person_id, p.full_name
     FROM users u
     JOIN financial_people p ON p.user_id = u.id
     WHERE u.role = 'financial_user'
       AND u.email ILIKE 'fc-qa-%@example.com'
       AND NOT (p.id = ANY($1::bigint[]))
     ORDER BY u.id`,
    [peopleIds.length ? peopleIds : [0]],
  );

  const deptRes = await client.query(
    `SELECT fd.id, fd.name, fd.slug, fd.is_default
     FROM financial_departments fd
     WHERE ${QA_DEPARTMENT_WHERE}
     ORDER BY fd.id`,
  );

  const userIds = [
    ...new Set([
      ...usersRes.rows.map((r) => Number(r.id)),
      ...extraUsersRes.rows.map((r) => Number(r.id)),
    ]),
  ];

  return {
    people: peopleRes.rows,
    bonusRows: rowsRes.rows,
    allocations: allocRes.rows,
    auditLogs: auditRes.rows,
    users: [...usersRes.rows, ...extraUsersRes.rows],
    departments: deptRes.rows,
    ids: {
      peopleIds,
      rowIds,
      allocIds,
      auditIds: auditRes.rows.map((r) => Number(r.id)),
      userIds,
      departmentIds: deptRes.rows.map((r) => Number(r.id)),
    },
  };
}

function printReport(targets) {
  const { people, bonusRows, allocations, auditLogs, users, departments } = targets;

  console.log("\n=== Financial Center QA cleanup — dry-run report ===\n");
  console.log(`Mode: ${isConfirm ? "DELETE (--confirm)" : "DRY-RUN (no changes)"}\n`);

  console.log(`QA people to delete: ${people.length}`);
  for (const p of people) {
    console.log(`  - person #${p.id}: ${p.full_name}${p.email ? ` <${p.email}>` : ""}`);
  }

  console.log(`\nQA bonus rows to delete: ${bonusRows.length}`);
  for (const r of bonusRows) {
    console.log(`  - row #${r.id}: ${r.title} (${r.month_key}, ${r.status})`);
  }

  console.log(`\nAllocations to delete: ${allocations.length}`);
  for (const a of allocations) {
    console.log(`  - allocation #${a.id}: row=${a.bonus_row_id} person=${a.person_id} (${a.paid_status})`);
  }

  console.log(`\nAudit logs to delete: ${auditLogs.length}`);
  if (auditLogs.length <= 12) {
    for (const l of auditLogs) {
      console.log(`  - log #${l.id}: ${l.entity_type}#${l.entity_id} ${l.action}`);
    }
  } else {
    console.log(`  - ids ${auditLogs[0].id} … ${auditLogs[auditLogs.length - 1].id} (${auditLogs.length} total)`);
  }

  console.log(`\nfinancial_user accounts to delete: ${users.length}`);
  for (const u of users) {
    console.log(`  - user #${u.id}: ${u.email} (person #${u.person_id} ${u.full_name})`);
  }

  console.log(`\nQA departments to delete: ${departments.length}`);
  for (const d of departments) {
    console.log(`  - dept #${d.id}: ${d.name}`);
  }

  if (
    !people.length &&
    !bonusRows.length &&
    !allocations.length &&
    !auditLogs.length &&
    !users.length &&
    !departments.length
  ) {
    console.log("\nNothing matched QA patterns. No action needed.");
  } else if (!isConfirm) {
    console.log("\nTo execute deletion, run:");
    console.log("  node scripts/cleanup-financial-center-qa-data.js --confirm");
  }
}

async function executeCleanup(client, ids) {
  const summary = {
    auditLogs: 0,
    allocations: 0,
    bonusRows: 0,
    people: 0,
    users: 0,
    departments: 0,
  };

  if (ids.auditIds.length) {
    const res = await client.query(`DELETE FROM financial_audit_logs WHERE id = ANY($1::bigint[])`, [
      ids.auditIds,
    ]);
    summary.auditLogs = res.rowCount || 0;
  }

  if (ids.allocIds.length) {
    const res = await client.query(`DELETE FROM financial_bonus_allocations WHERE id = ANY($1::bigint[])`, [
      ids.allocIds,
    ]);
    summary.allocations = res.rowCount || 0;
  }

  if (ids.rowIds.length) {
    const res = await client.query(`DELETE FROM financial_bonus_rows WHERE id = ANY($1::bigint[])`, [ids.rowIds]);
    summary.bonusRows = res.rowCount || 0;
  }

  if (ids.peopleIds.length) {
    const res = await client.query(`DELETE FROM financial_people WHERE id = ANY($1::bigint[])`, [ids.peopleIds]);
    summary.people = res.rowCount || 0;
  }

  if (ids.userIds.length) {
    const res = await client.query(
      `DELETE FROM users WHERE id = ANY($1::bigint[]) AND role = 'financial_user'`,
      [ids.userIds],
    );
    summary.users = res.rowCount || 0;
  }

  if (ids.departmentIds.length) {
    const res = await client.query(
      `DELETE FROM financial_departments
       WHERE id = ANY($1::bigint[])
         AND is_default = FALSE
         AND lower(trim(name)) NOT IN (${DEFAULT_DEPARTMENT_NAMES.map((n) => `'${n}'`).join(", ")})`,
      [ids.departmentIds],
    );
    summary.departments = res.rowCount || 0;
  }

  return summary;
}

async function printPostCounts(client) {
  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM financial_people) AS people,
      (SELECT COUNT(*)::int FROM financial_bonus_rows) AS bonus_rows,
      (SELECT COUNT(*)::int FROM financial_bonus_allocations) AS allocations,
      (SELECT COUNT(*)::int FROM financial_audit_logs) AS audit_logs,
      (SELECT COUNT(*)::int FROM financial_departments WHERE is_default = TRUE) AS default_departments
  `);
  console.log("\n=== Remaining counts ===");
  console.log(rows[0]);
}

async function main() {
  const client = await pool.connect();
  try {
    const targets = await collectQaTargets(client);
    printReport(targets);

    if (!isConfirm) {
      return;
    }

    if (
      !targets.ids.peopleIds.length &&
      !targets.ids.rowIds.length &&
      !targets.ids.allocIds.length &&
      !targets.ids.auditIds.length &&
      !targets.ids.userIds.length &&
      !targets.ids.departmentIds.length
    ) {
      return;
    }

    await client.query("BEGIN");
    try {
      const summary = await executeCleanup(client, targets.ids);
      await client.query("COMMIT");
      console.log("\n=== Deletion summary ===");
      console.log(summary);
      await printPostCounts(client);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
