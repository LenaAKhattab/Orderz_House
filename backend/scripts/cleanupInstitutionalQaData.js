/**
 * Controlled cleanup for institutional QA residue (institutions + linked storages).
 *
 * Dry-run (default — no deletion):
 *   npm run qa:institutions:cleanup
 *   node scripts/cleanupInstitutionalQaData.js
 *
 * Apply (explicit only):
 *   npm run qa:institutions:cleanup -- --apply --confirm=DELETE_QA_INSTITUTIONS
 *
 * Options:
 *   --created-before=YYYY-MM-DD
 *   --ids=1,2,3
 *   --prefix=QA-INST-   (repeatable; default set applies when omitted)
 *   --json              machine-readable report
 *
 * Never deletes real users. Refuses NODE_ENV=production and production-like DATABASE_URL.
 * Does not wipe the database. Does not touch unrelated institutions.
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { pool } = require("../src/config/db");
const {
  assertCleanupEnvironmentSafe,
  cleanupInstitutionalTestRecords,
} = require("../test/helpers/institutionalTestCleanup");

const CONFIRM_TOKEN = "DELETE_QA_INSTITUTIONS";

const DEFAULT_PREFIXES = [
  "QA-INST-",
  "QA Inst",
  "QA-INST ",
  "Inst Rel ",
  "Inst Race ",
  "QA-STOR-",
  "Storage Race ",
  "Storage Rel ",
  "E2E ",
  "QA-STOR-MGMT-",
  "QA-INST-MGMT-",
];

function parseArgs(argv) {
  const args = {
    apply: false,
    confirm: null,
    createdBefore: null,
    ids: [],
    prefixes: [],
    json: false,
  };
  for (const raw of argv) {
    if (raw === "--apply") args.apply = true;
    else if (raw === "--json") args.json = true;
    else if (raw.startsWith("--confirm=")) args.confirm = raw.slice("--confirm=".length);
    else if (raw.startsWith("--created-before=")) args.createdBefore = raw.slice("--created-before=".length);
    else if (raw.startsWith("--ids=")) {
      args.ids = raw
        .slice("--ids=".length)
        .split(",")
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    } else if (raw.startsWith("--prefix=")) {
      args.prefixes.push(raw.slice("--prefix=".length));
    }
  }
  if (!args.prefixes.length) args.prefixes = [...DEFAULT_PREFIXES];
  return args;
}

function matchesQaName(name, prefixes) {
  const n = String(name || "");
  return prefixes.some((p) => n.startsWith(p) || n.toLowerCase().startsWith(String(p).toLowerCase()));
}

async function loadInstitutionDependencies(client, institutionId) {
  const iid = Number(institutionId);
  const { rows: memberRows } = await client.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active
     FROM institution_members WHERE institution_id = $1`,
    [iid],
  );
  const { rows: linkRows } = await client.query(
    `SELECT s.id, s.name, s.status, s.created_by
     FROM institutional_storage_institutions si
     INNER JOIN institutional_order_storages s ON s.id = si.storage_id
     WHERE si.institution_id = $1
     ORDER BY s.id`,
    [iid],
  );
  const storageIds = linkRows.map((r) => Number(r.id));
  let storedOrders = 0;
  let releasedLive = 0;
  let bids = 0;
  let claims = 0;
  let nonQaActiveStorages = 0;
  const storageDetails = [];

  for (const s of linkRows) {
    const sid = Number(s.id);
    const { rows: so } = await client.query(
      `SELECT
         COUNT(*)::int AS c,
         COUNT(*) FILTER (WHERE released_order_id IS NOT NULL)::int AS released
       FROM institutional_stored_orders
       WHERE storage_id = $1 AND deleted_at IS NULL`,
      [sid],
    );
    storedOrders += Number(so[0]?.c || 0);
    releasedLive += Number(so[0]?.released || 0);

    const { rows: live } = await client.query(
      `SELECT o.id
       FROM orders o
       WHERE o.institutional_storage_id = $1
          OR o.institutional_stored_order_id IN (
               SELECT id FROM institutional_stored_orders WHERE storage_id = $1)
          OR o.id IN (
               SELECT released_order_id FROM institutional_stored_orders
               WHERE storage_id = $1 AND released_order_id IS NOT NULL)`,
      [sid],
    );
    const liveIds = live.map((r) => Number(r.id));
    if (liveIds.length) {
      const { rows: b } = await client.query(
        `SELECT COUNT(*)::int AS c FROM order_freelancer_bids WHERE order_id = ANY($1::bigint[])`,
        [liveIds],
      );
      const { rows: c } = await client.query(
        `SELECT COUNT(*)::int AS c FROM order_claims WHERE order_id = ANY($1::bigint[])`,
        [liveIds],
      );
      bids += Number(b[0]?.c || 0);
      claims += Number(c[0]?.c || 0);
    }

    const { rows: peerInst } = await client.query(
      `SELECT i.id, i.name
       FROM institutional_storage_institutions si
       INNER JOIN institutions i ON i.id = si.institution_id
       WHERE si.storage_id = $1 AND si.institution_id <> $2`,
      [sid, iid],
    );
    const peerNonQa = peerInst.filter((p) => !matchesQaName(p.name, DEFAULT_PREFIXES));

    const storageLooksQa = matchesQaName(s.name, DEFAULT_PREFIXES);
    if (s.status === "active" && !storageLooksQa) nonQaActiveStorages += 1;

    storageDetails.push({
      id: sid,
      name: s.name,
      status: s.status,
      storedOrders: Number(so[0]?.c || 0),
      releasedOrders: Number(so[0]?.released || 0),
      looksQa: storageLooksQa,
      peerInstitutions: peerInst.map((p) => ({ id: Number(p.id), name: p.name })),
      peerNonQaCount: peerNonQa.length,
    });
  }

  const sharedWithNonQa = storageDetails.some((s) => s.peerNonQaCount > 0);

  return {
    membersTotal: Number(memberRows[0]?.total || 0),
    membersActive: Number(memberRows[0]?.active || 0),
    linkedStorages: storageIds.length,
    storageIds,
    storageDetails,
    storedOrders,
    releasedLive,
    bids,
    claims,
    nonQaActiveStorages,
    sharedWithNonQa,
  };
}

function classifyCandidate(inst, deps, prefixes) {
  const nameOk = matchesQaName(inst.name, prefixes);
  if (!nameOk) {
    return { classification: "must_preserve", reason: "Name does not match approved QA prefixes" };
  }
  if (deps.sharedWithNonQa) {
    return {
      classification: "ambiguous",
      reason: "Linked storage is shared with a non-QA institution",
    };
  }
  if (deps.nonQaActiveStorages > 0) {
    return {
      classification: "ambiguous",
      reason: "Linked to active storage that does not look like QA residue",
    };
  }
  if (deps.bids > 0 || deps.claims > 0) {
    return {
      classification: "ambiguous",
      reason: "Released orders have bids or claims (possible real marketplace activity)",
    };
  }
  return {
    classification: "safe_test_residue",
    reason: "QA-prefixed name with no ambiguous live marketplace activity",
  };
}

async function discoverCandidates(client, args) {
  const params = [];
  const where = ["1=1"];
  if (args.ids.length) {
    params.push(args.ids);
    where.push(`i.id = ANY($${params.length}::bigint[])`);
  }
  if (args.createdBefore) {
    params.push(args.createdBefore);
    where.push(`i.created_at < $${params.length}::date`);
  }

  const { rows } = await client.query(
    `SELECT i.id, i.name, i.status, i.created_at, i.created_by,
       COALESCE(
         NULLIF(trim(concat_ws(' ', u.first_name, u.father_name, u.family_name)), ''),
         u.email
       ) AS created_by_name,
       u.email AS created_by_email
     FROM institutions i
     LEFT JOIN users u ON u.id = i.created_by
     WHERE ${where.join(" AND ")}
     ORDER BY i.id ASC`,
    params,
  );

  const candidates = [];
  for (const row of rows) {
    if (!args.ids.length && !matchesQaName(row.name, args.prefixes)) continue;
    const deps = await loadInstitutionDependencies(client, row.id);
    const { classification, reason } = classifyCandidate(row, deps, args.prefixes);
    candidates.push({
      id: Number(row.id),
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      createdBy: row.created_by != null ? String(row.created_by) : null,
      createdByName: row.created_by_name || null,
      createdByEmail: row.created_by_email || null,
      classification,
      reason,
      dependencies: deps,
    });
  }
  return candidates;
}

async function deleteOneInstitution(client, candidate) {
  // Per-institution transaction strategy: cleanup helper uses pool queries.
  // We delete via a dedicated client transaction wrapping scoped deletes.
  await client.query("BEGIN");
  try {
    const storageIds = candidate.dependencies.storageIds || [];
    // Use the shared helper against this client by temporarily wrapping.
    // Helper expects pool-like .query — client works.
    await cleanupInstitutionalTestRecords(client, {
      storageIds,
      institutionId: candidate.id,
      logPrefix: `[cleanupInstitutionalQaData:inst=${candidate.id}]`,
    });
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return { ok: false, error: e?.message || String(e) };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = {
    mode: args.apply ? "apply" : "dry-run",
    discovered: [],
    deleted: [],
    skipped: [],
    failed: [],
    preserved: [],
  };

  try {
    assertCleanupEnvironmentSafe();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (args.apply && args.confirm !== CONFIRM_TOKEN) {
    console.error(
      `Refusing apply: missing or invalid --confirm=${CONFIRM_TOKEN}`,
    );
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const candidates = await discoverCandidates(client, args);
    report.discovered = candidates;

    for (const c of candidates) {
      if (c.classification === "must_preserve") {
        report.preserved.push({ id: c.id, name: c.name, reason: c.reason });
        continue;
      }
      if (c.classification === "ambiguous" || c.classification === "still_referenced") {
        report.skipped.push({ id: c.id, name: c.name, reason: c.reason, classification: c.classification });
        continue;
      }
      if (c.classification !== "safe_test_residue") {
        report.skipped.push({ id: c.id, name: c.name, reason: c.reason || "Unknown classification" });
        continue;
      }

      if (!args.apply) {
        report.skipped.push({
          id: c.id,
          name: c.name,
          reason: "Dry-run: would delete (safe_test_residue)",
          classification: c.classification,
          dependencies: c.dependencies,
        });
        continue;
      }

      const result = await deleteOneInstitution(client, c);
      if (result.ok) {
        report.deleted.push({ id: c.id, name: c.name, storageIds: c.dependencies.storageIds });
      } else {
        report.failed.push({ id: c.id, name: c.name, error: result.error });
      }
    }
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log("=== Institutional QA institutions cleanup ===");
    console.log(`Mode: ${report.mode}`);
    console.log(`Discovered: ${report.discovered.length}`);
    for (const c of report.discovered) {
      console.log(
        `\n#${c.id} "${c.name}" [${c.status}] class=${c.classification}` +
          `\n  reason: ${c.reason}` +
          `\n  created_at=${c.createdAt} created_by=${c.createdByName || c.createdBy || "—"}` +
          `\n  members=${c.dependencies.membersActive}/${c.dependencies.membersTotal}` +
          ` storages=${c.dependencies.linkedStorages}` +
          ` storedOrders=${c.dependencies.storedOrders}` +
          ` released=${c.dependencies.releasedLive}` +
          ` bids=${c.dependencies.bids} claims=${c.dependencies.claims}`,
      );
      for (const s of c.dependencies.storageDetails || []) {
        console.log(`    storage #${s.id} "${s.name}" [${s.status}] qa=${s.looksQa} orders=${s.storedOrders}/${s.releasedOrders}`);
      }
    }
    console.log("\n--- Summary ---");
    console.log(`Would-delete / deleted: ${report.deleted.length || report.skipped.filter((s) => String(s.reason).startsWith("Dry-run")).length}`);
    console.log(`Skipped: ${report.skipped.length}`);
    console.log(`Failed: ${report.failed.length}`);
    console.log(`Preserved: ${report.preserved.length}`);
    if (report.mode === "dry-run") {
      console.log("\nNo deletion performed (dry-run). To apply:");
      console.log(`  npm run qa:institutions:cleanup -- --apply --confirm=${CONFIRM_TOKEN}`);
    }
  }

  if (report.failed.length) process.exit(1);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  matchesQaName,
  classifyCandidate,
  CONFIRM_TOKEN,
  DEFAULT_PREFIXES,
  discoverCandidates,
};
