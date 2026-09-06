/**
 * Cleanup mobile QA operational data only (pool orders + related claims/work).
 *
 * Targets titles / markers from seed-mobile-qa-users.js:
 *   - "QA-2C Pool Fixed (mobile QA)"
 *   - "QA-2C Pool Bidding (mobile QA)"
 *   - request_title / order titles containing "(mobile QA)"
 *
 * Does NOT delete users (including qa.client@ / qa.freelancer@ accounts).
 * Does NOT touch Production. Uses backend/.env.staging by default.
 *
 * Dry-run:
 *   node scripts/cleanup-mobile-qa-operational-data.js
 *
 * Delete:
 *   node scripts/cleanup-mobile-qa-operational-data.js --confirm
 */

const path = require("node:path");
const dotenv = require("dotenv");

const envFile = process.env.QA_CLEANUP_ENV_FILE || path.join(__dirname, "..", ".env.staging");
dotenv.config({ path: envFile, override: true });

const { guardQaOrSeed } = require("./lib/assertScriptDatabaseAllowed");
guardQaOrSeed(path.basename(__filename));

const { pool } = require("../src/config/db");
const { maskDatabaseTarget } = require("../src/utils/databaseEnvironmentSafety");

const isConfirm = process.argv.includes("--confirm");

const QA_ORDER_TITLE_PATTERNS = [
  "QA-2C Pool Fixed (mobile QA)",
  "QA-2C Pool Bidding (mobile QA)",
];

async function tableExists(client, name) {
  const { rows } = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${name}`]);
  return Boolean(rows[0]?.reg);
}

async function collect(client) {
  const ordersRes = await client.query(
    `SELECT id, order_code, title, order_status, payment_status, created_by_user_id, assigned_freelancer_id
     FROM orders
     WHERE title = ANY($1::text[])
        OR title ILIKE '%(mobile QA)%'
        OR title ILIKE 'QA-2C Pool%'
     ORDER BY id`,
    [QA_ORDER_TITLE_PATTERNS],
  );

  const orderIds = ordersRes.rows.map((r) => Number(r.id));
  const orderCodes = ordersRes.rows.map((r) => String(r.order_code || "")).filter(Boolean);

  const claimsRes = await client.query(
    `SELECT id, freelancer_id, project_id, order_number, request_title, status, total_price_snapshot
     FROM financial_claims
     WHERE request_title ILIKE '%(mobile QA)%'
        OR request_title ILIKE 'QA-2C Pool%'
        OR ($1::bigint[] <> '{}'::bigint[] AND project_id = ANY($1::bigint[]))
        OR ($2::text[] <> '{}'::text[] AND order_number = ANY($2::text[]))
     ORDER BY id`,
    [orderIds.length ? orderIds : [0], orderCodes.length ? orderCodes : ["__none__"]],
  );

  // Avoid matching the sentinel when no orders: filter out project_id=0 noise
  const claims = claimsRes.rows.filter((c) => {
    const title = String(c.request_title || "");
    if (/\(mobile QA\)/i.test(title) || /^QA-2C Pool/i.test(title)) return true;
    if (orderIds.includes(Number(c.project_id))) return true;
    if (orderCodes.includes(String(c.order_number || ""))) return true;
    return false;
  });

  const claimIds = claims.map((c) => Number(c.id));

  let bids = [];
  let submissions = [];
  let orderFiles = [];
  let reviews = [];
  let orderClaims = [];
  let history = [];
  let notifications = [];

  if (orderIds.length) {
    const bidsRes = await client.query(
      `SELECT id, order_id, freelancer_id, amount, status
       FROM order_freelancer_bids WHERE order_id = ANY($1::bigint[]) ORDER BY id`,
      [orderIds],
    );
    bids = bidsRes.rows;

    const subsRes = await client.query(
      `SELECT id, order_id FROM order_submissions WHERE order_id = ANY($1::bigint[]) ORDER BY id`,
      [orderIds],
    );
    submissions = subsRes.rows;

    if (submissions.length && (await tableExists(client, "order_files"))) {
      const filesRes = await client.query(
        `SELECT id, submission_id FROM order_files
         WHERE submission_id = ANY($1::bigint[]) ORDER BY id`,
        [submissions.map((s) => Number(s.id))],
      );
      orderFiles = filesRes.rows;
    }

    if (await tableExists(client, "freelancer_reviews")) {
      const revRes = await client.query(
        `SELECT id, order_id FROM freelancer_reviews WHERE order_id = ANY($1::bigint[]) ORDER BY id`,
        [orderIds],
      );
      reviews = revRes.rows;
    }

    if (await tableExists(client, "order_claims")) {
      const ocRes = await client.query(
        `SELECT id, order_id FROM order_claims WHERE order_id = ANY($1::bigint[]) ORDER BY id`,
        [orderIds],
      );
      orderClaims = ocRes.rows;
    }
  }

  if (claimIds.length && (await tableExists(client, "financial_claim_status_history"))) {
    const hRes = await client.query(
      `SELECT id, claim_id FROM financial_claim_status_history
       WHERE claim_id = ANY($1::bigint[]) ORDER BY id`,
      [claimIds],
    );
    history = hRes.rows;
  }

  if (claimIds.length && (await tableExists(client, "notifications"))) {
    const nRes = await client.query(
      `SELECT id, type, title
       FROM notifications
       WHERE (metadata->>'claimId') = ANY($1::text[])
          OR type ILIKE 'financial_claim%'
             AND (
               message ILIKE '%(mobile QA)%'
               OR title ILIKE '%(mobile QA)%'
               OR (metadata->>'orderNumber') = ANY($2::text[])
             )
       ORDER BY id`,
      [claimIds.map(String), orderCodes.length ? orderCodes : ["__none__"]],
    );
    notifications = nRes.rows;
  }

  // QA user accounts — report only, never delete
  const qaUsersRes = await client.query(
    `SELECT id, email, role, is_active
     FROM users
     WHERE email IN ('qa.client@orderzhouse.test', 'qa.freelancer@orderzhouse.test')
     ORDER BY id`,
  );

  return {
    orders: ordersRes.rows,
    claims,
    bids,
    submissions,
    orderFiles,
    reviews,
    orderClaims,
    history,
    notifications,
    qaUsersPreserved: qaUsersRes.rows,
    ids: {
      orderIds,
      claimIds,
      bidIds: bids.map((b) => Number(b.id)),
      submissionIds: submissions.map((s) => Number(s.id)),
      fileIds: orderFiles.map((f) => Number(f.id)),
      reviewIds: reviews.map((r) => Number(r.id)),
      orderClaimIds: orderClaims.map((c) => Number(c.id)),
      historyIds: history.map((h) => Number(h.id)),
      notificationIds: notifications.map((n) => Number(n.id)),
    },
  };
}

function printReport(targets) {
  console.log("\n=== Mobile QA operational cleanup ===\n");
  console.log(`Env file: ${envFile}`);
  console.log(`Database: ${maskDatabaseTarget()}`);
  console.log(`Mode: ${isConfirm ? "DELETE (--confirm)" : "DRY-RUN (no changes)"}\n`);

  console.log(`QA pool orders to delete: ${targets.orders.length}`);
  for (const o of targets.orders) {
    console.log(`  - order #${o.id} ${o.order_code} | ${o.title} | ${o.order_status}`);
  }

  console.log(`\nFinancial claims to delete: ${targets.claims.length}`);
  for (const c of targets.claims) {
    console.log(
      `  - claim #${c.id} | ${c.order_number} | ${c.request_title} | ${c.status} | ${c.total_price_snapshot ?? "—"}`,
    );
  }

  console.log(`\nRelated work rows:`);
  console.log(`  bids: ${targets.bids.length}`);
  console.log(`  submissions: ${targets.submissions.length}`);
  console.log(`  order_files: ${targets.orderFiles.length}`);
  console.log(`  reviews: ${targets.reviews.length}`);
  console.log(`  order_claims: ${targets.orderClaims.length}`);
  console.log(`  claim status history: ${targets.history.length}`);
  console.log(`  matching notifications: ${targets.notifications.length}`);

  console.log(`\nUsers PRESERVED (not deleted): ${targets.qaUsersPreserved.length}`);
  for (const u of targets.qaUsersPreserved) {
    console.log(`  - user #${u.id} ${u.email}`);
  }

  if (!targets.orders.length && !targets.claims.length) {
    console.log("\nNothing matched mobile QA markers.");
  } else if (!isConfirm) {
    console.log("\nTo delete, re-run with --confirm");
  }
}

async function execute(client, ids) {
  const summary = {};

  async function del(label, sql, params) {
    const res = await client.query(sql, params);
    summary[label] = res.rowCount || 0;
  }

  async function delOptional(label, sql, params) {
    try {
      await client.query("SAVEPOINT qa_optional");
      const res = await client.query(sql, params);
      summary[label] = res.rowCount || 0;
      await client.query("RELEASE SAVEPOINT qa_optional");
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT qa_optional");
      summary[label] = "skipped";
    }
  }

  if (ids.notificationIds.length) {
    await del(
      "notifications",
      `DELETE FROM notifications WHERE id = ANY($1::bigint[])`,
      [ids.notificationIds],
    );
  }
  if (ids.historyIds.length) {
    await del(
      "financial_claim_status_history",
      `DELETE FROM financial_claim_status_history WHERE id = ANY($1::bigint[])`,
      [ids.historyIds],
    );
  }
  if (ids.claimIds.length) {
    if (await tableExists(client, "financial_claim_status_history")) {
      await del(
        "financial_claim_status_history_by_claim",
        `DELETE FROM financial_claim_status_history WHERE claim_id = ANY($1::bigint[])`,
        [ids.claimIds],
      );
    }
    if (await tableExists(client, "financial_freelancer_payments")) {
      await delOptional(
        "financial_freelancer_payment_allocations",
        `DELETE FROM financial_freelancer_payment_allocations
         WHERE payment_id IN (
           SELECT id FROM financial_freelancer_payments WHERE claim_id = ANY($1::bigint[])
         )`,
        [ids.claimIds],
      );
      await delOptional(
        "financial_freelancer_payments",
        `DELETE FROM financial_freelancer_payments WHERE claim_id = ANY($1::bigint[])`,
        [ids.claimIds],
      );
    }
    await del(
      "financial_claims",
      `DELETE FROM financial_claims WHERE id = ANY($1::bigint[])`,
      [ids.claimIds],
    );
  }

  if (ids.fileIds.length) {
    await del(`order_files`, `DELETE FROM order_files WHERE id = ANY($1::bigint[])`, [ids.fileIds]);
  }
  if (ids.submissionIds.length) {
    await del(
      "order_submissions",
      `DELETE FROM order_submissions WHERE id = ANY($1::bigint[])`,
      [ids.submissionIds],
    );
  }
  if (ids.bidIds.length) {
    await del(
      "order_freelancer_bids",
      `DELETE FROM order_freelancer_bids WHERE id = ANY($1::bigint[])`,
      [ids.bidIds],
    );
  }
  if (ids.reviewIds.length) {
    await del(
      "freelancer_reviews",
      `DELETE FROM freelancer_reviews WHERE id = ANY($1::bigint[])`,
      [ids.reviewIds],
    );
  }
  if (ids.orderClaimIds.length) {
    await del(
      "order_claims",
      `DELETE FROM order_claims WHERE id = ANY($1::bigint[])`,
      [ids.orderClaimIds],
    );
  }
  if (ids.orderIds.length) {
    await del(`orders`, `DELETE FROM orders WHERE id = ANY($1::bigint[])`, [ids.orderIds]);
  }

  return summary;
}

async function main() {
  const client = await pool.connect();
  try {
    const targets = await collect(client);
    printReport(targets);

    if (!isConfirm) return;

    if (!targets.orders.length && !targets.claims.length) {
      console.log("\nNo rows to delete.");
      return;
    }

    await client.query("BEGIN");
    const summary = await execute(client, targets.ids);
    await client.query("COMMIT");

    console.log("\n=== Deleted ===");
    for (const [k, v] of Object.entries(summary)) {
      console.log(`  ${k}: ${v}`);
    }

    const after = await collect(client);
    console.log(`\nRemaining QA orders: ${after.orders.length}`);
    console.log(`Remaining QA claims: ${after.claims.length}`);
    console.log(`Users still present: ${after.qaUsersPreserved.length}`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
