/**
 * Update test admin pool order(s) budget (default: 1 → 4 JOD).
 * Usage: node scripts/updateTestOrderBudget.js [--id=977] [--budget=4]
 */
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");

function parseArgs(argv) {
  let id = null;
  let budget = 4;
  for (const raw of argv.slice(2)) {
    const idM = /^--id=(.+)$/.exec(raw);
    const bM = /^--budget=(.+)$/.exec(raw);
    if (idM) id = Number(idM[1]);
    if (bM) budget = Number(bM[1]);
  }
  return { id, budget };
}

async function main() {
  const { id, budget } = parseArgs(process.argv);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error("Invalid --budget");
  }

  const budgetLabel = `${budget} دينار`;
  const sql = Number.isInteger(id) && id > 0
    ? `UPDATE orders
       SET budget = $1::numeric,
           title = REPLACE(title, '1 دينار', $2),
           description = REPLACE(description, '1 د.أ', $1::text || ' د.أ')
       WHERE id = $3::bigint
       RETURNING id, order_code, title, budget, is_open_for_pool, order_status`
    : `UPDATE orders
       SET budget = $1::numeric,
           title = REPLACE(title, '1 دينار', $2),
           description = REPLACE(description, '1 د.أ', $1::text || ' د.أ')
       WHERE budget = 1 AND title LIKE '%طلب تجريبي%'
       RETURNING id, order_code, title, budget, is_open_for_pool, order_status`;
  const queryParams =
    Number.isInteger(id) && id > 0 ? [budget, budgetLabel, id] : [budget, budgetLabel];

  const { rows } = await pool.query(sql, queryParams);

  if (!rows.length) {
    // eslint-disable-next-line no-console
    console.log("No matching orders updated.");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
