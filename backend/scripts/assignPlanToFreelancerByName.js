/**
 * Assigns an active plan subscription to a freelancer by full Arabic name (legacy users.role = freelancer).
 * Uses the same logic as admin API: ends current row, inserts assigned_not_started (eligible to take pool orders).
 *
 * Usage (from backend/):
 *   node scripts/assignPlanToFreelancerByName.js
 *   node scripts/assignPlanToFreelancerByName.js "محمد احمد ابراهيم"
 *   node scripts/assignPlanToFreelancerByName.js "محمد احمد ابراهيم" freelancer_starter
 *
 * Env: DATABASE_URL in backend/.env
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");
const subscriptionsService = require("../src/services/subscriptionsService");

function normalizeName(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fullNameAr(u) {
  return [u.first_name, u.father_name, u.family_name].filter(Boolean).join(" ").trim();
}

async function findFreelancerByDisplayName(targetRaw) {
  const target = normalizeName(targetRaw);
  const { rows } = await pool.query(
    `SELECT id, first_name, father_name, family_name, email, role
     FROM users
     WHERE role = 'freelancer'`,
  );
  const exact = rows.find((u) => normalizeName(fullNameAr(u)) === target);
  if (exact) return exact;
  const loose = rows.find((u) => normalizeName(fullNameAr(u)).includes(target) || target.includes(normalizeName(fullNameAr(u))));
  return loose || null;
}

async function resolvePlanId(planNameArg) {
  if (planNameArg) {
    const { rows } = await pool.query(
      `SELECT id FROM plans WHERE name = $1 AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`,
      [String(planNameArg).trim()],
    );
    if (rows[0]) return Number(rows[0].id);
    console.error(`Plan not found or inactive: ${planNameArg}`);
    process.exit(1);
  }
  const { rows } = await pool.query(
    `SELECT id, name FROM plans WHERE name = 'freelancer_starter' AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`,
  );
  if (rows[0]) return Number(rows[0].id);
  const { rows: anyPlan } = await pool.query(
    `SELECT id, name FROM plans WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY sort_order ASC, id ASC LIMIT 1`,
  );
  if (anyPlan[0]) {
    console.warn(`Using first active plan: ${anyPlan[0].name} (id=${anyPlan[0].id})`);
    return Number(anyPlan[0].id);
  }
  console.error("No active plans in database. Run migrations / seed plans.");
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  let planArg = null;
  let nameParts = argv;
  if (argv.length >= 2 && !argv[argv.length - 1].includes(" ")) {
    const last = argv[argv.length - 1];
    if (/^[a-z][a-z0-9_]*$/i.test(last) && last.includes("_")) {
      planArg = last;
      nameParts = argv.slice(0, -1);
    }
  }
  const displayName = nameParts.join(" ").trim() || "محمد احمد ابراهيم";

  const user = await findFreelancerByDisplayName(displayName);
  if (!user) {
    console.error(`No freelancer user matched: "${displayName}"`);
    const { rows: all } = await pool.query(
      `SELECT id, first_name, father_name, family_name, email FROM users WHERE role = 'freelancer' ORDER BY id`,
    );
    console.error("Freelancers in DB:");
    for (const r of all) {
      console.error(`  id=${r.id}  ${fullNameAr(r)}  <${r.email}>`);
    }
    process.exit(1);
  }

  const planId = await resolvePlanId(planArg);
  const full = fullNameAr(user);
  console.log(`Assigning plan_id=${planId} to freelancer id=${user.id} (${full})`);

  await subscriptionsService.assignPlanToFreelancer({
    actorUserId: null,
    freelancerUserId: String(user.id),
    planId: String(planId),
    notes: "assignPlanToFreelancerByName.js",
  });

  const check = await subscriptionsService.canFreelancerTakeOrders(String(user.id));
  console.log("canFreelancerTakeOrders:", check);
  console.log("Done.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
